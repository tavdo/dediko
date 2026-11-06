import test from 'node:test';
import assert from 'node:assert/strict';
import { isDueOn, nextOccurrence, completionKey, suggestedReminders } from '../model.js';

test('weekly reminders keep their weekday across a month boundary', () => {
  const reminder = { date: '2026-10-30', repeat: 'weekly' };
  assert.equal(isDueOn(reminder, '2026-11-06'), true);
  assert.equal(isDueOn(reminder, '2026-11-05'), false);
  assert.equal(nextOccurrence(reminder, '2026-11-07'), '2026-11-13');
});
test('future reminders are not moved back to today', () => {
  assert.equal(nextOccurrence({ date: '2026-12-01', repeat: 'daily' }, '2026-11-06'), '2026-12-01');
});
test('completion applies to an occurrence, not every future repetition', () => {
  const reminder = { date: '2026-11-01', repeat: 'daily' };
  assert.notEqual(completionKey(reminder, '2026-11-06'), completionKey(reminder, '2026-11-07'));
  assert.equal(completionKey({ ...reminder, repeat: 'none' }, '2026-11-06'), '2026-11-01');
});
test('switching stage offers distinct relevant reminders', () => {
  const pregnancy = suggestedReminders('pregnant');
  const mother = suggestedReminders('mother');
  assert.ok(pregnancy.every(r => r.stage === 'pregnant'));
  assert.ok(mother.every(r => r.stage === 'mother'));
  assert.ok(!pregnancy.some(r => mother.some(m => m.id === r.id)));
});
