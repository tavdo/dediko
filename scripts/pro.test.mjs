import test from 'node:test';
import assert from 'node:assert/strict';
import { trialStatus, startProTrial, weekStart, shiftDate, weeklyTemplate, migrateProState, remindersToCalendar } from '../pro.js';

test('trial ends exactly at seven days and cannot be restarted after expiry or cancellation', () => {
  const now = Date.parse('2026-11-06T10:00:00Z');
  const trial = startProTrial(null, now);
  assert.equal(trialStatus(trial, now).active, true);
  assert.equal(trialStatus(trial, now + 7 * 86400000).active, false);
  assert.equal(trialStatus(trial, now - 1).active, false);
  assert.equal(trialStatus({...trial, cancelled:true}, now).active, false);
  assert.deepEqual(startProTrial(trial, now + 8 * 86400000), trial);
  assert.equal(trialStatus({used:true, startedAt:'invalid', endsAt:'invalid'}).active, false);
});
test('Monday-based plans handle Sunday and year changes; stages have separate tasks', () => {
  assert.equal(weekStart('2027-01-03'), '2026-12-28');
  assert.equal(shiftDate('2026-12-28', 7), '2027-01-04');
  const pregnancy = weeklyTemplate('pregnant', '2026-11-02');
  const mother = weeklyTemplate('mother', '2026-11-02');
  assert.ok(pregnancy.every(task => !mother.some(other => other.id === task.id)));
  assert.ok(pregnancy.every(task => weekStart(task.date) === task.week));
});
test('existing profiles retain content and get empty Pro state', () => {
  const data = {profile:{name:'ანა'}, reminders:[{id:'existing'}], completedLessons:['video']};
  const migrated = migrateProState(data);
  assert.deepEqual(migrated.reminders, data.reminders);
  assert.deepEqual(migrated.completedLessons, data.completedLessons);
  assert.equal(migrated.pro, null);
  assert.deepEqual(migrated.plannerTasks, []);
});
test('calendar export escapes injection, preserves recurrence, and folds Georgian UTF-8 lines', () => {
  const reminders = [{id:'test',enabled:true,date:'2026-11-06',time:'10:30',repeat:'weekly',title:'ვიზიტი, ექიმთან; ' + 'შეხსენება'.repeat(20) + '\nBEGIN:VEVENT'}];
  const calendar = remindersToCalendar(reminders, new Date('2026-11-06T08:00:00Z'));
  assert.match(calendar, /RRULE:FREQ=WEEKLY/);
  assert.match(calendar, /DTSTART:20261106T103000/);
  assert.equal(calendar.match(/(?:^|\r\n)BEGIN:VEVENT/g).length, 1);
  assert.ok(calendar.includes('\\nBEGIN:VEVENT'));
  assert.ok(calendar.split('\r\n').every(line => Buffer.byteLength(line, 'utf8') <= 75));
  assert.equal((remindersToCalendar([{...reminders[0],enabled:false}]).match(/BEGIN:VEVENT/g) || []).length, 0);
});
