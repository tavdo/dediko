import { randomUUID } from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';
import { db } from './db.js';
import { validateDocument, timezone, desiredSchedules } from './account-model.js';
import { HttpError } from './http.js';

export async function getAccount(userId) {
  const sql = db();
  await sql`insert into dediko.accounts(user_id) values (${userId}) on conflict do nothing`;
  const [row] = await sql`select document, revision, timezone from dediko.accounts where user_id = ${userId}`;
  return row;
}
function scheduleQueries(sql, userId, desired, writeId = null) {
  // The write_id predicate makes a losing compare-and-swap a complete no-op.
  const guard = writeId;
  const encoded = JSON.stringify(desired);
  return [
    sql`delete from dediko.schedules s where s.user_id = ${userId}
      and exists(select 1 from dediko.accounts a where a.user_id = ${userId} and (${guard}::uuid is null or a.write_id = ${guard}::uuid))
      and (not exists(select 1 from dediko.push_subscriptions p where p.user_id = ${userId})
        or not exists(select 1 from jsonb_to_recordset(${encoded}::jsonb) as x(reminder_id text) where x.reminder_id = s.reminder_id))`,
    sql`insert into dediko.schedules(user_id, reminder_id, signature, job_key, next_at)
      select ${userId}, x.reminder_id, x.signature, x.job_key, x.next_at
      from jsonb_to_recordset(${encoded}::jsonb) as x(reminder_id text, signature text, job_key uuid, next_at timestamptz)
      where exists(select 1 from dediko.accounts a where a.user_id = ${userId} and (${guard}::uuid is null or a.write_id = ${guard}::uuid))
        and exists(select 1 from dediko.push_subscriptions p where p.user_id = ${userId})
      on conflict(user_id, reminder_id) do update set signature = excluded.signature, job_key = excluded.job_key, next_at = excluded.next_at, queued = false
      where dediko.schedules.signature <> excluded.signature`
  ];
}
export async function putAccount(userId, input) {
  if (!input || !Number.isSafeInteger(input.revision) || input.revision < 0) throw new HttpError(400, 'არასწორი ვერსია.');
  const zone = timezone(input.timezone);
  const document = validateDocument(input.document, Temporal.Now.plainDateISO(zone).toString());
  const sql = db(), writeId = randomUUID();
  const results = await sql.transaction([
    sql`update dediko.accounts set document = ${JSON.stringify(document)}::jsonb, revision = revision + 1,
      timezone = ${zone}, write_id = ${writeId}::uuid, updated_at = now()
      where user_id = ${userId} and revision = ${input.revision} returning revision`,
    ...scheduleQueries(sql, userId, desiredSchedules(document, zone), writeId)
  ]);
  if (!results[0].length) throw new HttpError(409, 'მონაცემები სხვა ფანჯარაში შეიცვალა. შეინახე ასლი და ჩამოტვირთე ანგარიშის ახალი ვერსია.');
  return results[0][0].revision;
}
export async function refreshSchedules(userId) {
  const sql = db();
  const row = await getAccount(userId);
  if (!row.document) return;
  // Revision/write_id guards prevent an older read from replacing newer schedules.
  const [current] = await sql`select write_id from dediko.accounts where user_id = ${userId} and revision = ${row.revision}`;
  if (current) await sql.transaction([
    sql`select user_id from dediko.accounts where user_id = ${userId} for update`,
    ...scheduleQueries(sql, userId, desiredSchedules(row.document, row.timezone), current.write_id)
  ]);
}
