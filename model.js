export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function isDueOn(reminder, date) {
  if (date < reminder.date) return false;
  if (reminder.repeat === 'daily') return true;
  if (reminder.repeat === 'weekly') {
    const days = Math.round((new Date(date + 'T12:00:00') - new Date(reminder.date + 'T12:00:00')) / 86400000);
    return days % 7 === 0;
  }
  return date === reminder.date;
}

export function nextOccurrence(reminder, today = localDate()) {
  if (reminder.repeat === 'none') return reminder.date;
  if (today <= reminder.date) return reminder.date;
  if (reminder.repeat === 'daily') return today;
  const cursor = new Date(today + 'T12:00:00');
  for (let i = 0; i < 7; i++) {
    const date = localDate(cursor);
    if (isDueOn(reminder, date)) return date;
    cursor.setDate(cursor.getDate() + 1);
  }
  return reminder.date;
}

export function completionKey(reminder, today = localDate()) {
  return reminder.repeat === 'none' ? reminder.date : nextOccurrence(reminder, today);
}

export function suggestedReminders(stage, date = localDate()) {
  const common = { date, repeat: 'daily', enabled: true, automatic: true, completed: [] };
  return stage === 'pregnant'
    ? [
      { ...common, id: 'auto-pregnant-note', stage, title: 'როგორ გრძნობ თავს დღეს?', category: 'self', time: '10:00' },
      { ...common, id: 'auto-pregnant-rest', stage, title: 'გამოყავი დრო დასვენებისთვის', category: 'self', time: '15:00' },
      { ...common, id: 'auto-pregnant-plan', stage, title: 'ჩაინიშნე კითხვები შემდეგი ვიზიტისთვის', category: 'visit', time: '18:00', repeat: 'weekly' }
    ]
    : [
      { ...common, id: 'auto-mother-note', stage, title: 'ერთი წუთი შენი განწყობისთვის', category: 'self', time: '10:00' },
      { ...common, id: 'auto-mother-baby', stage, title: 'ჩაინიშნე პატარას დღის რუტინა', category: 'baby', time: '13:00' },
      { ...common, id: 'auto-mother-rest', stage, title: 'დრო მხოლოდ შენთვის', category: 'self', time: '16:00' }
    ];
}
