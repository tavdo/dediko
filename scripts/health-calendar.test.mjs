import test from 'node:test';
import assert from 'node:assert/strict';
import { healthEntry, syncHealthReminders } from '../health-calendar.js';
import { desiredSchedules, validateDocument } from '../server/account-model.js';

const pregnancy = { name:'ანა', stage:'pregnant', referenceDate:'2027-06-01' };
const motherhood = { name:'ანა', stage:'mother', referenceDate:'2024-12-31' };
const document = (profile, reminders = []) => ({ version:1, profile, reminders });

test('all eight antenatal dates are calculated from the 40-week due date', () => {
  const reminders = syncHealthReminders(pregnancy, []);
  assert.deepEqual(reminders.map(r => r.date), [
    '2026-11-17', '2026-12-29', '2027-02-23', '2027-03-23',
    '2027-04-20', '2027-05-04', '2027-05-18', '2027-06-01'
  ]);
  assert.deepEqual(reminders.map(r => healthEntry(r.id).details.length), [8, 2, 5, 3, 2, 5, 2, 2]);
  const midWindow = syncHealthReminders(pregnancy, [], '2027-01-05');
  assert.equal(midWindow[1].date, '2027-01-05');
  assert.equal(midWindow[1].calendarDate, '2026-12-29');
  assert.strictEqual(syncHealthReminders(pregnancy, midWindow, '2027-01-06'), midWindow);
});

test('newborn and later vaccine dates follow calendar ages for either sex', () => {
  const reminders = syncHealthReminders({ ...motherhood, childSex:'female' }, []);
  assert.deepEqual(reminders, syncHealthReminders({ ...motherhood, childSex:'male' }, []));
  assert.deepEqual(reminders, syncHealthReminders(motherhood, []));
  const dates = Object.fromEntries(reminders.map(r => [r.id, r.date]));
  assert.equal(dates['health-vaccine-hep-b'], '2024-12-31');
  assert.equal(dates['health-vaccine-bcg'], '2025-01-01');
  assert.equal(dates['health-vaccine-2m'], '2025-02-28');
  assert.equal(dates['health-vaccine-4m'], '2025-04-30');
  assert.equal(dates['health-vaccine-18m'], '2026-06-30');
  assert.equal(dates['health-vaccine-5y'], '2029-12-31');
  assert.equal(dates['health-vaccine-14y'], '2038-12-31');
  assert.equal(dates['health-vaccine-hpv-1'], '2034-12-31');
  assert.ok(!dates['health-vaccine-hpv-2']);
  const scheduled = desiredSchedules(document(motherhood, reminders), 'Asia/Tbilisi', Date.parse('2024-12-30T00:00Z'));
  assert.ok(!scheduled.some(r => r.reminder_id === 'health-vaccine-hep-b'));
  assert.equal(scheduled.find(r => r.reminder_id === 'health-vaccine-bcg').next_at, '2025-01-01T06:00:00.000Z');
});

test('the HPV second dose starts six calendar months after the recorded first dose', () => {
  const input = document({ ...motherhood, childSex:'male', hpvFirstDose:'2035-08-31' });
  const validated = validateDocument(input, '2035-09-01');
  const [first, second] = validated.reminders.filter(r => r.id.startsWith('health-vaccine-hpv'));
  assert.equal(first.date, '2035-08-31');
  assert.deepEqual(first.completed, ['2035-08-31']);
  assert.equal(second.date, '2036-02-29');
  second.date = '2036-02-28';
  assert.equal(validateDocument(validated).reminders.find(r => r.id === second.id).date, '2036-02-29');
  assert.throws(() => validateDocument(input, '2035-08-30'), { status:400 });
  assert.throws(() => validateDocument(document({ ...motherhood, hpvFirstDose:'2025-01-01' })), { status:400 });
  const cleared = validateDocument(document(motherhood, validated.reminders));
  assert.ok(!cleared.reminders.some(r => r.id === second.id));
});

test('profile corrections preserve personal reminders and only recalculate dates tied to the profile', () => {
  const personal = { id:'personal', title:'პირადი', category:'other', date:'2027-01-02', time:'12:00', repeat:'none', enabled:true, automatic:false, completed:[] };
  const existing = validateDocument(document(pregnancy, [personal]));
  Object.assign(existing.reminders[1], { date:'2026-11-19', time:'12:30', enabled:false });
  assert.equal(validateDocument(existing).reminders[1].date, '2026-11-19');
  const updated = validateDocument({ ...existing, profile:{ ...pregnancy, referenceDate:'2027-06-02' } });
  assert.deepEqual(updated.reminders[0], personal);
  assert.equal(updated.reminders[1].date, '2026-11-18');
  assert.equal(updated.reminders[1].time, '12:30');
  assert.equal(updated.reminders[1].enabled, false);
  const switched = validateDocument({ ...updated, profile:motherhood });
  assert.ok(switched.reminders.some(r => r.id === 'health-visit-1'));
  const schedules = desiredSchedules(switched, 'Asia/Tbilisi', Date.parse('2024-12-30T00:00Z'));
  assert.ok(!schedules.some(r => r.reminder_id.startsWith('health-visit-')));
});
