import { localDate } from './model.js';

export const proPrice = 19;
const dayMs = 86400000;

export function trialStatus(pro, now = Date.now()) {
  const start = Date.parse(pro?.startedAt);
  const end = Date.parse(pro?.endsAt);
  const valid = Number.isFinite(start) && Number.isFinite(end) && end > start && end - start <= 7 * dayMs;
  return { active: valid && pro?.used === true && start <= now && now < end && !pro.cancelled, used: Boolean(pro?.used), daysLeft: valid && !pro.cancelled ? Math.max(0, Math.ceil((end - now) / dayMs)) : 0 };
}

export function startProTrial(current, now = Date.now()) {
  if (current?.used) return current;
  return { used: true, startedAt: new Date(now).toISOString(), endsAt: new Date(now + 7 * dayMs).toISOString(), cancelled: false };
}

export function weekStart(value = localDate()) {
  const date = new Date(value + 'T12:00:00');
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  return localDate(date);
}

export function shiftDate(value, days) {
  const date = new Date(value + 'T12:00:00');
  date.setDate(date.getDate() + days);
  return localDate(date);
}

export function weeklyTemplate(stage, week) {
  const titles = stage === 'pregnant'
    ? ['კვირის პირადი მიზანი შეარჩიე', 'ჩაინიშნე კითხვები შემდეგი ვიზიტისთვის', 'გამოყავი დრო საყვარელი საქმიანობისთვის', 'უყურე შენთვის საინტერესო გაკვეთილს', 'გადაამოწმე მომზადების შენი სია']
    : ['ჩამოწერე ამ კვირის მნიშვნელოვანი საქმეები', 'შეარჩიე პატარაზე ზრუნვის ერთი გაკვეთილი', 'დაგეგმე დახმარება ახლობელთან ერთად', 'დაიტოვე დრო შენთვის', 'ჩაინიშნე კითხვები შემდეგი ვიზიტისთვის'];
  return titles.map((title, index) => ({ id: `template-${stage}-${week}-${index}`, stage, week, date: shiftDate(week, index), title, done: false }));
}

export function migrateProState(saved) {
  return { ...saved, pro: saved.pro && typeof saved.pro === 'object' ? saved.pro : null,
    plannerTasks: Array.isArray(saved.plannerTasks) ? saved.plannerTasks.filter(task => task && typeof task.id === 'string' && typeof task.title === 'string' && ['pregnant', 'mother'].includes(task.stage) && /^\d{4}-\d{2}-\d{2}$/.test(task.date) && task.week === weekStart(task.date)) : [],
    plannerNotes: saved.plannerNotes && typeof saved.plannerNotes === 'object' && !Array.isArray(saved.plannerNotes) ? Object.fromEntries(Object.entries(saved.plannerNotes).filter(([key, value]) => /^(pregnant|mother)-\d{4}-\d{2}-\d{2}$/.test(key) && typeof value === 'string')) : {}
  };
}

function escapeCalendar(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}
function foldLine(line) {
  const encoder = new TextEncoder();
  let current = '', bytes = 0, result = [];
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > 75) { result.push(current); current = ' '; bytes = 1; }
    current += char; bytes += size;
  }
  result.push(current);
  return result.join('\r\n');
}

export function remindersToCalendar(reminders, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dediko//Personal reminders//KA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const reminder of reminders.filter(item => item.enabled)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reminder.date) || !/^\d{2}:\d{2}$/.test(reminder.time)) continue;
    lines.push('BEGIN:VEVENT', `UID:${escapeCalendar(reminder.id)}@dediko`, `DTSTAMP:${stamp}`, `DTSTART:${reminder.date.replaceAll('-', '')}T${reminder.time.replace(':', '')}00`, 'DURATION:PT15M', `SUMMARY:${escapeCalendar(reminder.title)}`);
    if (reminder.repeat === 'daily') lines.push('RRULE:FREQ=DAILY');
    if (reminder.repeat === 'weekly') lines.push('RRULE:FREQ=WEEKLY');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
