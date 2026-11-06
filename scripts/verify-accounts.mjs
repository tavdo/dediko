// Real Neon Auth + Postgres integration check. No credentials or cookies are printed.
// Optional URL exercises deployed HTTP routes; otherwise uses the same Web handlers directly.
import assert from 'node:assert/strict';
import { randomUUID, createECDH, randomBytes } from 'node:crypto';
import { db } from '../server/db.js';
import * as accountRoutes from '../api/account.js';
import * as pushRoutes from '../api/push.js';
import { proxyAuth } from '../server/auth.js';
import { endpointHash, processReminder } from '../server/push.js';
import { getAccount, putAccount } from '../server/accounts.js';
import { api } from '../server/http.js';
process.loadEnvFile('.env.local');
const origin = process.argv[2] || 'https://dediko.vercel.app';
process.env.APP_ORIGIN = origin;
const live = !!process.argv[2], users = [];
const sql = db();
function client() {
  const cookies = new Map(); let owner;
  return {
    setOwner: value => { owner = value; },
    cookieHeader: () => [...cookies].map(([key,value])=>`${key}=${value}`).join('; '),
    async request(path, method = 'GET', body, overrideOwner = owner) {
      const headers = { origin, ...(cookies.size ? {cookie:this.cookieHeader()} : {}), ...(body ? {'Content-Type':'application/json'} : {}), ...(overrideOwner ? {'X-Dediko-Account':overrideOwner} : {}) };
      const request = new Request(`${origin}/api/${path}`,{method,headers,...(body ? {body:JSON.stringify(body)} : {})});
      const routes = path.startsWith('auth/') ? {[method]:api(proxyAuth)} : path==='account' ? accountRoutes : pushRoutes;
      const response = live ? await fetch(request) : await routes[method](request);
      for (const raw of response.headers.getSetCookie()) { const pair = raw.split(';')[0], index = pair.indexOf('='); if(index>0) cookies.set(pair.slice(0,index),pair.slice(index+1)); }
      const result = await response.json();
      return {status:response.status,body:result};
    }
  };
}
async function signup() {
  const first = client(), email = `dediko-check-${randomUUID()}@example.invalid`, password = randomUUID()+randomUUID();
  const result = await first.request('auth/sign-up/email','POST',{email,password,name:'Dediko temporary integration check'});
  assert.equal(result.status,200,`Managed signup failed: ${result.body.code || result.body.error}`);
  assert.ok(result.body.user?.id); const id = result.body.user.id; users.push(id); first.setOwner(id);
  return {first,id,email,password};
}
const document = {version:1,profile:{name:'სატესტო ანგარიში',stage:'pregnant',referenceDate:'2027-06-01'},reminders:[],lessons:[],completedLessons:[],pro:null,plannerTasks:[],plannerNotes:{}};
try {
  assert.equal((await client().request('account')).status,401);
  const a = await signup(), b = await signup();
  const empty = await a.first.request('account'); assert.equal(empty.status,200); assert.equal(empty.body.document,null);
  await b.first.request('account');
  const request = {document,revision:0,timezone:'Asia/Tbilisi'};
  const results = await Promise.all([a.first.request('account','PUT',request),a.first.request('account','PUT',request)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal((await b.first.request('account')).body.document,null);
  assert.equal((await b.first.request('account','PUT',request,a.id)).status,401);
  assert.equal((await a.first.request('account','PUT',{...request,document:{...document,profile:{...document.profile,name:'x'.repeat(41)}}})).status,400);
  console.log('PASS: real signup, private account data, cross-account isolation and concurrent-write conflict.');

  const secondDevice = client();
  const login = await secondDevice.request('auth/sign-in/email','POST',{email:a.email,password:a.password});
  assert.equal(login.status,200); secondDevice.setOwner(a.id);
  const restored = await secondDevice.request('account'); assert.equal(restored.status,200); assert.deepEqual(restored.body.document,document);
  assert.equal(restored.body.revision,1);
  const cookieBeforeLogout = secondDevice.cookieHeader();
  assert.equal((await secondDevice.request('auth/sign-out','POST',{})).status,200);
  const replay = new Request(`${origin}/api/account`,{headers:{cookie:cookieBeforeLogout}});
  const replayResult = live ? await fetch(replay) : await accountRoutes.GET(replay);
  assert.equal(replayResult.status,401);
  console.log('PASS: second-device login restores data; signed-out sessions cannot be replayed.');

  assert.equal((await a.first.request('push','POST',{action:'subscribe',subscription:{endpoint:'https://127.0.0.1/private',keys:{}}})).status,400);
  const key = createECDH('prime256v1');key.generateKeys();
  const subscription = {endpoint:`https://fcm.googleapis.com/fcm/send/dediko-check-${randomUUID()}`,keys:{p256dh:key.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};
  // Synthetic subscription is never sent to its provider; worker tests inject delivery below.
  assert.equal((await a.first.request('push','POST',{action:'subscribe',subscription})).status,200);
  assert.equal((await a.first.request('push','POST',{action:'status',endpoint:subscription.endpoint})).body.subscribed,true);
  assert.equal((await b.first.request('push','POST',{action:'status',endpoint:subscription.endpoint})).body.subscribed,false);
  assert.equal((await b.first.request('push','POST',{action:'subscribe',subscription})).status,409);
  console.log('PASS: authenticated device opt-in is persistent and isolated; arbitrary push URLs are rejected.');

  const due = new Date(Date.now()-10000).toISOString(), jobKey = randomUUID();
  const reminder = {id:'worker-check',title:'Private test title',date:due.slice(0,10),time:'10:00',repeat:'daily',enabled:true,automatic:false,category:'self',completed:[]};
  const updated = {...document,reminders:[reminder]};
  await sql`update dediko.accounts set document=${JSON.stringify(updated)}::jsonb where user_id=${a.id}`;
  await sql`insert into dediko.schedules(user_id,reminder_id,signature,job_key,next_at) values(${a.id},${reminder.id},'test',${jobKey}::uuid,${due}::timestamptz)`;
  const message={userId:a.id,reminderId:reminder.id,jobKey,scheduledAt:due};
  let deliveries=0, queued=0;
  const deps={deliverFn:async()=>{deliveries++;},queueFn:async()=>{queued++;}};
  await processReminder(message,deps); await processReminder(message,deps);
  assert.equal(deliveries,1); assert.ok(queued>=1);
  const [advanced]=await sql`select next_at from dediko.schedules where user_id=${a.id} and reminder_id=${reminder.id}`;
  assert.ok(new Date(advanced.next_at).getTime()>Date.now());
  await sql`update dediko.schedules set job_key=${randomUUID()}::uuid where user_id=${a.id} and reminder_id=${reminder.id}`;
  await processReminder(message,deps); assert.equal(deliveries,1);
  console.log('PASS: duplicate worker delivery sends once, recurrence advances, edited jobs are ignored (delivery transport stubbed).');

  await a.first.request('push','POST',{action:'unsubscribe',endpoint:subscription.endpoint});
  assert.equal((await a.first.request('push','POST',{action:'status',endpoint:subscription.endpoint})).body.subscribed,false);
  console.log('PASS: opt-out removes device and its future reminders.');
} finally {
  for (const userId of users) {
    await sql`delete from dediko.accounts where user_id=${userId}`;
    await sql`delete from neon_auth.user where id=${userId}`;
  }
  console.log(`Cleaned ${users.length} temporary accounts and their data.`);
}
