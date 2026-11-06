import test from 'node:test';
import assert from 'node:assert/strict';
import { nextTime, desiredSchedules, validateDocument, timezone } from '../server/account-model.js';
import { validateSubscription } from '../server/push.js';
import { sameOrigin, bodyJSON } from '../server/http.js';
import { proxyAuth } from '../server/auth.js';
import { createECDH, randomBytes } from 'node:crypto';

const reminder = fields => ({ id:'test', title:'ზრუნვა', date:'2026-11-07', time:'10:00', repeat:'none', category:'self', automatic:false, completed:[], enabled:true, ...fields });
const document = reminders => ({version:1,profile:{name:'ანა',stage:'pregnant',referenceDate:'2027-01-01'}, reminders,lessons:[],completedLessons:[],pro:null,plannerTasks:[],plannerNotes:{}});
test('one-time reminders use the account timezone and never replay old or completed events', () => {
  assert.equal(nextTime(reminder(), 'Asia/Tbilisi', Date.parse('2026-11-07T05:00Z')), '2026-11-07T06:00:00.000Z');
  assert.equal(nextTime(reminder(), 'Asia/Tbilisi', Date.parse('2026-11-07T06:00Z')), null);
  assert.equal(nextTime(reminder({completed:['2026-11-07']}), 'Asia/Tbilisi', Date.parse('2026-11-07T05:00Z')), null);
  assert.equal(nextTime(reminder({enabled:false}), 'Asia/Tbilisi'), null);
});
test('daily and weekly recurrence skip completed dates and preserve local time across DST', () => {
  assert.equal(nextTime(reminder({repeat:'daily',completed:['2026-11-07']}), 'Asia/Tbilisi', Date.parse('2026-11-07T05:00Z')), '2026-11-08T06:00:00.000Z');
  assert.equal(nextTime(reminder({date:'2026-10-31',repeat:'weekly'}), 'Asia/Tbilisi', Date.parse('2026-11-07T07:00Z')), '2026-11-14T06:00:00.000Z');
  assert.equal(nextTime(reminder({date:'2026-03-07',time:'02:30',repeat:'daily'}), 'America/New_York', Date.parse('2026-03-08T00:00Z')), '2026-03-08T07:30:00.000Z');
  assert.equal(nextTime(reminder({date:'2026-03-07',time:'02:30',repeat:'daily'}), 'America/New_York', Date.parse('2026-03-08T08:00Z')), '2026-03-09T06:30:00.000Z');
  assert.equal(nextTime(reminder({date:'2026-10-31',time:'01:30',repeat:'daily'}), 'America/New_York', Date.parse('2026-11-01T06:00Z')), '2026-11-02T06:30:00.000Z');
});
test('stage changes drop old automatic schedules while personal reminders survive', () => {
  const doc = document([reminder({id:'mother',automatic:true,stage:'mother'}),reminder({id:'pregnant',automatic:true,stage:'pregnant'}),reminder()]);
  const first = desiredSchedules(doc, 'Asia/Tbilisi', Date.parse('2026-11-07T05:00Z'));
  assert.deepEqual(first.map(r => r.reminder_id), ['pregnant','test']);
  const second = desiredSchedules({...doc,profile:{...doc.profile,stage:'mother'}}, 'Asia/Tbilisi', Date.parse('2026-11-07T05:00Z'));
  assert.deepEqual(second.map(r => r.reminder_id), ['mother','test']);
  assert.notEqual(first[1].signature,second[1].signature);
});
test('validation rejects malformed dates, duplicate IDs, excessive data and invalid video URLs', () => {
  assert.equal(validateDocument(document([reminder()])).reminders[0].title,'ზრუნვა');
  assert.throws(()=>validateDocument(document([reminder({date:'2026-02-30'})])));
  assert.throws(()=>validateDocument(document([reminder(),reminder()])));
  assert.throws(()=>validateDocument(document([reminder({time:'25:00'})])));
  assert.throws(()=>validateDocument({...document([]),lessons:[{url:'javascript:alert(1)'}]}));
  assert.throws(()=>validateDocument(document(Array.from({length:101},(_,i)=>reminder({id:String(i)})))));
  assert.throws(()=>timezone('Invalid/Zone'));
});
test('push endpoints cannot target arbitrary hosts, local addresses or spoofed suffixes', () => {
  const key = createECDH('prime256v1');key.generateKeys();
  const subscription = {endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:key.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};
  assert.deepEqual(validateSubscription(subscription),subscription);
  for (const endpoint of ['http://fcm.googleapis.com/test','https://localhost/test','https://fcm.googleapis.com.evil.test/x','https://fcm.googleapis.com:444/x','https://user:pass@fcm.googleapis.com/x']) assert.throws(()=>validateSubscription({...subscription,endpoint}));
  assert.throws(()=>validateSubscription({...subscription,keys:{p256dh:'x',auth:'y'}}));
});
test('API boundary rejects cross-origin writes, oversized streamed JSON and administrative auth paths', async () => {
  assert.throws(()=>sameOrigin(new Request('https://dediko.vercel.app/api/account',{headers:{origin:'https://evil.test'}})));
  sameOrigin(new Request('https://dediko.vercel.app/api/account',{headers:{origin:'https://dediko.vercel.app'}}));
  await assert.rejects(()=>bodyJSON(new Request('https://dediko.vercel.app',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:'x'.repeat(100)})}),20),{status:413});
  await assert.rejects(()=>proxyAuth(new Request('https://dediko.vercel.app/api/auth/admin/list-users')),{status:404});
});
