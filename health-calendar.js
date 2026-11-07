import { Temporal } from '@js-temporal/polyfill';

export const antenatalSource = 'https://www.matsne.gov.ge/ka/document/view/6748252';
export const vaccinationSource = 'https://matsne.gov.ge/ka/document/view/5843261';
export const childSexes = ['female', 'male'];
const dueWeek = 40;

const consultation = 'მეან-გინეკოლოგის კონსულტაცია';
const ultrasound = 'სამეანო ულტრაბგერითი გამოკვლევა (დოპლეროგრაფია ექიმის მითითებით)';
const protein = 'შარდში ცილის განსაზღვრა';
const hemoglobin = 'სისხლში ჰემოგლობინის განსაზღვრა';
const rhesus = 'რეზუს-ანტისხეულების ტესტი რეზუს-უარყოფითი სისხლის შემთხვევაში';
const visits = [
  [12, '13 კვირამდე', ['სისხლის საერთო ანალიზი', 'შარდის კულტურა', 'სისხლის ჯგუფისა და რეზუსის განსაზღვრა', rhesus, 'B და C ჰეპატიტის, აივ-ისა და სიფილისის სკრინინგი', ultrasound, 'თირეოტროპული ჰორმონის (TSH) განსაზღვრა']],
  [18, '18+0 – 20+6 კვირა', [ultrasound]],
  [26, '26+0 – 26+6 კვირა', [protein, hemoglobin, rhesus, 'გესტაციური დიაბეტის სკრინინგი']],
  [30, '30+0 – 30+6 კვირა', [protein, hemoglobin]],
  [34, '34+0 – 34+6 კვირა', [protein]],
  [36, '36+0 – 36+6 კვირა', [protein, hemoglobin, 'ჰემოლიზურ სტრეპტოკოკზე გამოკვლევა', ultrasound]],
  [38, '38+0 – 38+6 კვირა', [protein]],
  [40, '40+0 – 40+6 კვირა', [protein]]
].map(([week, window, tests], index) => ({
  id: `health-visit-${index + 1}`, title: `ორსულობის ვიზიტი №${index + 1}`, window, details: [consultation, ...tests],
  dateFor: due => due.add({ weeks: week - dueWeek }),
  windowDays: index === 1 ? 20 : 6
}));

const hexa = 'კომბინირებული ჰექსა (დიფთერია, ტეტანუსი, ყივანახველა, B ჰეპატიტი, Hib და პოლიომიელიტი)';
const pcv = 'პნევმოკოკური ინფექცია (PCV)';
const rota = 'როტავირუსი';
const mmr = 'წითელა, წითურა, ყბაყურა (MMR)';
const dtap = 'დიფთერია, ტეტანუსი, ყივანახველა და პოლიომიელიტი (DTaP/IPV)';
const vaccines = [
  ['hep-b', 'დაბადებიდან 0–12 საათი', ['B ჰეპატიტი (დაბადების დოზა)'], { days: 0 }],
  ['bcg', 'დაბადებიდან 0–5 დღე', ['ტუბერკულოზი (ბცჟ / BCG)'], { days: 1 }],
  ['2m', '2 თვის ასაკში', [hexa, pcv, rota], { months: 2 }],
  ['3m', '3 თვის ასაკში', [hexa, rota], { months: 3 }],
  ['4m', '4 თვის ასაკში', [hexa, pcv], { months: 4 }],
  ['12m', '12 თვის ასაკში', [pcv, mmr], { months: 12 }],
  ['18m', '18 თვის ასაკში', [dtap], { months: 18 }],
  ['5y', '5 წლის ასაკში', [mmr, dtap], { years: 5 }],
  ['14y', '14 წლის ასაკში', ['ტეტანუსი და დიფთერია (Td)'], { years: 14 }]
].map(([key, window, details, age]) => ({
  id: `health-vaccine-${key}`, title: key === 'hep-b' || key === 'bcg' ? details[0] : `აცრები • ${window}`,
  window, details, dateFor: birth => birth.add(age), windowDays: key === 'bcg' ? 4 : 0
}));

