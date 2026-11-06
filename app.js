import { localDate, nextOccurrence, completionKey, suggestedReminders } from './model.js';

const app = document.querySelector('#app');
const dialog = document.querySelector('#form-dialog');
const storageKey = 'dediko.local.v1';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icons = {
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18m-14 4h2m4 0h2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  spark: '<path d="m12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8L12 3ZM20 2v4m-2-2h4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  edit: '<path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15l-1 6 5-2"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  baby: '<circle cx="12" cy="12" r="9"/><path d="M9 15s3 3 6 0M9 10h.01M15 10h.01M12 3s-3 4 1 4"/>',
  leaf: '<path d="M20 4C6 1 0 12 7 18S23 16 20 4ZM5 21l11-12"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  logout: '<path d="M9 4H4v16h5m5-12 4 4-4 4m-6-4h14"/>'
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.heart}</svg>`;
const logo = () => '<img class="brand-image" src="assets/dediko-logo.jpg" alt="DediKo — დედასა და ბავშვზე ზრუნვა" width="210" height="74">';
let data = load();
let view = data.profile ? 'dashboard' : 'landing';
let filter = 'today';
let demo = false;
let toastTimer;

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved?.version === 1 && Array.isArray(saved.reminders) && (saved.profile === null || ['pregnant', 'mother'].includes(saved.profile?.stage))) return saved;
  } catch { /* A fresh local space can still be used when storage is unavailable. */ }
  return { version: 1, profile: null, reminders: [] };
}
function save() {
  if (demo) return;
  try { localStorage.setItem(storageKey, JSON.stringify(data)); }
  catch { toast('ბრაუზერმა შენახვა ვერ შეძლო. მონაცემები მხოლოდ ამ გვერდის დახურვამდე დარჩება.'); }
}
function toast(message) {
  const node = document.querySelector('#toast');
  node.textContent = message;
  node.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('visible'), 4200);
}
function formatDate(value, options = { month: 'long', day: 'numeric' }) {
  const date = new Date(value + 'T12:00:00');
  const months = ['იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი', 'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'];
  const weekdays = ['კვირა', 'ორშაბათი', 'სამშაბათი', 'ოთხშაბათი', 'ხუთშაბათი', 'პარასკევი', 'შაბათი'];
  return `${options.weekday ? weekdays[date.getDay()] + ', ' : ''}${date.getDate()} ${months[date.getMonth()]}${options.year ? ', ' + date.getFullYear() : ''}`;
}
const stageName = stage => stage === 'pregnant' ? 'ორსული ვარ' : 'ახალბედა დედა ვარ';
const repeatName = repeat => ({ none: 'ერთჯერადი', daily: 'ყოველდღე', weekly: 'ყოველ კვირას' })[repeat];
const categoryName = category => ({ self: 'ჩემზე ზრუნვა', baby: 'პატარაზე ზრუნვა', visit: 'ვიზიტი', other: 'სხვა' })[category] || 'სხვა';
const categoryIcon = category => ({ self: 'heart', baby: 'baby', visit: 'calendar', other: 'bell' })[category] || 'bell';
function stageChoices(selected) {
  return `<div class="stage-choices"><label class="stage-choice"><input type="radio" name="stage" value="pregnant" ${selected === 'pregnant' ? 'checked' : ''} required><span>${icon('heart')}<strong>ორსული ვარ</strong><small>პატარას მოლოდინში</small></span></label><label class="stage-choice"><input type="radio" name="stage" value="mother" ${selected === 'mother' ? 'checked' : ''} required><span>${icon('baby')}<strong>ახალბედა დედა ვარ</strong><small>ახალი ამბავი ერთად</small></span></label></div>`;
}

function landing() {
  return `<header class="site-header wrap"><a class="brand" href="#" aria-label="Dediko მთავარი">${logo()}</a><nav aria-label="მთავარი ნავიგაცია"><a href="#how">როგორ მუშაობს</a><a href="#for-you">შენთვის</a><a href="#reminders">შეხსენებები</a></nav><button class="button button-small" data-action="register">შექმენი შენი სივრცე ${icon('arrow')}</button></header>
  <main id="main"><section class="hero wrap"><div class="hero-copy"><div class="eyebrow"><span class="tiny-heart">${icon('heart')}</span> შენთან, დედობის ყოველ ნაბიჯზე</div><h1>ახალი სიცოცხლე.<br>ახალი შენ.<br><span>ერთად, უფრო მშვიდად.</span></h1><p>პატარას მოლოდინიდან პირველ ჩახუტებამდე —<br class="desktop-break"> შენი პირადი სივრცე ზრუნვისთვის, დაგეგმვისთვის<br class="desktop-break"> და ყველაფრის მშვიდად მოსასწრებად.</p><div class="hero-actions"><button class="button" data-action="register">დაიწყე შენი ამბავი ${icon('arrow')}</button><button class="text-button" data-action="demo">დაათვალიერე სივრცე <span>↗</span></button></div><div class="hero-note">${icon('check')} შენი ტემპით ${icon('check')} შენზე მორგებული ${icon('check')} სიყვარულით შექმნილი</div></div>
  <div class="hero-art"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><span class="art-spark spark-one">✧</span><span class="art-spark spark-two">✧</span><div class="floating-note note-top">${icon('heart')} <span>პატარა ნაბიჯები,<br><strong>დიდი სიყვარული</strong></span></div><div class="preview-card"><div class="preview-top"><span class="preview-avatar">ა</span><div><span class="mini-label">შენი ყოველდღიური თანამგზავრი</span><strong>დილა მშვიდობისა, დედიკო <span class="pink">♡</span></strong></div><span class="preview-dot"></span></div><div class="preview-greeting"><span class="tag">${icon('spark')} შენი სივრცის მაგალითი</span><h2>დღეს საკუთარ თავსაც<br>მოუსმინე.</h2><p>ყველა პატარა ზრუნვა მნიშვნელოვანია.</p><div class="greeting-flower" aria-hidden="true">✿</div></div><div class="preview-reminders"><div class="row-between"><h3>დღის პატარა გეგმები</h3><span class="mini-label">დღეს</span></div><div class="preview-reminder">${icon('heart', 'pink')}<span><strong>დრო შენზე ზრუნვისთვის</strong><small>ცოტა შეისვენე და ამოისუნთქე</small></span><span class="preview-time">10:00</span></div><div class="preview-reminder">${icon('calendar', 'blue')}<span><strong>შენი დაგეგმილი ვიზიტი</strong><small>ყველაფერი ერთ სივრცეში</small></span><span class="preview-time">14:30</span></div><div class="preview-reminder completed">${icon('check')}<span><strong>ერთი პატარა ნაბიჯი შენთვის</strong><small>დღეს უკვე მოასწარი</small></span><span class="preview-time">09:00</span></div></div><div class="preview-bottom"><span class="progress-dots"><i></i><i></i><i></i><i></i><i></i></span><span>შენ შესანიშნავად ართმევ თავს ♡</span></div></div><div class="floating-note note-bottom"><span class="note-bell">${icon('bell')}</span><span><strong>შენთვის მნიშვნელოვანს</strong><br>ერთად გავიხსენებთ.</span><span class="note-heart">♡</span></div></div></section>
  <div class="promise-strip"><div class="wrap">${icon('leaf')} ცოტა მეტი სიმშვიდე <span>✦</span> ცოტა ნაკლები საფიქრალი <span>✦</span> მეტი დრო შენთვის და პატარასთვის ${icon('heart')}</div></div>
  <section class="section wrap" id="for-you"><div class="section-heading"><div><span class="eyebrow">ყოველი ეტაპი განსაკუთრებულია</span><h2>შენი ამბავი. შენი სივრცე.</h2></div><p>სადაც არ უნდა იყო დედობის გზაზე,<br>Dediko შენთან ერთად იცვლება.</p></div><div class="journey-grid"><article class="journey-card pregnancy"><div class="journey-icon">${icon('heart')}</div><span class="mini-label">პატარას მოლოდინში</span><h3>ახალი დასაწყისისთვის</h3><p>შენი გეგმები, პირადი შეხსენებები და დრო საკუთარ თავზე ზრუნვისთვის — ორსულობის განმავლობაში.</p><button class="text-button" data-action="register-pregnant">ორსული ვარ ${icon('arrow')}</button><div class="journey-decoration" aria-hidden="true">♡</div></article><article class="journey-card motherhood"><div class="journey-icon">${icon('baby')}</div><span class="mini-label">პირველი დღეები ერთად</span><h3>შენთვის და შენი პატარასთვის</h3><p>მოაწესრიგე ახალი ყოველდღიურობა, ჩაინიშნე პატარას რუტინა და შენთვისაც დაიტოვე დრო.</p><button class="text-button" data-action="register-mother">ახალბედა დედა ვარ ${icon('arrow')}</button><div class="journey-decoration" aria-hidden="true">✿</div></article></div></section>
  <section class="section how-section" id="how"><div class="wrap"><div class="center-heading"><span class="eyebrow">მარტივად, ზედმეტი ფიქრის გარეშე</span><h2>შენი სივრცე, სამ პატარა ნაბიჯში</h2></div><div class="steps"><article><span class="step-number">01</span><h3>გაგვაცანი შენი თავი</h3><p>აირჩიე შენი ეტაპი — ორსულად ხარ თუ უკვე ახალბედა დედა.</p></article><article><span class="step-number">02</span><h3>მოირგე ყოველდღიურობა</h3><p>ჩართე შეთავაზებული შეხსენებები და დაამატე შენი პირადი გეგმები.</p></article><article><span class="step-number">03</span><h3>გაიარე გზა შენი ტემპით</h3><p>ცხოვრება იცვლება? პროფილიდან შეცვალე ეტაპი და სივრცეც მოგერგება.</p></article></div></div></section>
  <section class="section wrap" id="reminders"><div class="reminder-feature"><div class="feature-symbol">${icon('bell')}<span>♡</span></div><div><span class="eyebrow">ნაკლები „არ დამავიწყდეს“</span><h2>მნიშვნელოვანი ამბები<br>თავის დროს გაგახსენდება.</h2><p>შენი შეხსენებები და შენს ეტაპზე მორგებული შეთავაზებები ერთად.<br>დრო, განმეორება და ცვლილებები — ყველაფერი შენს ხელშია.</p></div><button class="button" data-action="register">შექმენი პირველი შეხსენება ${icon('plus')}</button></div></section>
  <section class="closing wrap"><span class="closing-star">✧</span><span class="eyebrow">აქ შენზეც ზრუნავენ</span><h2>დედობა ახალი ამბავია.<br><span>დაწერე ის შენი ტემპით.</span></h2><button class="button" data-action="register">მოდი, ერთად დავიწყოთ ${icon('heart')}</button><p>შექმენი შენი პატარა, მშვიდი სივრცე.</p></section></main><footer class="footer wrap"><a class="brand" href="#">${logo()}</a><p>შენთან, დედობის ყოველ ნაბიჯზე.</p><span>© ${new Date().getFullYear()} Dediko</span></footer>`;
}

function currentReminders() {
  return data.reminders.filter(r => !r.automatic || r.stage === data.profile.stage);
}
function isComplete(reminder) {
  return reminder.completed.includes(completionKey(reminder));
}
function reminderRow(reminder) {
  const done = isComplete(reminder);
  const date = nextOccurrence(reminder);
  const overdue = date < localDate() && !done;
  return `<article class="reminder-row ${done ? 'is-done' : ''} ${!reminder.enabled ? 'is-disabled' : ''}"><button class="complete-button ${done ? 'checked' : ''}" aria-label="${escape(reminder.title)} — ${done ? 'შესრულების გაუქმება' : 'შესრულებულად მონიშვნა'}" aria-pressed="${done}" data-action="complete" data-id="${escape(reminder.id)}">${done ? icon('check') : ''}</button><span class="category-icon ${reminder.category === 'baby' || reminder.category === 'visit' ? 'blue-bg' : ''}">${icon(categoryIcon(reminder.category))}</span><div class="reminder-description"><strong>${escape(reminder.title)}</strong><span>${categoryName(reminder.category)} <b>·</b> ${repeatName(reminder.repeat)} ${reminder.automatic ? '<i class="auto-label">შეთავაზებული</i>' : ''}</span></div><div class="reminder-date ${overdue ? 'overdue' : ''}"><strong>${escape(reminder.time)}</strong><small>${date === localDate() ? 'დღეს' : formatDate(date)}</small></div><button class="icon-button" aria-label="რედაქტირება: ${escape(reminder.title)}" data-action="edit-reminder" data-id="${escape(reminder.id)}">${icon('edit')}</button></article>`;
}
function dashboard() {
  const profile = data.profile;
  const reminders = currentReminders();
  const today = reminders.filter(r => r.enabled && nextOccurrence(r) <= localDate());
  const done = today.filter(isComplete).length;
  let shown = filter === 'today' ? today : reminders;
  if (filter === 'personal') shown = reminders.filter(r => !r.automatic);
  if (filter === 'suggested') shown = reminders.filter(r => r.automatic);
  shown = [...shown].sort((a, b) => Number(isComplete(a)) - Number(isComplete(b)) || `${nextOccurrence(a)}${a.time}`.localeCompare(`${nextOccurrence(b)}${b.time}`));
  return `<div class="dashboard-shell"><aside class="sidebar"><a href="#" class="brand" data-action="home">${logo()}</a><div class="sidebar-label">შენი პირადი სივრცე</div><nav aria-label="პირადი სივრცე"><button class="sidebar-item ${view === 'dashboard' ? 'active' : ''}" data-action="dashboard">${icon('grid')} ჩემი დღე</button><button class="sidebar-item" data-action="all-reminders">${icon('bell')} შეხსენებები <span class="nav-count">${reminders.length}</span></button><button class="sidebar-item ${view === 'profile' ? 'active' : ''}" data-action="profile">${icon('user')} ჩემი პროფილი</button></nav><div class="sidebar-kind"><span>პატარა შეხსენება</span><div>♡</div><strong>საკუთარ თავზე ზრუნვაც<br>პატარაზე ზრუნვაა.</strong><p>შენც იმსახურებ შესვენებას.</p></div><button class="sidebar-item sidebar-bottom" data-action="${demo ? 'exit-demo' : 'home'}">${icon('logout')} ${demo ? 'დემოდან გასვლა' : 'მთავარი გვერდი'}</button></aside><div class="dashboard-content"><header class="dashboard-header"><div class="mobile-brand">${logo()}</div><span class="header-date">${formatDate(localDate(), { weekday: 'long', day: 'numeric', month: 'long' })}</span><div class="header-right"><span class="stage-pill">${icon(profile.stage === 'pregnant' ? 'heart' : 'baby')}${stageName(profile.stage)}</span><button class="avatar" data-action="profile" aria-label="ჩემი პროფილი">${escape(profile.name.slice(0, 1))}</button></div></header><nav class="mobile-nav" aria-label="მობილური ნავიგაცია"><button data-action="dashboard">${icon('grid')} ჩემი დღე</button><button data-action="all-reminders">${icon('bell')} შეხსენებები</button><button data-action="profile">${icon('user')} პროფილი</button></nav><main class="dashboard-main" id="main">${demo ? '<div class="demo-banner"><span>ეს არის დემო სივრცე — ცვლილებები არ შეინახება.</span><button data-action="register">შექმენი შენი სივრცე →</button></div>' : ''}${view === 'profile' ? profileView() : `<div class="dashboard-title"><div><span class="eyebrow">დღის დასაწყისი შენია</span><h1>გამარჯობა, ${escape(profile.name)} <span>♡</span></h1><p>მოდი, დღესაც პატარა ნაბიჯებით წავიდეთ.</p></div><button class="button" data-action="add-reminder">${icon('plus')} ახალი შეხსენება</button></div><section class="welcome-panel ${profile.stage === 'mother' ? 'mother-panel' : ''}"><div><span class="tag">${icon('spark')} ${profile.stage === 'pregnant' ? 'პატარას მოლოდინში' : 'ახალი დღე, ერთად'}</span><h2>${profile.stage === 'pregnant' ? 'შენი ყველაზე თბილი<br>მოლოდინის დღეები.' : 'პატარა ჩახუტებები.<br>დიდი ახალი ამბავი.'}</h2><p>${profile.stage === 'pregnant' ? 'იყავი საკუთარ თავთან ისეთივე ნაზი, როგორც შენს პატარასთან.' : 'ახალ რიტმს ნელ-ნელა იპოვი. საკუთარ თავსაც მოუსმინე.'}</p><span class="date-caption">${icon('calendar')} ${profile.stage === 'pregnant' ? 'პატარას ველოდებით:' : 'პატარას დაბადების დღე:'} ${formatDate(profile.referenceDate, { day: 'numeric', month: 'long', year: 'numeric' })}</span></div><div class="welcome-art" aria-hidden="true"><span>♡</span><i>✧</i><small>შენ შესანიშნავად<br>ართმევ თავს</small></div></section><div class="dashboard-grid"><section class="reminders-panel"><div class="row-between panel-title"><div><span class="eyebrow">ცოტა მეტი სიმსუბუქე</span><h2>შენი შეხსენებები</h2></div>${icon('bell', 'pink')}</div><div class="tabs" role="group" aria-label="შეხსენებების ფილტრი">${[['today', 'დღეს'], ['all', 'ყველა'], ['personal', 'პირადი'], ['suggested', 'შეთავაზებული']].map(([key, name]) => `<button data-action="filter" data-filter="${key}" aria-pressed="${filter === key}" class="${filter === key ? 'selected' : ''}">${name}</button>`).join('')}</div><div class="reminders-list">${shown.length ? shown.map(reminderRow).join('') : `<div class="empty-state">${icon('leaf')}<h3>${filter === 'today' ? 'დღეს თავისუფალი სივრცე გაქვს' : 'აქ შენი გეგმები გამოჩნდება'}</h3><p>დაამატე შეხსენება და მნიშვნელოვანი ამბები ერთ ადგილას მოაგროვე.</p><button class="text-button" data-action="add-reminder">${icon('plus')} შეხსენების დამატება</button></div>`}</div><button class="add-reminder-inline" data-action="add-reminder">${icon('plus')} კიდევ ერთი პატარა გეგმა</button></section><aside class="day-aside"><section class="day-progress"><span class="eyebrow">შენი დღევანდელი ნაბიჯები</span><div class="progress-ring" style="--progress:${today.length ? (done / today.length) * 100 : 0}%"><div><strong>${done}<small> / ${today.length}</small></strong><span>შესრულებულია</span></div></div><h3>შენი ტემპი საკმარისია ♡</h3><p>ყველაფრის ერთ დღეში<br>მოსწრება საჭირო არ არის.</p></section><section class="tip-card">${icon('spark')}<h3>სივრცე შენთან ერთად იცვლება</h3><p>შეცვალე შენი ეტაპი პროფილიდან და მიიღე შესაბამისი შეხსენებები.</p><button class="text-button" data-action="profile">ჩემი პროფილი ${icon('arrow')}</button></section></aside></div>`}<p class="local-notice">${icon('heart')} შენი პირადი საცდელი სივრცე · მონაცემები ინახება მხოლოდ ამ ბრაუზერში · შეხსენებები ჩანს საიტზე</p></main></div></div>`;
}

function profileFields(profile) {
  return `<label class="field">შენი სახელი<input name="name" type="text" maxlength="40" autocomplete="given-name" value="${escape(profile?.name || '')}" placeholder="როგორ მოგმართოთ?" required></label><fieldset class="stage-fieldset"><legend>დედობის რომელ ეტაპზე ხარ?</legend>${stageChoices(profile?.stage || 'pregnant')}</fieldset><label class="field"><span id="date-label">${profile?.stage === 'mother' ? 'პატარას დაბადების თარიღი' : 'მშობიარობის მოსალოდნელი თარიღი'}</span><input type="date" name="referenceDate" value="${escape(profile?.referenceDate || '')}" ${profile?.stage === 'mother' ? `max="${localDate()}"` : `min="${localDate()}"`} required></label>`;
}
function profileView() {
  return `<div class="dashboard-title"><div><span class="eyebrow">ყველაფერი შენზე მორგებული</span><h1>ჩემი პროფილი <span>♡</span></h1><p>შენი ამბავი იცვლება — შენი სივრცეც იცვლება.</p></div></div><section class="profile-panel"><div class="profile-heading"><span class="avatar">${escape(data.profile.name.slice(0, 1))}</span><div><h2>შენი ინფორმაცია</h2><p>სტატუსის შეცვლისას პირადი შეხსენებები შენარჩუნდება.</p></div></div><form id="profile-form">${profileFields(data.profile)}<p class="form-note">ახალ ეტაპზე გადასვლისას შესაბამის შეთავაზებულ შეხსენებებს დაინახავ. ძველი ეტაპის შეთავაზებები შეინახება და დროებით დაიმალება.</p><div class="form-error" role="alert"></div><button class="button" type="submit">ცვლილებების შენახვა ${icon('check')}</button></form><button class="delete-button" data-action="reset-profile">ლოკალური პროფილის გასუფთავება</button></section>`;
}

function render() {
  app.innerHTML = view === 'landing' ? landing() : dashboard();
  document.title = `Dediko — ${view === 'landing' ? 'შენთან, დედობის ყოველ ნაბიჯზე' : view === 'profile' ? 'ჩემი პროფილი' : 'ჩემი დღე'}`;
}
function openDialog(content) {
  dialog.innerHTML = `<button class="dialog-close icon-button" data-action="close-dialog" aria-label="დახურვა">${icon('close')}</button>${content}`;
  dialog.showModal();
}
function register(stage = 'pregnant') {
  if (data.profile && !demo) { view = 'dashboard'; render(); return; }
  openDialog(`<div class="dialog-symbol">${icon('heart')}</div><span class="eyebrow">კეთილი იყოს შენი მობრძანება</span><h2 id="dialog-title">შენი ამბავი აქ იწყება ♡</h2><p class="dialog-intro">ცოტა რამ შენზე, რომ შენი სივრცე მოგარგოთ.</p><form id="register-form">${profileFields({ stage })}<p class="form-note">ეს ლოკალური ვერსიაა: პროფილი ამ ბრაუზერში შეინახება. ელფოსტა და პაროლი საჭირო არ არის.</p><div class="form-error" role="alert"></div><button type="submit" class="button full-width">შექმენი ჩემი სივრცე ${icon('arrow')}</button></form>`);
}
function reminderDialog(id) {
  const reminder = data.reminders.find(r => r.id === id);
  openDialog(`<div class="dialog-symbol">${icon('bell')}</div><h2 id="dialog-title">${reminder ? 'შეხსენების რედაქტირება' : 'ერთი პატარა გეგმა'}</h2><p class="dialog-intro">მნიშვნელოვან ამბებს თავისი დრო მიუჩინე.</p><form id="reminder-form" data-id="${escape(id || '')}"><label class="field">რა გაგახსენოთ?<input name="title" required maxlength="100" placeholder="მაგ. ექიმთან ვიზიტი" value="${escape(reminder?.title || '')}"></label><div class="field-row"><label class="field">თარიღი<input type="date" name="date" required value="${escape(reminder?.date || localDate())}"></label><label class="field">დრო<input type="time" name="time" required value="${escape(reminder?.time || '10:00')}"></label></div><div class="field-row"><label class="field">გამეორება<select name="repeat">${['none', 'daily', 'weekly'].map(key => `<option value="${key}" ${reminder?.repeat === key ? 'selected' : ''}>${repeatName(key)}</option>`).join('')}</select></label><label class="field">კატეგორია<select name="category">${['self', 'baby', 'visit', 'other'].map(key => `<option value="${key}" ${reminder?.category === key ? 'selected' : ''}>${categoryName(key)}</option>`).join('')}</select></label></div><label class="switch-field"><span>შეხსენება ჩართულია</span><input type="checkbox" name="enabled" role="switch" ${reminder?.enabled !== false ? 'checked' : ''}></label><div class="form-error" role="alert"></div><button class="button full-width" type="submit">${reminder ? 'ცვლილებების შენახვა' : 'შეხსენების დამატება'} ${icon('check')}</button>${reminder && !reminder.automatic ? '<button class="delete-button" type="button" data-action="delete-reminder" data-id="' + escape(id) + '">შეხსენების წაშლა</button>' : ''}</form>`);
}
function ensureSuggestions() {
  for (const reminder of suggestedReminders(data.profile.stage)) {
    if (!data.reminders.some(r => r.id === reminder.id)) data.reminders.push(reminder);
  }
}
function startDemo() {
  if (data.profile) { view = 'dashboard'; render(); return; }
  demo = true;
  const date = new Date();
  date.setDate(date.getDate() + 100);
  data = { version: 1, profile: { name: 'ანა', stage: 'pregnant', referenceDate: localDate(date) }, reminders: suggestedReminders('pregnant') };
  view = 'dashboard'; filter = 'today'; render(); window.scrollTo(0, 0);
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  event.preventDefault();
  const { action, id } = button.dataset;
  if (action.startsWith('register')) return register(action === 'register-mother' ? 'mother' : 'pregnant');
  if (action === 'close-dialog') return dialog.close();
  if (action === 'demo') return startDemo();
  if (action === 'reset-profile') return openDialog(`<h2 id="dialog-title">ლოკალური სივრცის გასუფთავება?</h2><p class="dialog-intro">ამ ბრაუზერიდან წაიშლება შენი პროფილი და ყველა შენახული შეხსენება. შემდეგ თავიდან შეძლებ სივრცის შექმნას.</p><button class="button full-width" data-action="confirm-reset">დიახ, გაასუფთავე ლოკალური სივრცე</button><button class="delete-button" data-action="close-dialog">გაუქმება</button>`);
  if (action === 'confirm-reset') {
    if (!demo) { try { localStorage.removeItem(storageKey); } catch { toast('ბრაუზერში მონაცემების გასუფთავება ვერ მოხერხდა.'); return; } }
    demo = false; data = load(); view = data.profile ? 'dashboard' : 'landing'; dialog.close(); render(); window.scrollTo(0, 0); return;
  }
  if (action === 'home') { view = 'landing'; render(); window.scrollTo(0, 0); }
  if (action === 'exit-demo') { demo = false; data = load(); view = 'landing'; render(); window.scrollTo(0, 0); }
  if (['dashboard', 'profile', 'all-reminders'].includes(action)) {
    view = action === 'profile' ? 'profile' : 'dashboard';
    if (action === 'all-reminders') filter = 'all';
    render(); window.scrollTo(0, 0);
  }
  if (action === 'filter') { filter = button.dataset.filter; render(); }
  if (action === 'add-reminder') reminderDialog();
  if (action === 'edit-reminder') reminderDialog(id);
  if (action === 'delete-reminder') {
    data.reminders = data.reminders.filter(r => r.id !== id); save(); dialog.close(); render(); toast('შეხსენება წაიშალა');
  }
  if (action === 'complete') {
    const reminder = data.reminders.find(r => r.id === id);
    const key = completionKey(reminder);
    reminder.completed = reminder.completed.includes(key) ? reminder.completed.filter(date => date !== key) : [...reminder.completed, key];
    save(); render();
  }
});

document.addEventListener('change', event => {
  if (event.target.name !== 'stage') return;
  const form = event.target.closest('form');
  const date = form.elements.referenceDate;
  form.querySelector('#date-label').textContent = event.target.value === 'mother' ? 'პატარას დაბადების თარიღი' : 'მშობიარობის მოსალოდნელი თარიღი';
  if (event.target.value === 'mother') { date.max = localDate(); date.removeAttribute('min'); }
  else { date.min = localDate(); date.removeAttribute('max'); }
  if (date.value && !date.validity.valid) date.value = '';
});

document.addEventListener('submit', event => {
  const form = event.target;
  if (!['register-form', 'profile-form', 'reminder-form'].includes(form.id)) return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  const error = form.querySelector('.form-error');
  if (form.id === 'register-form' || form.id === 'profile-form') {
    if (!values.name.trim()) { error.textContent = 'გთხოვ, მიუთითე შენი სახელი.'; return; }
    if (!['pregnant', 'mother'].includes(values.stage) || !values.referenceDate) { error.textContent = 'აირჩიე ეტაპი და შესაბამისი თარიღი.'; return; }
    const invalidDate = values.stage === 'mother' ? values.referenceDate > localDate() : values.referenceDate < localDate();
    if (invalidDate) { error.textContent = 'გთხოვ, გადაამოწმე არჩეული თარიღი.'; return; }
    if (form.id === 'register-form') { demo = false; data = { version: 1, profile: null, reminders: [] }; }
    data.profile = { name: values.name.trim(), stage: values.stage, referenceDate: values.referenceDate };
    ensureSuggestions(); save();
    if (dialog.open) dialog.close();
    view = form.id === 'profile-form' ? 'profile' : 'dashboard'; filter = 'today'; render();
    toast(form.id === 'profile-form' ? 'პროფილი განახლდა — სივრცე შენს ეტაპს მოერგო ♡' : 'კეთილი იყოს შენი მობრძანება Dediko-ში ♡');
  } else {
    if (!values.title.trim()) { error.textContent = 'შეხსენებას სათაური სჭირდება.'; return; }
    const existing = data.reminders.find(r => r.id === form.dataset.id);
    const fields = { title: values.title.trim(), date: values.date, time: values.time, repeat: values.repeat, category: values.category, enabled: values.enabled === 'on' };
    if (existing) Object.assign(existing, fields);
    else data.reminders.push({ ...fields, id: crypto.randomUUID(), automatic: false, completed: [] });
    save(); dialog.close(); filter = 'all'; view = 'dashboard'; render(); toast(existing ? 'შეხსენება განახლდა' : 'შენი პატარა გეგმა დაემატა ♡');
  }
});

dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
// Keep recurring reminders and the date current when an open tab crosses midnight.
let renderedDate = localDate();
setInterval(() => { if (renderedDate !== localDate()) { renderedDate = localDate(); if (!dialog.open && view !== 'profile') render(); } }, 30000);
render();
