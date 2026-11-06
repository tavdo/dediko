// Exercises the deployed producer → Queue → authenticated callback → Postgres flow.
// No device subscription is created and no phone notification is sent.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../server/db.js';
process.loadEnvFile('.env.local');
const origin = process.argv[2] || 'https://dediko.vercel.app';
const userId = `queue-check-${randomUUID()}`, jobKey = randomUUID(), sql = db();
try {
  await sql`insert into dediko.accounts(user_id, document) values(${userId}, ${JSON.stringify({version:1,profile:{name:'Queue integration check',stage:'pregnant',referenceDate:'2027-06-01'},reminders:[]})}::jsonb)`;
  await sql`insert into dediko.schedules(user_id,reminder_id,signature,job_key,next_at) values(${userId},'queue-check','queue-check',${jobKey}::uuid,${new Date(Date.now()+5000).toISOString()}::timestamptz)`;
  const response=await fetch(`${origin}/api/reminder-recovery`,{headers:{authorization:`Bearer ${process.env.CRON_SECRET}`}});
  assert.equal(response.status,200,`Queue producer HTTP ${response.status}`);
  const result=await response.json();assert.ok(result.recovered>=1,'Fixture was not published');
  console.log('Published a temporary delayed reminder through the deployed recovery producer.');
  const start=Date.now();let consumed=false;
  while(Date.now()-start<50000){
    const rows=await sql`select queued from dediko.schedules where user_id=${userId}`;
    if(!rows.length){consumed=true;break;}
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  assert.ok(consumed,'The deployed Queue callback did not consume the reminder within 50 seconds.');
  console.log('PASS: deployed Queue delayed delivery invoked the worker and completed the database job with the site closed. No push transport was exercised.');
} finally {await sql`delete from dediko.accounts where user_id=${userId}`;console.log('Cleaned the temporary Queue fixture.');}
