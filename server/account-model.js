import { Temporal } from '@js-temporal/polyfill';
import { createHash, randomUUID } from 'node:crypto';
import { HttpError } from './http.js';
import { parseVideoUrl, lessonCategories } from '../lessons.js';
import { childSexes, healthEntry, hpvMinimumDate, isBirthDose, syncHealthReminders } from '../health-calendar.js';

const fail = () => { throw new HttpError(400, 'მონაცემები არასწორია ან დასაშვებ ზომას აღემატება.'); };
function text(value, max, min = 0) { if (typeof value !== 'string' || value.length > max || value.trim().length < min) fail(); return value; }
function choice(value, values) { if (!values.includes(value)) fail(); return value; }
function date(value) { text(value, 10, 10); try { if (Temporal.PlainDate.from(value).toString() !== value) fail(); } catch { fail(); } return value; }
function list(value, max, map) { if (!Array.isArray(value) || value.length > max) fail(); return value.map(map); }
function bool(value) { if (typeof value !== 'boolean') fail(); return value; }
export function timezone(value) { try { Temporal.Now.zonedDateTimeISO(value); } catch { fail(); } return text(value, 80, 1); }
export function validateDocument(input, today) {
  if (!input || input.version !== 1 || !input.profile) fail();
  const profile = { name: text(input.profile.name, 40, 1).trim(), stage: choice(input.profile.stage, ['pregnant', 'mother']), referenceDate: date(input.profile.referenceDate) };
  if (profile.stage === 'mother' && input.profile.childSex) profile.childSex = choice(input.profile.childSex, childSexes);
  if (profile.stage === 'mother' && input.profile.hpvFirstDose) {
    profile.hpvFirstDose = date(input.profile.hpvFirstDose);
    if (profile.hpvFirstDose < hpvMinimumDate(profile.referenceDate) || (today && profile.hpvFirstDose > today)) fail();
  }
  const reminders = list(input.reminders, 120, r => {
    if (!r || typeof r !== 'object') fail();
    if (!/^\d{2}:\d{2}$/.test(r.time) || Number(r.time.slice(0, 2)) > 23 || Number(r.time.slice(3)) > 59) fail();
    const entry = healthEntry(r.id);
    if (entry && (!r.automatic || r.stage !== (r.id.startsWith('health-visit-') ? 'pregnant' : 'mother'))) fail();
    return { id: text(r.id, 100, 1), title: text(r.title, 100, 1), date: date(r.date), time: r.time,
      repeat: choice(r.repeat, ['none', 'daily', 'weekly']), category: choice(r.category, ['self', 'baby', 'visit', 'other']),
      enabled: bool(r.enabled), automatic: bool(r.automatic), ...(r.stage ? { stage: choice(r.stage, ['pregnant', 'mother']) } : {}), completed: list(r.completed, 800, date),
      ...(entry && r.calendarDate ? { calendarDate: date(r.calendarDate) } : {}) };
  });
  if (reminders.filter(r => !healthEntry(r.id)).length > 100) fail();
  if (new Set(reminders.map(r => r.id)).size !== reminders.length) fail();
  const lessons = list(input.lessons || [], 100, l => {
    if (!l || !parseVideoUrl(l.url)) fail();
    const stage = choice(l.stage, ['pregnant', 'mother']);
    return { id:text(l.id,100,1), title:text(l.title,100,1), description:text(l.description || '',300), url:parseVideoUrl(l.url).url, stage,
      category:choice(l.category, lessonCategories(stage).map(c => c.id)), language:text(l.language || '',60), personal:true, source:'პირადი ბიბლიოთეკა' };
  });
  const plannerTasks = list(input.plannerTasks || [], 500, t => {
    if (!t || typeof t !== 'object') fail();
    return { id: text(t.id, 100, 1), title: text(t.title, 120, 1), date: date(t.date), week: date(t.week), stage: choice(t.stage, ['pregnant', 'mother']), done: bool(t.done) };
  });
  const notes = input.plannerNotes || {};
  if (typeof notes !== 'object' || Array.isArray(notes) || Object.keys(notes).length > 100) fail();
  const plannerNotes = Object.fromEntries(Object.entries(notes).map(([key, value]) => [text(key, 60, 1), text(value, 2000)]));
  // This is the existing demo trial. It never grants a paid server entitlement.
  const pro = input.pro && JSON.stringify(input.pro).length <= 1000 ? input.pro : null;
  return { version: 1, profile, reminders: syncHealthReminders(profile, reminders, today), lessons, completedLessons: list(input.completedLessons || [], 200, v => text(v, 100, 1)), pro, plannerTasks, plannerNotes };
}
export function nextTime(reminder, zone, now = Date.now()) {
  if (!reminder.enabled || isBirthDose(reminder.id)) return null;
  const start = Temporal.PlainDate.from(reminder.date);
  let day = Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO(zone).toPlainDate();
  if (Temporal.PlainDate.compare(day, start) < 0) day = start;
  if (reminder.repeat === 'none') day = start;
  for (let i = 0; i < 810; i++, day = day.add({ days: 1 })) {
    if (reminder.repeat === 'none' && i) return null;
    if (reminder.repeat === 'weekly' && start.until(day, { largestUnit: 'day' }).days % 7) continue;
    if (reminder.completed.includes(day.toString())) continue;
    const instant = Temporal.ZonedDateTime.from(`${day}T${reminder.time}[${zone}]`, { disambiguation: 'compatible' }).epochMilliseconds;
    if (instant > now) return new Date(instant).toISOString();
  }
  return null;
}
export function desiredSchedules(document, zone, now = Date.now()) {
  return document.reminders.flatMap(reminder => {
    if (reminder.automatic && reminder.stage !== document.profile.stage) return [];
    const next_at = nextTime(reminder, zone, now);
    if (!next_at) return [];
    const signature = createHash('sha256').update(JSON.stringify([reminder, zone, document.profile.stage])).digest('hex');
    return [{ reminder_id: reminder.id, signature, job_key: randomUUID(), next_at }];
  });
}
