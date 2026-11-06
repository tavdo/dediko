import { createHash } from 'node:crypto';
import * as webpush from 'web-push';
import { send } from '@vercel/queue';
import { db } from './db.js';
import { nextTime } from './account-model.js';
import { HttpError } from './http.js';

export const topic = 'dediko-reminders';
export const endpointHash = endpoint => createHash('sha256').update(endpoint).digest('hex');
export function validateSubscription(value) {
  let url;
  try { url = new URL(value.endpoint); } catch { throw new HttpError(400, 'არასწორი მოწყობილობა.'); }
  const allowed = ['fcm.googleapis.com', 'web.push.apple.com', 'push.services.mozilla.com', 'notify.windows.com'];
  if (url.protocol !== 'https:' || url.username || url.password || url.port || value.endpoint.length > 3000 || !allowed.some(host => url.hostname === host || url.hostname.endsWith('.' + host))) throw new HttpError(400, 'შეტყობინებების ეს სერვისი მხარდაჭერილი არ არის.');
  if (!/^[\w-]+$/.test(value.keys?.p256dh || '') || !/^[\w-]+$/.test(value.keys?.auth || '') || Buffer.from(value.keys.p256dh, 'base64url').length !== 65 || Buffer.from(value.keys.auth, 'base64url').length !== 16) throw new HttpError(400, 'მოწყობილობის გასაღებები არასწორია.');
  return { endpoint: url.href, keys: { p256dh: value.keys.p256dh, auth: value.keys.auth } };
}
export async function deliver(subscription, occurrence, test = false) {
  return webpush.sendNotification(subscription, JSON.stringify({ title: 'Dediko ♡', body: test ? 'შეტყობინებები მზადაა — შენთან ვართ ♡' : 'შენი პატარა გეგმის დროა. გახსენი Dediko და ნახე შეხსენება.', tag: occurrence, url: '/?page=reminders' }), {
    vapidDetails: { subject: process.env.VAPID_SUBJECT, publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY },
    TTL: test ? 300 : 3600, urgency: 'normal', timeout: 15000
  });
}
export async function queueSchedule(row) {
  const target = new Date(row.next_at).getTime();
  const remaining = Math.max(0, target - Date.now());
  const chunk = 5 * 86400;
  await send(topic, { userId: row.user_id, reminderId: row.reminder_id, jobKey: row.job_key, scheduledAt: new Date(target).toISOString() }, {
    region: 'iad1', delaySeconds: Math.min(chunk, Math.ceil(remaining / 1000)), retentionSeconds: 7 * 86400,
    idempotencyKey: `${row.job_key}:${target}:${Math.ceil(remaining / (chunk * 1000))}`
  });
  await db()`update dediko.schedules set queued = true where user_id = ${row.user_id} and reminder_id = ${row.reminder_id} and job_key = ${row.job_key}::uuid and next_at = ${row.next_at}`;
}
export async function flushSchedules(userId = null) {
  const sql = db();
  const rows = await sql`select * from dediko.schedules where not queued and (${userId}::text is null or user_id = ${userId}) order by next_at limit 100`;
  for (const row of rows) await queueSchedule(row);
  return rows.length;
}
export async function processReminder(message, { deliverFn = deliver, queueFn = queueSchedule } = {}) {
  const sql = db();
  const [row] = await sql`select s.*, a.document, a.timezone from dediko.schedules s join dediko.accounts a using(user_id)
    where s.user_id = ${message.userId} and s.reminder_id = ${message.reminderId} and s.job_key = ${message.jobKey}::uuid`;
  if (!row) return; // Deleted, edited, completed, or already advanced.
  if (new Date(row.next_at).toISOString() !== message.scheduledAt) { if (!row.queued) await queueFn(row); return; }
  const due = new Date(row.next_at).getTime();
  if (due > Date.now() + 1000) { await queueFn(row); return; }
  const occurrence = `${row.job_key}:${due}`;
  const devices = await sql`select endpoint_hash, subscription from dediko.push_subscriptions where user_id = ${row.user_id}`;
  // Do not deliver a stale reminder after a long outage; advance recurring jobs.
  if (Date.now() - due < 3600000) for (const device of devices) {
    const [claim] = await sql`insert into dediko.push_deliveries(endpoint_hash, occurrence, status, lease_until)
      values(${device.endpoint_hash}, ${occurrence}, 'sending', now() + interval '2 minutes')
      on conflict(endpoint_hash, occurrence) do update set lease_until = excluded.lease_until
      where dediko.push_deliveries.status = 'sending' and dediko.push_deliveries.lease_until < now() returning status`;
    if (!claim) {
      const [existing] = await sql`select status from dediko.push_deliveries where endpoint_hash = ${device.endpoint_hash} and occurrence = ${occurrence}`;
      if (existing?.status === 'sending') throw new Error('Delivery in progress');
      continue;
    }
    try {
      await deliverFn(device.subscription, occurrence);
      await sql`update dediko.push_deliveries set status = 'sent' where endpoint_hash = ${device.endpoint_hash} and occurrence = ${occurrence}`;
    } catch (error) {
      if ([404, 410].includes(error.statusCode)) await sql`delete from dediko.push_subscriptions where endpoint_hash = ${device.endpoint_hash}`;
      else {
        await sql`delete from dediko.push_deliveries where endpoint_hash = ${device.endpoint_hash} and occurrence = ${occurrence} and status = 'sending'`;
        throw new Error('Push provider temporarily unavailable');
      }
    }
  }
  const reminder = row.document.reminders.find(r => r.id === row.reminder_id);
  const next = reminder ? nextTime(reminder, row.timezone, Math.max(Date.now(), due + 1000)) : null;
  if (next && devices.length) {
    const [advanced] = await sql`update dediko.schedules set next_at = ${next}::timestamptz, queued = false
      where user_id = ${row.user_id} and reminder_id = ${row.reminder_id} and job_key = ${row.job_key}::uuid and next_at = ${row.next_at} returning *`;
    if (advanced) await queueFn(advanced);
  } else await sql`delete from dediko.schedules where user_id = ${row.user_id} and reminder_id = ${row.reminder_id} and job_key = ${row.job_key}::uuid and next_at = ${row.next_at}`;
}
