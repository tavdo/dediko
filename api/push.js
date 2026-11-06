import { api, json, bodyJSON, sameOrigin, HttpError } from '../server/http.js';
import { sessionFor, withCookies } from '../server/auth.js';
import { db } from '../server/db.js';
import { getAccount, refreshSchedules } from '../server/accounts.js';
import { validateSubscription, endpointHash, flushSchedules, deliver } from '../server/push.js';

export const POST = api(async request => {
  sameOrigin(request);
  const { user, cookies } = await sessionFor(request);
  const body = await bodyJSON(request, 6000), sql = db();
  await getAccount(user.id);
  if (body.action === 'subscribe') {
    const subscription = validateSubscription(body.subscription), hash = endpointHash(subscription.endpoint);
    const [row] = await sql`insert into dediko.push_subscriptions(endpoint_hash, user_id, subscription)
      select ${hash}, ${user.id}, ${JSON.stringify(subscription)}::jsonb
      where (select count(*) from dediko.push_subscriptions where user_id = ${user.id}) < 10
      on conflict(endpoint_hash) do update set subscription = excluded.subscription where dediko.push_subscriptions.user_id = excluded.user_id returning endpoint_hash`;
    if (!row) throw new HttpError(409, 'მოწყობილობა სხვა ანგარიშს ეკუთვნის ან 10 მოწყობილობის ლიმიტი ამოწურულია. გამორთე შეტყობინებები და თავიდან ჩართე.');
    await refreshSchedules(user.id);
    let scheduled = true;
    try { await flushSchedules(user.id); } catch { scheduled = false; }
    return withCookies(json({ subscribed: true, scheduled }), cookies);
  }
  if (typeof body.endpoint !== 'string') throw new HttpError(400, 'მოწყობილობა ვერ მოიძებნა.');
  const hash = endpointHash(body.endpoint);
  if (body.action === 'unsubscribe') {
    await sql`delete from dediko.push_subscriptions where endpoint_hash = ${hash} and user_id = ${user.id}`;
    await sql`delete from dediko.schedules where user_id = ${user.id} and not exists(select 1 from dediko.push_subscriptions where user_id = ${user.id})`;
    return withCookies(json({ subscribed: false }), cookies);
  }
  if (body.action === 'status') {
    const [row] = await sql`select endpoint_hash from dediko.push_subscriptions where endpoint_hash = ${hash} and user_id = ${user.id}`;
    const [pending] = await sql`select count(*)::integer as count from dediko.schedules where user_id = ${user.id} and not queued`;
    return withCookies(json({ subscribed: !!row, pending: pending.count }), cookies);
  }
  if (body.action === 'retry') { await flushSchedules(user.id); return withCookies(json({ scheduled: true }), cookies); }
  if (body.action !== 'test') throw new HttpError(400, 'უცნობი მოქმედება.');
  const [row] = await sql`update dediko.push_subscriptions set last_test_at = now() where endpoint_hash = ${hash} and user_id = ${user.id}
    and (last_test_at is null or last_test_at < now() - interval '1 minute') returning subscription`;
  if (!row) throw new HttpError(429, 'ჯერ ჩართე შეტყობინებები ან ტესტამდე ერთი წუთი დაელოდე.');
  try { await deliver(row.subscription, `test-${Date.now()}`, true); }
  catch (error) {
    if ([404, 410].includes(error.statusCode)) { await sql`delete from dediko.push_subscriptions where endpoint_hash = ${hash} and user_id = ${user.id}`; throw new HttpError(410, 'მოწყობილობის კავშირი ვადაგასულია. თავიდან ჩართე შეტყობინებები.'); }
    throw new HttpError(503, 'შეტყობინებების სერვისმა გაგზავნა ვერ შეძლო.');
  }
  return withCookies(json({ sent: true }), cookies);
});
