import { timingSafeEqual } from 'node:crypto';
import { api, json, HttpError } from '../server/http.js';
import { flushSchedules } from '../server/push.js';
import { db } from '../server/db.js';
export const GET = api(async request => {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ''}`), actual = Buffer.from(request.headers.get('authorization') || '');
  if (!process.env.CRON_SECRET || expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new HttpError(401, 'Unauthorized');
  const recovered = await flushSchedules();
  await db()`delete from dediko.push_deliveries where created_at < now() - interval '30 days'`;
  return json({ recovered });
});