const hpvFirst = {
  id: 'health-vaccine-hpv-1', title: 'HPV აცრა • პირველი დოზა', window: '10–12 წლის ასაკში',
  details: ['ადამიანის პაპილომავირუსის აცრა გოგოებისა და ბიჭებისთვის.', 'პირველი დოზის შემდეგ პროფილში მიუთითე ჩატარების თარიღი მეორე შეხსენებისთვის.'],
  dateFor: (birth, firstDose) => firstDose || birth.add({ years: 10 })
};
const hpvSecond = {
  id: 'health-vaccine-hpv-2', title: 'HPV აცრა • მეორე დოზა', window: 'პირველი დოზიდან მინიმუმ 6 თვე',
  details: ['ადამიანის პაპილომავირუსის აცრა გოგოებისა და ბიჭებისთვის.'],
  dateFor: (_, firstDose) => firstDose?.add({ months: 6 })
};
const hpv = [hpvFirst, hpvSecond];
const hpvBySex = { female: hpv, male: hpv };
const entries = new Map([...visits, ...vaccines, hpvFirst, hpvSecond].map(entry => [entry.id, entry]));
export const healthEntry = id => entries.get(id);
export const isBirthDose = id => id === 'health-vaccine-hep-b';
export const isRecordedDose = (id, profile) => id === hpvFirst.id && !!profile.hpvFirstDose;

function plainDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  try { return Temporal.PlainDate.from(value); } catch { return null; }
}

export function pregnancyAge(dueDate, today) {
  const due = plainDate(dueDate);
  const date = plainDate(today);
  if (!due || !date) return null;
  const days = due.subtract({ weeks:dueWeek }).until(date).days;
  if (days < 0) return null;
  return { weeks:Math.floor(days / 7), days:days % 7 };
}
export const hpvMinimumDate = birth => plainDate(birth)?.add({ years: 9 }).toString();

export function syncHealthReminders(profile, reminders, today) {
  const anchor = plainDate(profile?.referenceDate);
  if (!anchor || !['pregnant', 'mother'].includes(profile.stage)) return reminders;

  const { stage, childSex } = profile;
  const dose = plainDate(profile.hpvFirstDose);
  const firstDose = dose && profile.hpvFirstDose >= hpvMinimumDate(profile.referenceDate) ? dose : null;
  const calendar = stage === 'pregnant' ? visits : [...vaccines, ...(childSexes.includes(childSex) ? hpvBySex[childSex] : hpv)];
  const previous = new Map(reminders.filter(r => r.automatic && healthEntry(r.id) && r.stage === stage).map(r => [r.id, r]));
  const next = [];
  for (const entry of calendar) {
    const start = entry.dateFor(anchor, firstDose);
    const calendarDate = start?.toString();
    if (!plainDate(calendarDate)) continue;
    const saved = previous.get(entry.id);
    const recorded = entry === hpvFirst && firstDose;
    const fixedDate = recorded || isBirthDose(entry.id);
    const sameDate = saved?.calendarDate === calendarDate;
    const windowEnd = entry.windowDays ? start.add({ days:entry.windowDays }).toString() : calendarDate;
    const defaultDate = today > calendarDate && today <= windowEnd ? today : calendarDate;
    const reminder = {
      id: entry.id, stage, title: entry.title, category: stage === 'pregnant' ? 'visit' : 'baby',
      date: sameDate && !fixedDate && (entry !== hpvSecond || saved.date >= calendarDate) ? saved.date : defaultDate,
      time: saved?.time || '10:00', repeat: 'none', automatic: true,
      enabled: saved?.enabled ?? true,
      completed: recorded ? [calendarDate] : saved?.completed || [], calendarDate
    };
    if (saved && Object.keys(reminder).every(key => key === 'completed'
      ? reminder.completed.join() === saved.completed.join()
      : reminder[key] === saved[key])) next.push(saved);
    else next.push(reminder);
  }
  const updated = [...reminders.filter(r => !previous.has(r.id)), ...next];
  return updated.length === reminders.length && updated.every((r, i) => r === reminders[i]) ? reminders : updated;
}
