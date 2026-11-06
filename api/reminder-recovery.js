import { timingSafeEqual } from 'node:crypto';
import { api, json, HttpError } from '../server/http.js';
import { flushSchedules } from '../server/push.js';
import { db } from '../server/db.js';
export const GET = api(async request => {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ''}`), actual = Buffer.from(request.headers.get('authorization') || '');
  if (!process.env.CRON_SECRET || expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new HttpError(401, 'Unauthorized');
  // Recover jobs whose Queue message expired or whose producer was interrupted.
  // The worker skips late delivery and advances recurrence instead of flooding a device.
  await db()`update dediko.schedules set queued = false where queued and next_at < now() - interval '1 hour'`;
  const recovered = await flushSchedules();
  await db()`delete from dediko.push_deliveries where created_at < now() - interval '30 days'`;
  return json({ recovered });
});
