import { localDate as browserLocalDate, nextOccurrence, completionKey, suggestedReminders } from './model.js';
import { parseVideoUrl, lessonsForStage, lessonCategories, migrateLessonState } from './lessons.js';
import { proPrice, trialStatus, startProTrial, weekStart, shiftDate, weeklyTemplate, migrateProState, remindersToCalendar } from './pro.js';
import { ideaCategories, ideaStatuses, filterIdeas, validateIdea } from './ideas.js';
import { accountRequest, authCall, setAccountOwner, browserZone, pushSupport, currentSubscription, enablePush, disablePush, serviceWorkerReady } from './account-client.js';

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
  play: '<rect x="3" y="4" width="18" height="16" rx="4"/><path d="m10 8 6 4-6 4V8Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  logout: '<path d="M9 4H4v16h5m5-12 4 4-4 4m-6-4h14"/>'
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.heart}</svg>`;
const logo = () => '<img class="brand-image" src="assets/dediko-logo.jpg" alt="DediKo — დედასა და ბავშვზე ზრუნვა" width="210" height="74">';
const emptyData = () => ({ version: 1, profile: null, reminders: [], lessons: [], completedLessons: [], pro: null, plannerTasks: [], plannerNotes: {} });
let data = load();
const account = { ready:false, user:null, revision:0, timezone:browserZone(), status:'loading', dirty:false, conflict:false, generation:0, config:null, subscribed:false, pushBusy:false };
const localDate = (now = new Date()) => account.user ? new Intl.DateTimeFormat('en-CA', { timeZone:account.timezone, year:'numeric',month:'2-digit',day:'2-digit' }).format(now) : browserLocalDate(now);
const requestedPage = new URLSearchParams(location.search).get('page');
let view = ['pro','ideas'].includes(requestedPage) ? requestedPage : location.hash === '#team' ? 'landing' : data.profile ? 'dashboard' : 'landing';
let filter = 'today';
let demo = false;
let beforeDemoData = null;
let toastTimer;
let lessonFilter = 'all';
let lessonSearch = '';
let plannerWeek = weekStart();
let pendingProTrial = false;
let renderedDate = localDate();
let renderedProActive = trialStatus(data.pro).active;
let ideaBoard = {items:[],loaded:false,loading:false,error:'',busy:false};
let ideaFilters = {category:'all',status:'all',search:'',sort:'popular',mine:false};
let ideaDraft = null;

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved?.version === 1 && Array.isArray(saved.reminders) && (saved.profile === null || ['pregnant', 'mother'].includes(saved.profile?.stage))) return migrateProState(migrateLessonState(saved));
  } catch { /* A fresh local space can still be used when storage is unavailable. */ }
  return emptyData();
}
function save() {
  if (demo) return;
  if (account.user) { queueCloudSave(); return; }
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
  return `<header class="site-header wrap"><a class="brand" href="#" aria-label="Dediko მთავარი">${logo()}</a><nav aria-label="მთავარი ნავიგაცია"><a href="#how">როგორ მუშაობს</a><a href="#for-you">შენთვის</a><a href="#reminders">შეხსენებები</a><a href="#video-lessons">ვიდეოები</a><a href="?page=pro" data-action="pro" class="pro-nav-link">Dediko Pro ✧</a><a href="?page=ideas" data-action="ideas">იდეები</a><a href="#team">გუნდი</a></nav><button class="button button-small" data-action="register">შექმენი შენი სივრცე ${icon('arrow')}</button></header>
  <main id="main"><section class="hero wrap"><div class="hero-copy"><div class="eyebrow"><span class="tiny-heart">${icon('heart')}</span> შენთან, დედობის ყოველ ნაბიჯზე</div><h1>ახალი სიცოცხლე.<br>ახალი შენ.<br><span>ერთად, უფრო მშვიდად.</span></h1><p>პატარას მოლოდინიდან პირველ ჩახუტებამდე —<br class="desktop-break"> შენი პირადი სივრცე ზრუნვისთვის, დაგეგმვისთვის<br class="desktop-break"> და ყველაფრის მშვიდად მოსასწრებად.</p><div class="hero-actions"><button class="button" data-action="register">დაიწყე შენი ამბავი ${icon('arrow')}</button><button class="text-button" data-action="demo">დაათვალიერე სივრცე <span>↗</span></button></div><div class="hero-note">${icon('check')} შენი ტემპით ${icon('check')} შენზე მორგებული ${icon('check')} სიყვარულით შექმნილი</div></div>
  <div class="hero-art"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><span class="art-spark spark-one">✧</span><span class="art-spark spark-two">✧</span><div class="floating-note note-top">${icon('heart')} <span>პატარა ნაბიჯები,<br><strong>დიდი სიყვარული</strong></span></div><div class="preview-card"><div class="preview-top"><span class="preview-avatar">ა</span><div><span class="mini-label">შენი ყოველდღიური თანამგზავრი</span><strong>დილა მშვიდობისა, დედიკო <span class="pink">♡</span></strong></div><span class="preview-dot"></span></div><div class="preview-greeting"><span class="tag">${icon('spark')} შენი სივრცის მაგალითი</span><h2>დღეს საკუთარ თავსაც<br>მოუსმინე.</h2><p>ყველა პატარა ზრუნვა მნიშვნელოვანია.</p><div class="greeting-flower" aria-hidden="true">✿</div></div><div class="preview-reminders"><div class="row-between"><h3>დღის პატარა გეგმები</h3><span class="mini-label">დღეს</span></div><div class="preview-reminder">${icon('heart', 'pink')}<span><strong>დრო შენზე ზრუნვისთვის</strong><small>ცოტა შეისვენე და ამოისუნთქე</small></span><span class="preview-time">10:00</span></div><div class="preview-reminder">${icon('calendar', 'blue')}<span><strong>შენი დაგეგმილი ვიზიტი</strong><small>ყველაფერი ერთ სივრცეში</small></span><span class="preview-time">14:30</span></div><div class="preview-reminder completed">${icon('check')}<span><strong>ერთი პატარა ნაბიჯი შენთვის</strong><small>დღეს უკვე მოასწარი</small></span><span class="preview-time">09:00</span></div></div><div class="preview-bottom"><span class="progress-dots"><i></i><i></i><i></i><i></i><i></i></span><span>შენ შესანიშნავად ართმევ თავს ♡</span></div></div><div class="floating-note note-bottom"><span class="note-bell">${icon('bell')}</span><span><strong>შენთვის მნიშვნელოვანს</strong><br>ერთად გავიხსენებთ.</span><span class="note-heart">♡</span></div></div></section>
  <div class="promise-strip"><div class="wrap">${icon('leaf')} ცოტა მეტი სიმშვიდე <span>✦</span> ცოტა ნაკლები საფიქრალი <span>✦</span> მეტი დრო შენთვის და პატარასთვის ${icon('heart')}</div></div>
  <section class="section wrap" id="for-you"><div class="section-heading"><div><span class="eyebrow">ყოველი ეტაპი განსაკუთრებულია</span><h2>შენი ამბავი. შენი სივრცე.</h2></div><p>სადაც არ უნდა იყო დედობის გზაზე,<br>Dediko შენთან ერთად იცვლება.</p></div><div class="journey-grid"><article class="journey-card pregnancy"><div class="journey-icon">${icon('heart')}</div><span class="mini-label">პატარას მოლოდინში</span><h3>ახალი დასაწყისისთვის</h3><p>შენი გეგმები, პირადი შეხსენებები და დრო საკუთარ თავზე ზრუნვისთვის — ორსულობის განმავლობაში.</p><button class="text-button" data-action="register-pregnant">ორსული ვარ ${icon('arrow')}</button><div class="journey-decoration" aria-hidden="true">♡</div></article><article class="journey-card motherhood"><div class="journey-icon">${icon('baby')}</div><span class="mini-label">პირველი დღეები ერთად</span><h3>შენთვის და შენი პატარასთვის</h3><p>მოაწესრიგე ახალი ყოველდღიურობა, ჩაინიშნე პატარას რუტინა და შენთვისაც დაიტოვე დრო.</p><button class="text-button" data-action="register-mother">ახალბედა დედა ვარ ${icon('arrow')}</button><div class="journey-decoration" aria-hidden="true">✿</div></article></div></section>
  <section class="section how-section" id="how"><div class="wrap"><div class="center-heading"><span class="eyebrow">მარტივად, ზედმეტი ფიქრის გარეშე</span><h2>შენი სივრცე, სამ პატარა ნაბიჯში</h2></div><div class="steps"><article><span class="step-number">01</span><h3>გაგვაცანი შენი თავი</h3><p>აირჩიე შენი ეტაპი — ორსულად ხარ თუ უკვე ახალბედა დედა.</p></article><article><span class="step-number">02</span><h3>მოირგე ყოველდღიურობა</h3><p>ჩართე შეთავაზებული შეხსენებები და დაამატე შენი პირადი გეგმები.</p></article><article><span class="step-number">03</span><h3>გაიარე გზა შენი ტემპით</h3><p>ცხოვრება იცვლება? პროფილიდან შეცვალე ეტაპი და სივრცეც მოგერგება.</p></article></div></div></section>
  <section class="section wrap" id="reminders"><div class="reminder-feature"><div class="feature-symbol">${icon('bell')}<span>♡</span></div><div><span class="eyebrow">ნაკლები „არ დამავიწყდეს“</span><h2>მნიშვნელოვანი ამბები<br>თავის დროს გაგახსენდება.</h2><p>შენი შეხსენებები და შენს ეტაპზე მორგებული შეთავაზებები ერთად.<br>დრო, განმეორება და ცვლილებები — ყველაფერი შენს ხელშია.</p></div><button class="button" data-action="register">შექმენი პირველი შეხსენება ${icon('plus')}</button></div></section>
  <section class="section wrap lesson-landing" id="video-lessons"><div class="section-heading"><div><span class="eyebrow">ცოდნა მეტი სიმშვიდისთვის</span><h2>ვიდეოგაკვეთილები, შენს ეტაპზე.</h2></div><p>უყურე, როცა დრო და სურვილი გაქვს.<br>შენი ტემპით, შენს სივრცეში.</p></div><div class="lesson-landing-grid"><article class="lesson-preview"><div class="lesson-preview-icon">${icon('heart')}</div><div><span class="eyebrow">ორსულებისთვის</span><h3>მოემზადე ახალი დასაწყისისთვის</h3><p>მშობიარობისთვის მზადება, სუნთქვა და მოდუნება — მოსამზადებელი ვიდეოების სერია.</p></div></article><article class="lesson-preview lesson-preview-blue"><div class="lesson-preview-icon">${icon('baby')}</div><div><span class="eyebrow">ახალბედა დედებისთვის</span><h3>პირველი დღეები, მეტი თავდაჯერებით</h3><p>მშობიარობის შემდგომი პერიოდი და პირველი დღეები პატარასთან — ერთ ბიბლიოთეკაში.</p></div></article></div><button class="text-button" data-action="lessons">აღმოაჩინე შენი გაკვეთილები ${icon('arrow')}</button></section>
  <section class="wrap"><div class="idea-landing-promo"><span class="eyebrow">შენთან ერთად ვქმნით Dediko-ს</span><h2>რა გაგიმარტივებდა ყოველდღიურობას?</h2><p>გაგვიზიარე იდეა, მხარი დაუჭირე სხვების მოთხოვნებს<br>და თვალი ადევნე, რას ვამატებთ Dediko-ში.</p><button class="text-button" data-action="ideas">იდეები Dediko-სთვის ${icon('arrow')}</button></div></section>
  <section class="wrap"><div class="pro-landing-promo"><div><span class="pro-label">${icon('spark')} DEDIKO PRO</span><h2>მეტი სივრცე შენი გეგმებისთვის.</h2><p>პერსონალური კვირის გეგმა, ჩანაწერები და კალენდრის ექსპორტი.<br>გამოსცადე Pro 7 დღით — ბარათის გარეშე.</p></div><button class="button" data-action="pro">აღმოაჩინე Dediko Pro ${icon('spark')}</button></div></section>
  <section class="section wrap team-section" id="team" aria-labelledby="team-title"><div class="section-heading"><div><span class="eyebrow">ადამიანები Dediko-ს მიღმა</span><h2 id="team-title">გაიცანი ჩვენი გუნდი</h2></div><p>იდეა და ტექნოლოგია ერთი მიზნისთვის —<br>დედობის ყოველდღიურობა უფრო მარტივი გახდეს.</p></div><div class="team-grid"><article class="team-card"><div class="team-portrait"><img src="assets/anna.png" alt="ანნა — Dediko-ს იდეის ავტორი" width="1087" height="1447" loading="lazy" decoding="async"><span class="team-role-marker">${icon('heart')} იდეიდან იწყება</span></div><div class="team-card-content"><div class="team-name-row"><h3>ანნა</h3><span aria-hidden="true">${icon('heart')}</span></div><span class="team-role">იდეის ავტორი</span><p>Dediko-ს იდეისა და მიმართულების ავტორი — დედებისთვის უფრო თბილი და მოსახერხებელი სივრცის შესაქმნელად.</p></div></article><article class="team-card team-card-developer"><div class="team-portrait"><img src="assets/temo.PNG" alt="თემო — Dediko-ს დეველოპერი" width="1086" height="1448" loading="lazy" decoding="async"><span class="team-role-marker">${icon('spark')} იდეიდან რეალობამდე</span></div><div class="team-card-content"><div class="team-name-row"><h3>თემო</h3><span aria-hidden="true">${icon('spark')}</span></div><span class="team-role">დეველოპერი · ტექნიკური განვითარება</span><p>იდეას ციფრულ გამოცდილებად აქცევს — ქმნის და ავითარებს პლატფორმას, რომ Dediko-ს გამოყენება მარტივი იყოს.</p></div></article></div></section>
  <section class="closing wrap"><span class="closing-star">✧</span><span class="eyebrow">აქ შენზეც ზრუნავენ</span><h2>დედობა ახალი ამბავია.<br><span>დაწერე ის შენი ტემპით.</span></h2><button class="button" data-action="register">მოდი, ერთად დავიწყოთ ${icon('heart')}</button><p>შექმენი შენი პატარა, მშვიდი სივრცე.</p></section></main><footer class="footer wrap"><a class="brand" href="#">${logo()}</a><p>შენთან, დედობის ყოველ ნაბიჯზე.</p><a class="team-footer-link" href="#team">ჩვენი გუნდი</a><span>© ${new Date().getFullYear()} Dediko</span></footer>`;
}

function currentReminders() {
  return data.reminders.filter(r => !r.automatic || r.stage === data.profile.stage);
}
function isComplete(reminder) {
  return reminder.completed.includes(completionKey(reminder, localDate()));
}
function reminderRow(reminder) {
  const done = isComplete(reminder);
  const date = nextOccurrence(reminder, localDate());
  const overdue = date < localDate() && !done;
  return `<article class="reminder-row ${done ? 'is-done' : ''} ${!reminder.enabled ? 'is-disabled' : ''}"><button class="complete-button ${done ? 'checked' : ''}" aria-label="${escape(reminder.title)} — ${done ? 'შესრულების გაუქმება' : 'შესრულებულად მონიშვნა'}" aria-pressed="${done}" data-action="complete" data-id="${escape(reminder.id)}">${done ? icon('check') : ''}</button><span class="category-icon ${reminder.category === 'baby' || reminder.category === 'visit' ? 'blue-bg' : ''}">${icon(categoryIcon(reminder.category))}</span><div class="reminder-description"><strong>${escape(reminder.title)}</strong><span>${categoryName(reminder.category)} <b>·</b> ${repeatName(reminder.repeat)} ${reminder.automatic ? '<i class="auto-label">შეთავაზებული</i>' : ''}</span></div><div class="reminder-date ${overdue ? 'overdue' : ''}"><strong>${escape(reminder.time)}</strong><small>${date === localDate() ? 'დღეს' : formatDate(date)}</small></div><button class="icon-button" aria-label="რედაქტირება: ${escape(reminder.title)}" data-action="edit-reminder" data-id="${escape(reminder.id)}">${icon('edit')}</button></article>`;
}
function dashboard() {
  const profile = data.profile;
  const reminders = currentReminders();
  const today = reminders.filter(r => r.enabled && nextOccurrence(r, localDate()) <= localDate());
  const done = today.filter(isComplete).length;
  let shown = filter === 'today' ? today : reminders;
  if (filter === 'personal') shown = reminders.filter(r => !r.automatic);
  if (filter === 'suggested') shown = reminders.filter(r => r.automatic);
  shown = [...shown].sort((a, b) => Number(isComplete(a)) - Number(isComplete(b)) || `${nextOccurrence(a, localDate())}${a.time}`.localeCompare(`${nextOccurrence(b, localDate())}${b.time}`));
  return `<div class="dashboard-shell"><aside class="sidebar"><a href="#" class="brand" data-action="home">${logo()}</a><div class="sidebar-label">შენი პირადი სივრცე</div><nav aria-label="პირადი სივრცე"><button class="sidebar-item ${view === 'dashboard' ? 'active' : ''}" data-action="dashboard">${icon('grid')} ჩემი დღე</button><button class="sidebar-item" data-action="all-reminders">${icon('bell')} შეხსენებები <span class="nav-count">${reminders.length}</span></button><button class="sidebar-item ${view === 'lessons' ? 'active' : ''}" data-action="lessons">${icon('play')} ვიდეოგაკვეთილები</button><button class="sidebar-item ${view === 'ideas' ? 'active' : ''}" data-action="ideas">${icon('leaf')} იდეები Dediko-სთვის</button><button class="sidebar-item pro-nav-link ${['pro', 'planner'].includes(view) ? 'active' : ''}" data-action="pro">${icon('spark')} Dediko Pro <span class="pro-mini">${trialStatus(data.pro).active ? 'აქტიური' : 'ახალი'}</span></button><button class="sidebar-item ${view === 'profile' ? 'active' : ''}" data-action="profile">${icon('user')} ჩემი პროფილი</button></nav><div class="sidebar-kind"><span>პატარა შეხსენება</span><div>♡</div><strong>საკუთარ თავზე ზრუნვაც<br>პატარაზე ზრუნვაა.</strong><p>შენც იმსახურებ შესვენებას.</p></div><button class="sidebar-item sidebar-bottom" data-action="${demo ? 'exit-demo' : 'home'}">${icon('logout')} ${demo ? 'დემოდან გასვლა' : 'მთავარი გვერდი'}</button></aside><div class="dashboard-content"><header class="dashboard-header"><div class="mobile-brand">${logo()}</div><span class="header-date">${formatDate(localDate(), { weekday: 'long', day: 'numeric', month: 'long' })}</span><div class="header-right">${trialStatus(data.pro).active ? '<button class="pro-header-badge" data-action="planner">✧ PRO</button>' : ''}<span class="stage-pill">${icon(profile.stage === 'pregnant' ? 'heart' : 'baby')}${stageName(profile.stage)}</span><button class="avatar" data-action="profile" aria-label="ჩემი პროფილი">${escape(profile.name.slice(0, 1))}</button></div></header><nav class="mobile-nav" aria-label="მობილური ნავიგაცია"><button data-action="dashboard">${icon('grid')} ჩემი დღე</button><button data-action="all-reminders">${icon('bell')} შეხსენებები</button><button data-action="lessons">${icon('play')} ვიდეოები</button><button data-action="ideas">${icon('leaf')} იდეები</button><button data-action="pro">${icon('spark')} Pro</button><button data-action="profile">${icon('user')} პროფილი</button></nav><main class="dashboard-main" id="main">${demo ? '<div class="demo-banner"><span>ეს არის დემო სივრცე — ცვლილებები არ შეინახება.</span><button data-action="register">შექმენი შენი სივრცე →</button></div>' : ''}${view === 'profile' ? profileView() : view === 'ideas' ? ideasView() : view === 'pro' ? proView() : view === 'planner' ? plannerView() : view === 'lessons' ? lessonsView() : `<div class="dashboard-title"><div><span class="eyebrow">დღის დასაწყისი შენია</span><h1>გამარჯობა, ${escape(profile.name)} <span>♡</span></h1><p>მოდი, დღესაც პატარა ნაბიჯებით წავიდეთ.</p></div><button class="button" data-action="add-reminder">${icon('plus')} ახალი შეხსენება</button></div><section class="welcome-panel ${profile.stage === 'mother' ? 'mother-panel' : ''}"><div><span class="tag">${icon('spark')} ${profile.stage === 'pregnant' ? 'პატარას მოლოდინში' : 'ახალი დღე, ერთად'}</span><h2>${profile.stage === 'pregnant' ? 'შენი ყველაზე თბილი<br>მოლოდინის დღეები.' : 'პატარა ჩახუტებები.<br>დიდი ახალი ამბავი.'}</h2><p>${profile.stage === 'pregnant' ? 'იყავი საკუთარ თავთან ისეთივე ნაზი, როგორც შენს პატარასთან.' : 'ახალ რიტმს ნელ-ნელა იპოვი. საკუთარ თავსაც მოუსმინე.'}</p><span class="date-caption">${icon('calendar')} ${profile.stage === 'pregnant' ? 'პატარას ველოდებით:' : 'პატარას დაბადების დღე:'} ${formatDate(profile.referenceDate, { day: 'numeric', month: 'long', year: 'numeric' })}</span></div><div class="welcome-art" aria-hidden="true"><span>♡</span><i>✧</i><small>შენ შესანიშნავად<br>ართმევ თავს</small></div></section><div class="dashboard-grid"><section class="reminders-panel"><div class="row-between panel-title"><div><span class="eyebrow">ცოტა მეტი სიმსუბუქე</span><h2>შენი შეხსენებები</h2></div>${icon('bell', 'pink')}</div><div class="tabs" role="group" aria-label="შეხსენებების ფილტრი">${[['today', 'დღეს'], ['all', 'ყველა'], ['personal', 'პირადი'], ['suggested', 'შეთავაზებული']].map(([key, name]) => `<button data-action="filter" data-filter="${key}" aria-pressed="${filter === key}" class="${filter === key ? 'selected' : ''}">${name}</button>`).join('')}</div><div class="reminders-list">${shown.length ? shown.map(reminderRow).join('') : `<div class="empty-state">${icon('leaf')}<h3>${filter === 'today' ? 'დღეს თავისუფალი სივრცე გაქვს' : 'აქ შენი გეგმები გამოჩნდება'}</h3><p>დაამატე შეხსენება და მნიშვნელოვანი ამბები ერთ ადგილას მოაგროვე.</p><button class="text-button" data-action="add-reminder">${icon('plus')} შეხსენების დამატება</button></div>`}</div><button class="add-reminder-inline" data-action="add-reminder">${icon('plus')} კიდევ ერთი პატარა გეგმა</button></section><aside class="day-aside"><section class="day-progress"><span class="eyebrow">შენი დღევანდელი ნაბიჯები</span><div class="progress-ring" style="--progress:${today.length ? (done / today.length) * 100 : 0}%"><div><strong>${done}<small> / ${today.length}</small></strong><span>შესრულებულია</span></div></div><h3>შენი ტემპი საკმარისია ♡</h3><p>ყველაფრის ერთ დღეში<br>მოსწრება საჭირო არ არის.</p></section><section class="tip-card">${icon('spark')}<h3>სივრცე შენთან ერთად იცვლება</h3><p>შეცვალე შენი ეტაპი პროფილიდან და მიიღე შესაბამისი შეხსენებები.</p><button class="text-button" data-action="profile">ჩემი პროფილი ${icon('arrow')}</button></section></aside></div>`}<p class="local-notice">${icon('heart')} ${account.user ? 'შენი პირადი ანგარიში · მონაცემები სინქრონიზდება · შეტყობინებები ჩართე პროფილიდან' : 'ლოკალური სივრცე · ანგარიშის შექმნით მონაცემებს სხვა მოწყობილობაზეც ნახავ'}</p></main></div></div>`;
}

function currentLessons() {
  return lessonsForStage(data.profile.stage, data.lessons);
}

function lessonCard(lesson, index) {
  const watched = data.completedLessons.includes(lesson.id);
  const video = parseVideoUrl(lesson.url);
  const category = lessonCategories(lesson.stage).find(item => item.id === lesson.category)?.label || 'სხვა';
  return `<article class="lesson-card ${lesson.stage === 'mother' ? 'lesson-blue' : ''}">
    <button class="lesson-poster" data-action="watch-lesson" data-id="${escape(lesson.id)}" aria-label="გაკვეთილის ყურება: ${escape(lesson.title)}">
      <span class="lesson-number">${String(index + 1).padStart(2, '0')}</span>
      <span class="poster-drawing" aria-hidden="true">${icon(lesson.category === 'newborn' ? 'baby' : lesson.category === 'wellbeing' ? 'leaf' : 'heart')}<i>✧</i></span>
      <span class="lesson-play">${icon('play')}</span>
      <span class="lesson-language">${escape(lesson.language)}</span>
      ${watched ? `<span class="watched-badge">${icon('check')} ნანახია</span>` : ''}
    </button>
    <div class="lesson-card-content"><span class="eyebrow">${category}</span><h2>${escape(lesson.title)}</h2><p>${escape(lesson.description || '')}</p>
      <span class="lesson-author">${escape(lesson.source)} · ${video.provider === 'youtube' ? 'YouTube' : 'Vimeo'}</span>
      <div class="lesson-card-footer"><button class="text-button" data-action="watch-lesson" data-id="${escape(lesson.id)}">${watched ? 'კიდევ ერთხელ ნახვა' : 'გაკვეთილის ნახვა'} ${icon('arrow')}</button>${lesson.personal ? `<button class="icon-button" data-action="edit-lesson" data-id="${escape(lesson.id)}" aria-label="ვიდეოს რედაქტირება: ${escape(lesson.title)}">${icon('edit')}</button>` : icon('play')}</div>
    </div></article>`;
}

function lessonResults() {
  const all = currentLessons();
  const search = lessonSearch.trim().toLocaleLowerCase('ka-GE');
  const filtered = all.filter(lesson =>
    (lessonFilter === 'all' || (lessonFilter === 'watched' ? data.completedLessons.includes(lesson.id) : lesson.category === lessonFilter)) &&
    `${lesson.title} ${lesson.description || ''} ${lesson.source}`.toLocaleLowerCase('ka-GE').includes(search));
  return `<p class="lesson-result-count" role="status">${filtered.length} ვიდეოგაკვეთილი</p><div class="lesson-grid">${filtered.length ? filtered.map(lesson => lessonCard(lesson, all.indexOf(lesson))).join('') : `<div class="empty-state lesson-empty">${icon('play')}<h2>${lessonFilter === 'watched' && !search ? 'პირველი გაკვეთილი წინ გელოდება' : 'გაკვეთილი ვერ მოიძებნა'}</h2><p>${lessonFilter === 'watched' && !search ? 'ყურების შემდეგ მონიშნე ვიდეო ნანახად — აქ შენი პროგრესი გამოჩნდება.' : 'შეცვალე საძიებო სიტყვა ან აირჩიე სხვა კატეგორია.'}</p><button class="text-button" data-action="reset-lesson-filter">ყველა გაკვეთილის ნახვა ${icon('arrow')}</button></div>`}</div>`;
}

function lessonsView() {
  const lessons = currentLessons();
  const watched = lessons.filter(lesson => data.completedLessons.includes(lesson.id)).length;
  return `<div class="dashboard-title"><div><span class="eyebrow">ისწავლე შენი ტემპით</span><h1>ვიდეოგაკვეთილები <span>♡</span></h1><p>${data.profile.stage === 'pregnant' ? 'პატარას მოლოდინში — ცოდნა მეტი სიმშვიდისთვის.' : 'პირველი დღეები ერთად — აღმოაჩინე შენი ახალი ყოველდღიურობა.'}</p></div><button class="button" data-action="add-lesson">${icon('plus')} ჩემი ვიდეოს დამატება</button></div>
    <section class="lesson-intro ${data.profile.stage === 'mother' ? 'lesson-intro-blue' : ''}"><div><span class="tag">${icon(data.profile.stage === 'pregnant' ? 'heart' : 'baby')} ${stageName(data.profile.stage)}</span><h2>ცოტა მეტი ცოდნა.<br>ცოტა მეტი თავდაჯერება.</h2><p>შენს ეტაპზე მორგებული ვიდეოები, ერთ მშვიდ სივრცეში.</p></div><div class="lesson-progress"><span>${icon('play')}</span><strong>${watched} <small>/ ${lessons.length}</small></strong><p>გაკვეთილი მონიშნულია ნანახად</p></div></section>
    <div class="lesson-source-note">${icon('spark')}<p>საწყისი ვიდეოები NHS-ის ოფიციალური ბიბლიოთეკიდანაა და ინგლისურენოვანია. ყოველ გაკვეთილთან მითითებულია წყარო და ენა.</p></div>
    <section class="lesson-library" aria-label="ვიდეოების ბიბლიოთეკა"><div class="lesson-toolbar"><div class="tabs lesson-tabs" role="group" aria-label="გაკვეთილების კატეგორია">${[{ id: 'all', label: 'ყველა' }, ...lessonCategories(data.profile.stage), { id: 'watched', label: 'ნანახი' }].map(category => `<button data-action="lesson-filter" data-filter="${category.id}" class="${lessonFilter === category.id ? 'selected' : ''}" aria-pressed="${lessonFilter === category.id}">${category.label}</button>`).join('')}</div><label class="lesson-search">${icon('search')}<input type="search" name="lessonSearch" aria-label="გაკვეთილის ძიება" placeholder="მოძებნე გაკვეთილი" value="${escape(lessonSearch)}" maxlength="100"></label></div><div id="lesson-results">${lessonResults()}</div></section>`;
}

function lessonDialog(id) {
  const lesson = data.lessons.find(item => item.id === id);
  const stage = lesson?.stage || data.profile.stage;
  openDialog(`<div class="dialog-symbol">${icon('play')}</div><h2 id="dialog-title">${lesson ? 'ჩემი ვიდეოს რედაქტირება' : 'შენი ვიდეობიბლიოთეკა'}</h2><p class="dialog-intro">შეინახე სასურველი YouTube ან Vimeo ვიდეო შენს სივრცეში.</p><form id="lesson-form" data-id="${escape(id || '')}">
    <label class="field">ვიდეოს სათაური<input name="title" required maxlength="100" value="${escape(lesson?.title || '')}" placeholder="მაგ. ჩემი პირველი ვიდეოგაკვეთილი"></label>
    <label class="field">YouTube ან Vimeo ბმული<input type="url" name="url" required maxlength="500" placeholder="https://www.youtube.com/watch?v=…" value="${escape(lesson?.url || '')}"></label>
    <label class="field">მოკლე აღწერა<textarea name="description" maxlength="240" rows="3" placeholder="რაზეა ეს გაკვეთილი?">${escape(lesson?.description || '')}</textarea></label>
    <div class="field-row"><label class="field">ვისთვისაა?<select name="lessonStage"><option value="pregnant" ${stage === 'pregnant' ? 'selected' : ''}>ორსულებისთვის</option><option value="mother" ${stage === 'mother' ? 'selected' : ''}>ახალბედა დედებისთვის</option></select></label><label class="field">კატეგორია<select name="lessonCategory">${lessonCategories(stage).map(category => `<option value="${category.id}" ${lesson?.category === category.id ? 'selected' : ''}>${category.label}</option>`).join('')}</select></label></div>
    <label class="field">ვიდეოს ენა<select name="language">${['ქართული', 'ინგლისური', 'სხვა'].map(language => `<option ${lesson?.language === language ? 'selected' : ''}>${language}</option>`).join('')}</select></label>
    <p class="form-note">${account.user ? 'დამატებული ბმული შენს ანგარიშში შეინახება.' : 'დამატებული ბმული ამ ბრაუზერში შეინახება.'} საერთო კატალოგში ვიდეოს გამოქვეყნება ამ ფორმით არ ხდება.</p><div class="form-error" role="alert"></div><button class="button full-width" type="submit">${lesson ? 'ცვლილებების შენახვა' : 'ჩემს ბიბლიოთეკაში შენახვა'} ${icon('check')}</button>${lesson ? `<button class="delete-button" type="button" data-action="delete-lesson" data-id="${escape(id)}">ჩემი ვიდეოს წაშლა</button>` : ''}</form>`);
}

function submitLesson(form, values) {
  const error = form.querySelector('.form-error');
  const video = parseVideoUrl(values.url);
  if (!values.title.trim()) { error.textContent = 'მიუთითე ვიდეოს სათაური.'; return; }
  if (!video) { error.textContent = 'მიუთითე კონკრეტული YouTube ან Vimeo ვიდეოს სრული ბმული.'; return; }
  if (!lessonCategories(values.lessonStage).some(category => category.id === values.lessonCategory) || !['pregnant', 'mother'].includes(values.lessonStage)) return;
  const duplicate = lessonsForStage(values.lessonStage, data.lessons).some(lesson => lesson.id !== form.dataset.id && parseVideoUrl(lesson.url)?.url === video.url);
  if (duplicate) { error.textContent = 'ეს ვიდეო ამ ეტაპის ბიბლიოთეკაში უკვე დამატებულია.'; return; }
  const existing = data.lessons.find(lesson => lesson.id === form.dataset.id);
  const fields = { title: values.title.trim(), description: values.description.trim(), url: video.url, stage: values.lessonStage, category: values.lessonCategory, language: values.language, personal: true, source: 'პირადი ბიბლიოთეკა' };
  if (existing) {
    if (existing.url !== fields.url) data.completedLessons = data.completedLessons.filter(id => id !== existing.id);
    Object.assign(existing, fields);
  }
  else data.lessons.push({ ...fields, id: `personal-${crypto.randomUUID()}` });
  save(); dialog.close(); lessonFilter = 'all'; lessonSearch = ''; view = 'lessons'; render();
  toast(values.lessonStage !== data.profile.stage ? 'ვიდეო შეინახა — შესაბამისი ეტაპის არჩევისას გამოჩნდება.' : existing ? 'ვიდეო განახლდა' : 'ვიდეო შენს ბიბლიოთეკაში დაემატა ♡');
}

function watchLesson(id) {
  const lesson = currentLessons().find(item => item.id === id);
  if (!lesson) return;
  const video = parseVideoUrl(lesson.url);
  const watched = data.completedLessons.includes(id);
  openDialog(`<span class="eyebrow">${escape(lesson.language)} · ${video.provider === 'youtube' ? 'YouTube' : 'Vimeo'}</span><h2 id="dialog-title">${escape(lesson.title)}</h2>
    <div class="video-frame"><iframe src="${escape(video.embedUrl)}" title="${escape(lesson.title)}" allow="fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
    <p class="dialog-intro">${escape(lesson.description || '')}</p><div class="lesson-player-actions"><button class="button" data-action="toggle-watched" data-id="${escape(id)}" aria-pressed="${watched}">${icon('check')} ${watched ? 'ნანახის მონიშვნის გაუქმება' : 'მონიშნე ნანახად'}</button><a class="text-button" href="${escape(video.url)}" target="_blank" rel="noopener noreferrer">გახსენი ${video.provider === 'youtube' ? 'YouTube-ზე' : 'Vimeo-ზე'} ↗</a></div>
    <div class="player-attribution">${lesson.sourceUrl ? `<a href="${escape(lesson.sourceUrl)}" target="_blank" rel="noopener noreferrer">წყარო: ${escape(lesson.source)} ↗</a>` : escape(lesson.source)}<p>თუ პლეერი არ ჩაიტვირთა, გამოიყენე ვიდეოს პირდაპირი ბმული.</p></div>`);
  dialog.classList.add('video-dialog');
}

function ideaCard(idea) {
  const category=ideaCategories.find(item=>item.id===idea.category)?.label||'სხვა';
  const status=ideaStatuses.find(item=>item.id===idea.status)||ideaStatuses[0];
  return `<article class="idea-card" id="idea-${escape(idea.id)}"><div class="idea-card-main"><div class="idea-card-meta"><span class="idea-category">${category}</span><span class="idea-status status-${status.id}">${status.label}</span>${idea.mine?'<span class="idea-mine">შენი იდეა</span>':''}</div><h2>${escape(idea.title)}</h2><p>${escape(idea.description)}</p><div class="idea-benefit"><span>რაში დაგეხმარება?</span><p>${escape(idea.benefit)}</p></div>${idea.reply?`<div class="idea-reply"><strong>${icon('heart')} Dediko-ს გუნდის პასუხი</strong><p>${escape(idea.reply)}</p></div>`:''}<div class="idea-card-bottom"><span>${formatDate(idea.createdAt.slice(0,10),{year:'numeric'})}</span><span class="idea-reference">#${escape(idea.id.slice(0,8))}</span>${idea.mine&&idea.votes<=(idea.voted?1:0)?`<button class="text-button" data-action="withdraw-idea" data-id="${escape(idea.id)}" ${ideaBoard.busy?'disabled':''}>იდეის გაუქმება</button>`:''}</div></div><button class="idea-vote ${idea.voted?'voted':''}" data-action="vote-idea" data-id="${escape(idea.id)}" aria-pressed="${Boolean(idea.voted)}" aria-label="${escape(idea.title)} — ${idea.voted?'ხმის გაუქმება':'მეც მჭირდება'}" ${ideaBoard.busy?'disabled':''}><span class="vote-arrow" aria-hidden="true">${idea.voted?'✓':'↑'}</span><strong>${idea.votes}</strong><span>${idea.voted?'შენი ხმაცაა':'მეც მჭირდება'}</span></button></article>`;
}
function ideaResults() {
  if(ideaBoard.loading&&!ideaBoard.loaded) return '<div class="idea-loading" role="status">იდეები იტვირთება…</div>';
  if(ideaBoard.error&&!ideaBoard.loaded) return `<div class="empty-state ideas-error">${icon('leaf')}<h2>იდეების ჩატვირთვა ვერ მოხერხდა</h2><p>${escape(ideaBoard.error)}</p><button class="text-button" data-action="refresh-ideas">ხელახლა ცდა ${icon('arrow')}</button></div>`;
  const ideas=filterIdeas(ideaBoard.items,ideaFilters);
  return `<p class="idea-results-count" role="status">${ideas.length} იდეა${ideaFilters.mine?' · შენი მოთხოვნები':''}</p><div class="idea-list">${ideas.length?ideas.map(ideaCard).join(''):`<div class="empty-state ideas-empty">${icon('leaf')}<h2>${ideaBoard.items.length?'ამ ფილტრით იდეა ვერ მოიძებნა':'პირველი იდეა შეიძლება შენი იყოს ♡'}</h2><p>${ideaBoard.items.length?'შეცვალე ფილტრი ან საძიებო სიტყვა.':'რა გაგიმარტივებდა ორსულობას ან დედობის ყოველდღიურობას? მოგვიყევი.'}</p><button class="text-button" data-action="${ideaBoard.items.length?'reset-idea-filters':'new-idea'}">${ideaBoard.items.length?'ყველა იდეის ნახვა':'პირველი იდეის დამატება'} ${icon('plus')}</button></div>`}</div>`;
}
function ideasView() {
  return `<div class="dashboard-title"><div><span class="eyebrow">შენთან ერთად ვქმნით Dediko-ს</span><h1>იდეები Dediko-სთვის <span>♡</span></h1><p>მოგვიყევი, რა გაკლია. აღმოაჩინე სხვების იდეები და მიეცი ხმა.</p></div><button class="button" data-action="new-idea" ${!ideaBoard.loaded||ideaBoard.busy?'disabled':''}>${icon('plus')} დაამატე შენი იდეა</button></div><section class="ideas-intro"><div><span class="tag">${icon('heart')} Free და Pro — ყველასთვის</span><h2>შენი გამოცდილება.<br>ჩვენი შემდეგი ნაბიჯი.</h2><p>შენ ირჩევ, რა დაგეხმარება ყოველდღიურობაში.<br>გუნდი კი აქვე გაგიზიარებს იდეის სტატუსს.</p></div><div class="ideas-intro-art" aria-hidden="true">${icon('leaf')}<span>✧</span></div></section><div class="idea-guide"><span>${icon('plus')} გაგვიზიარე იდეა</span><span>${icon('heart')} „მეც მჭირდება“</span><span>${icon('spark')} თვალი ადევნე ცვლილებას</span></div><section class="ideas-board" aria-label="იდეების საერთო დაფა"><div class="ideas-toolbar"><label class="lesson-search">${icon('search')}<input name="ideaSearch" type="search" maxlength="100" aria-label="იდეების ძიება" placeholder="მოძებნე, იქნებ უკვე მოითხოვეს…" value="${escape(ideaFilters.search)}"></label><div class="idea-selects"><label><span class="visually-hidden">იდეების სტატუსი</span><select name="ideaStatus" aria-label="იდეების სტატუსი"><option value="all">ყველა სტატუსი</option>${ideaStatuses.map(status=>`<option value="${status.id}" ${ideaFilters.status===status.id?'selected':''}>${status.label}</option>`).join('')}</select></label><label><span class="visually-hidden">იდეების დალაგება</span><select name="ideaSort" aria-label="იდეების დალაგება"><option value="popular" ${ideaFilters.sort==='popular'?'selected':''}>პოპულარული</option><option value="newest" ${ideaFilters.sort==='newest'?'selected':''}>ახალი დამატებული</option></select></label><button class="icon-button" data-action="refresh-ideas" aria-label="იდეების განახლება" ${ideaBoard.loading||ideaBoard.busy?'disabled':''}>↻</button></div></div><div class="idea-categories" role="group" aria-label="იდეების კატეგორიები">${[{id:'all',label:'ყველა'},...ideaCategories].map(category=>`<button class="${ideaFilters.category===category.id?'selected':''}" aria-pressed="${ideaFilters.category===category.id}" data-action="idea-category" data-filter="${category.id}">${category.label}</button>`).join('')}<button class="idea-own-filter ${ideaFilters.mine?'selected':''}" aria-pressed="${ideaFilters.mine}" data-action="my-ideas">ჩემი იდეები</button></div>${ideaBoard.error&&ideaBoard.loaded?`<p class="idea-inline-error" role="alert">${escape(ideaBoard.error)}</p>`:''}<div id="idea-results">${ideaResults()}</div></section><p class="ideas-footnote">ხმები ითვლება თითო ბრაუზერიდან. სტატუსებსა და პასუხებს Dediko-ს გუნდი აახლებს.</p>`;
}
function publicIdeasPage() {
  return `<header class="site-header wrap"><a class="brand" href="/" data-action="home">${logo()}</a><a class="text-button" href="/" data-action="home">მთავარი გვერდი ${icon('arrow')}</a></header><main class="wrap public-ideas-main" id="main">${ideasView()}</main><footer class="footer wrap">${logo()}<p>შენთან, დედობის ყოველ ნაბიჯზე.</p><span>© ${new Date().getFullYear()} Dediko</span></footer>`;
}
async function requestIdeas(method='GET',body) {
  const response=await fetch('/api/ideas',{method,credentials:'same-origin',cache:'no-store',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  let result;try{result=await response.json();}catch{throw new Error('იდეების სერვისი დროებით მიუწვდომელია. მოგვიანებით სცადე.');}
  if(!response.ok) {const error=new Error(result.error||'შენახვა ვერ მოხერხდა.');error.existingId=result.existingId;throw error;}
  if(!Array.isArray(result.ideas)) throw new Error('იდეების პასუხის ფორმატი არასწორია.');
  return result.ideas;
}
async function loadIdeas() {
  if(ideaBoard.loading||ideaBoard.busy)return;
  ideaBoard.loading=true;ideaBoard.error='';if(view==='ideas')render();
  try{ideaBoard.items=await requestIdeas();ideaBoard.loaded=true;}catch(error){ideaBoard.error=error.message;}
  finally{ideaBoard.loading=false;if(view==='ideas')render();}
}
function newIdeaDialog() {
  if(!ideaBoard.loaded||ideaBoard.busy)return;
  const draft=ideaDraft||{};
  openDialog(`<div class="dialog-symbol">${icon('leaf')}</div><span class="eyebrow">შენი იდეა მნიშვნელოვანია</span><h2 id="dialog-title">რას დაამატებდი Dediko-ს?</h2><p class="dialog-intro">აღწერე ერთი კონკრეტული იდეა და გვითხარი, როგორ დაგეხმარებოდა.</p><form id="idea-form"><label class="field">იდეის სათაური<input name="title" required minlength="8" maxlength="100" placeholder="მაგ. შეხსენებების პარტნიორთან გაზიარება" value="${escape(draft.title||'')}"></label><label class="field">კატეგორია<select name="category">${ideaCategories.map(category=>`<option value="${category.id}" ${(draft.category||data.profile?.stage||'other')===category.id?'selected':''}>${category.label}</option>`).join('')}</select></label><label class="field">მოგვიყევი იდეის შესახებ<textarea name="description" required minlength="20" maxlength="1000" rows="4" placeholder="რა ფუნქცია გჭირდება და როგორ გამოიყენებდი?">${escape(draft.description||'')}</textarea></label><label class="field">რაში დაგეხმარებოდა?<textarea name="benefit" required minlength="10" maxlength="400" rows="2" placeholder="რა გაგიმარტივდებოდა ყოველდღიურობაში?">${escape(draft.benefit||'')}</textarea></label><label class="idea-honeypot" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label><label class="idea-publish-consent"><input type="checkbox" name="publish" required ${draft.publish==='on'?'checked':''}><span>ვეთანხმები, რომ იდეა საჯაროდ გამოჩნდება. პირად და სამედიცინო მონაცემებს არ ვუთითებ.</span></label><div class="form-error" role="alert"></div><button class="button full-width" type="submit">იდეის გაგზავნა ${icon('arrow')}</button><p class="idea-form-note">ახალი იდეა მიიღებს სტატუსს „განხილვაშია“. მას შენი პირველი ხმაც დაემატება.</p></form>`);
}
async function submitIdea(form,values) {
  if(ideaBoard.busy)return;
  ideaDraft=values;
  const errorNode=form.querySelector('.form-error');
  const validation=validateIdea({...values,publish:values.publish==='on'});
  if(validation.error){errorNode.textContent=validation.error;return;}
  errorNode.textContent='';ideaBoard.busy=true;form.querySelector('button[type="submit"]').disabled=true;
  try{
    ideaBoard.items=await requestIdeas('POST',{...validation.value,publish:true,website:values.website||''});
    ideaBoard.loaded=true;ideaBoard.error='';ideaDraft=null;dialog.close();ideaFilters={category:'all',status:'all',search:'',sort:'newest',mine:false};toast('შენი იდეა მივიღეთ ♡ ის საერთო დაფაზე გამოჩნდა.');
  }catch(error){errorNode.textContent=error.message;}
  finally{ideaBoard.busy=false;if(form.isConnected)form.querySelector('button[type="submit"]').disabled=false;if(view==='ideas')render();}
}
async function voteIdea(id) {
  if(ideaBoard.busy)return;
  const idea=ideaBoard.items.find(item=>item.id===id);if(!idea)return;
  ideaBoard.busy=true;ideaBoard.error='';render();
  try{ideaBoard.items=await requestIdeas('PATCH',{id,voted:!idea.voted});}catch(error){ideaBoard.error=error.message;}
  finally{ideaBoard.busy=false;if(view==='ideas')render();}
}
async function withdrawIdea(id) {
  if(ideaBoard.busy)return;ideaBoard.busy=true;
  try{ideaBoard.items=await requestIdeas('DELETE',{id});dialog.close();toast('შენი იდეა გაუქმებულია.');}catch(error){toast(error.message);}
  finally{ideaBoard.busy=false;if(view==='ideas')render();}
}

function proView() {
  const status = trialStatus(data.pro);
  return `<div class="pro-heading"><span class="pro-label">${icon('spark')} DEDIKO PRO</span><h1>ცოტა მეტი სივრცე.<br><span>შენი მშვიდი ყოველდღიურობისთვის.</span></h1><p>შენი კვირის გეგმა, პირადი ჩანაწერები და მნიშვნელოვანი ამბები — ერთად.</p></div>
    <div class="pro-demo-notice">${icon('spark')}<p>Pro-ს საცდელი ვერსია · რეალური გადახდა ჯერ არ არის ჩართული. საცდელი პერიოდი ავტომატურად ფასიან გამოწერად არ გადაიქცევა.</p></div>
    ${status.active ? `<section class="pro-active"><div><strong>შენი Pro საცდელი სივრცე აქტიურია ♡</strong><p>დარჩენილია ${status.daysLeft} დღე · დასრულება: ${formatDate(localDate(new Date(data.pro.endsAt)))}</p></div><button class="button" data-action="planner">გახსენი ჩემი გეგმა ${icon('arrow')}</button></section>` : ''}
    <div class="pricing-grid"><article class="price-card"><span class="eyebrow">ყოველდღიური თანამგზავრი</span><h2>Dediko Free</h2><div class="price-amount">0 ₾ <span>/ უფასოდ</span></div><p>ძირითადი სივრცე შენთვის და პატარასთვის.</p><ul><li>${icon('check')} პირადი და შეთავაზებული შეხსენებები</li><li>${icon('check')} ორსულისა და ახალბედა დედის რეჟიმები</li><li>${icon('check')} არსებული უფასო ვიდეობიბლიოთეკა</li><li>${icon('check')} პირადი ვიდეოები და ნახვის ისტორია</li></ul><button class="button price-free-button" data-action="${data.profile ? 'dashboard' : 'register'}">${data.profile ? 'ჩემი უფასო სივრცე' : 'დაიწყე უფასოდ'}</button></article>
    <article class="price-card price-pro"><span class="price-ribbon">მეტი დრო შენთვის</span><span class="eyebrow">ყველაფერი Free-დან და მეტი</span><h2>Dediko Pro ${icon('spark')}</h2><div class="price-amount">${proPrice} ₾ <span>/ თვე</span></div><p>დაგეგმილი ფასი · პირველი 7 დღე საცდელად.</p><ul><li>${icon('check')} პერსონალური კვირის გეგმა</li><li>${icon('check')} ორივე ეტაპის გეგმის შაბლონები</li><li>${icon('check')} კვირის პირადი ჩანაწერები</li><li>${icon('check')} შეხსენებების კალენდარში ექსპორტი</li><li>${icon('check')} ვიდეოების სასწავლო მარშრუტი</li></ul>${status.active ? `<button class="button" data-action="planner">ჩემი Pro სივრცე ${icon('arrow')}</button>` : status.used ? '<button class="button" disabled>საცდელი პერიოდი დასრულებულია</button><p class="price-footnote">ფასიანი გამოწერის შეძენა მოგვიანებით დაემატება.</p>' : `<button class="button" data-action="start-pro-trial">გამოსცადე Pro — 7 დღე ${icon('spark')}</button><p class="price-footnote">ბარათის გარეშე · ავტომატური ჩამოჭრის გარეშე</p>`}</article></div>
    <section class="pro-benefits"><article>${icon('calendar')}<h3>კვირა, შენი ტემპით</h3><p>დაგეგმე საქმეები და მონიშნე შესრულებული. შეინარჩუნე შენი გეგმები ეტაპის შეცვლის დროსაც.</p></article><article>${icon('leaf')}<h3>სივრცე საკუთარი ფიქრებისთვის</h3><p>ყოველ კვირას საკუთარი ჩანაწერი აქვს — იდეებისთვის, კითხვებისა და პატარა აღმოჩენებისთვის.</p></article><article>${icon('heart')}<h3>ყველაფერი შენს ხელშია</h3><p>ექსპორტი გაუკეთე შენს შეხსენებებს და დაამატე ისინი სასურველ კალენდარში.</p></article></section>
    <section class="pro-faq"><h2>პატარა კითხვები, მარტივი პასუხები</h2><details><summary>შეხსენებები ფასიანი ხდება?</summary><p>ძირითადი შეხსენებები და არსებული ვიდეოები Free პაკეტში რჩება. Pro დამატებით დაგეგმვისა და ორგანიზების ხელსაწყოებს გაძლევს.</p></details><details><summary>7 დღის შემდეგ თანხა ჩამომეჭრება?</summary><p>საცდელი ვერსია თანხას არ ჩამოგაჭრის. ამ ეტაპზე ბარათის დამატება და ფასიანი გამოწერის შეძენა ჩართული არ არის.</p></details><details><summary>სად ინახება ჩემი გეგმა?</summary><p>ანგარიშში შესვლის შემდეგ გეგმები და ჩანაწერები შენს პირად ანგარიშში ინახება და სხვა მოწყობილობაზეც ხელმისაწვდომია. ძველი ლოკალური სივრცის გადატანას რეგისტრაციისას თავად ირჩევ.</p></details></section>`;
}

function publicProPage() {
  return `<header class="site-header wrap"><a class="brand" href="/" data-action="home">${logo()}</a><a class="text-button" href="/" data-action="home">მთავარი გვერდი ${icon('arrow')}</a></header><main class="wrap public-pro-main" id="main">${proView()}</main><footer class="footer wrap">${logo()}<p>შენთან, დედობის ყოველ ნაბიჯზე.</p><span>© ${new Date().getFullYear()} Dediko</span></footer>`;
}

function requirePro() {
  if (trialStatus(data.pro).active) return true;
  view = 'pro'; render(); window.scrollTo(0, 0); toast('ეს ფუნქცია Pro სივრცეშია — გაეცანი საცდელ პაკეტს.'); return false;
}

function plannerView() {
  if (!trialStatus(data.pro).active) return proView();
  const tasks = data.plannerTasks.filter(task => task.stage === data.profile.stage && task.week === plannerWeek).sort((a, b) => a.date.localeCompare(b.date));
  const completed = tasks.filter(task => task.done).length;
  const noteKey = `${data.profile.stage}-${plannerWeek}`;
  return `<div class="dashboard-title"><div><span class="pro-label">${icon('spark')} DEDIKO PRO · საცდელი</span><h1>შენი მშვიდი კვირა <span>♡</span></h1><p>პატარა გეგმები, მეტი თავისუფალი სივრცე.</p></div><button class="button" data-action="export-calendar">${icon('calendar')} კალენდარში ექსპორტი</button></div>
    <div class="planner-status"><span>${stageName(data.profile.stage)} · საცდელად დარჩა ${trialStatus(data.pro).daysLeft} დღე</span><button class="text-button" data-action="pro">პაკეტის ნახვა ${icon('arrow')}</button></div>
    <section class="weekly-panel"><div class="week-heading"><div class="week-navigation"><button class="icon-button" data-action="previous-week" aria-label="წინა კვირა">←</button><h2>${formatDate(plannerWeek)} — ${formatDate(shiftDate(plannerWeek, 6), {year:'numeric'})}</h2><button class="icon-button" data-action="next-week" aria-label="შემდეგი კვირა">→</button></div><button class="text-button" data-action="current-week">მიმდინარე კვირა</button></div><div class="week-summary"><span>${completed} / ${tasks.length} გეგმა შესრულებულია</span><div><button class="text-button" data-action="apply-week-template">${icon('spark')} კვირის შაბლონი</button><button class="button button-small" data-action="add-planner-task">${icon('plus')} ახალი გეგმა</button></div></div><div class="planner-tasks">${tasks.length ? tasks.map(task => `<article class="planner-task ${task.done ? 'task-done' : ''}"><button class="complete-button ${task.done ? 'checked' : ''}" aria-pressed="${Boolean(task.done)}" aria-label="${escape(task.title)} — შესრულების შეცვლა" data-action="toggle-planner-task" data-id="${escape(task.id)}">${task.done ? icon('check') : ''}</button><div><strong>${escape(task.title)}</strong><span>${formatDate(task.date, {weekday:'long'})}</span></div><button class="icon-button" data-action="edit-planner-task" data-id="${escape(task.id)}" aria-label="გეგმის რედაქტირება: ${escape(task.title)}">${icon('edit')}</button></article>`).join('') : `<div class="empty-state">${icon('calendar')}<h3>შენი კვირის პირველი პატარა გეგმა</h3><p>აირჩიე შაბლონი ან დაამატე შენი საქმე.</p><button class="text-button" data-action="apply-week-template">კვირის შაბლონის დამატება ${icon('plus')}</button></div>`}</div></section>
    <div class="planner-bottom"><section class="planner-note"><span class="eyebrow">მხოლოდ შენთვის</span><h2>კვირის პატარა ჩანაწერი</h2><form id="planner-notes-form"><label class="field"><span class="visually-hidden">კვირის ჩანაწერი</span><textarea name="note" rows="6" maxlength="2000" placeholder="რას გინდა დაუთმო დრო? რა კითხვები დაგიგროვდა?">${escape(data.plannerNotes[noteKey] || '')}</textarea></label><p>ჩანაწერი ამ კვირასა და შენს არჩეულ ეტაპს ეკუთვნის.</p><button type="submit" class="button button-small">ჩანაწერის შენახვა ${icon('check')}</button></form></section><section class="learning-path"><span class="eyebrow">ისწავლე შენი ტემპით</span><h2>შენი სასწავლო მარშრუტი</h2>${currentLessons().filter(lesson => !lesson.personal).map((lesson, index) => `<button class="learning-path-item" data-action="watch-lesson" data-id="${escape(lesson.id)}"><span>${data.completedLessons.includes(lesson.id) ? icon('check') : String(index + 1).padStart(2, '0')}</span><strong>${escape(lesson.title)}</strong>${icon('play')}</button>`).join('')}<p>ეს ვიდეოები უფასო ბიბლიოთეკაშიც ხელმისაწვდომია.</p></section></div><button class="delete-button" data-action="end-pro-trial">Pro-ს საცდელი რეჟიმის დასრულება</button>`;
}

function plannerTaskDialog(id) {
  if (!requirePro()) return;
  const task = data.plannerTasks.find(item => item.id === id && item.stage === data.profile.stage);
  openDialog(`<div class="dialog-symbol">${icon('calendar')}</div><h2 id="dialog-title">${task ? 'გეგმის რედაქტირება' : 'შენი კვირის ახალი გეგმა'}</h2><p class="dialog-intro">ერთი პატარა ნაბიჯი შენი ყოველდღიურობისთვის.</p><form id="planner-task-form" data-id="${escape(id || '')}"><label class="field">რა გინდა დაგეგმო?<input name="title" required maxlength="120" value="${escape(task?.title || '')}" placeholder="მაგ. მოვამზადო კითხვები ვიზიტისთვის"></label><label class="field">თარიღი<input type="date" name="date" required min="${plannerWeek}" max="${shiftDate(plannerWeek, 6)}" value="${escape(task?.date || (localDate() >= plannerWeek && localDate() <= shiftDate(plannerWeek, 6) ? localDate() : plannerWeek))}"></label><div class="form-error" role="alert"></div><button class="button full-width" type="submit">შენახვა ${icon('check')}</button>${task ? `<button type="button" class="delete-button" data-action="delete-planner-task" data-id="${escape(task.id)}">გეგმის წაშლა</button>` : ''}</form>`);
}

function submitPlanner(form, values) {
  if (!requirePro()) { dialog.close(); return; }
  if (form.id === 'planner-notes-form') {
    data.plannerNotes[`${data.profile.stage}-${plannerWeek}`] = values.note.slice(0, 2000);
    save(); toast('შენი კვირის ჩანაწერი შენახულია ♡'); return;
  }
  if (!values.title.trim() || weekStart(values.date) !== plannerWeek) { form.querySelector('.form-error').textContent = 'მიუთითე სათაური და ამ კვირის თარიღი.'; return; }
  const existing = data.plannerTasks.find(task => task.id === form.dataset.id && task.stage === data.profile.stage);
  if (existing) Object.assign(existing, {title:values.title.trim(),date:values.date});
  else data.plannerTasks.push({id:crypto.randomUUID(),title:values.title.trim(),date:values.date,week:plannerWeek,stage:data.profile.stage,done:false});
  save(); dialog.close(); render(); toast('გეგმა შენახულია');
}

function profileFields(profile) {
  return `<label class="field">შენი სახელი<input name="name" type="text" maxlength="40" autocomplete="given-name" value="${escape(profile?.name || '')}" placeholder="როგორ მოგმართოთ?" required></label><fieldset class="stage-fieldset"><legend>დედობის რომელ ეტაპზე ხარ?</legend>${stageChoices(profile?.stage || 'pregnant')}</fieldset><label class="field"><span id="date-label">${profile?.stage === 'mother' ? 'პატარას დაბადების თარიღი' : 'მშობიარობის მოსალოდნელი თარიღი'}</span><input type="date" name="referenceDate" value="${escape(profile?.referenceDate || '')}" ${profile?.stage === 'mother' ? `max="${localDate()}"` : `min="${localDate()}"`} required></label>`;
}
function profileView() {
  return `<div class="dashboard-title"><div><span class="eyebrow">ყველაფერი შენზე მორგებული</span><h1>ჩემი პროფილი <span>♡</span></h1><p>შენი ამბავი იცვლება — შენი სივრცეც იცვლება.</p></div></div><section class="profile-panel"><div class="profile-heading"><span class="avatar">${escape(data.profile.name.slice(0, 1))}</span><div><h2>შენი ინფორმაცია</h2><p>სტატუსის შეცვლისას პირადი შეხსენებები შენარჩუნდება.</p></div></div><form id="profile-form">${profileFields(data.profile)}<p class="form-note">ახალ ეტაპზე გადასვლისას შესაბამის შეთავაზებულ შეხსენებებს დაინახავ. ძველი ეტაპის შეთავაზებები შეინახება და დროებით დაიმალება.</p><div class="form-error" role="alert"></div><button class="button" type="submit">ცვლილებების შენახვა ${icon('check')}</button></form><div class="profile-pro-card"><div><strong>Dediko ${trialStatus(data.pro).active ? 'Pro ✧' : 'Free'}</strong><p>${trialStatus(data.pro).active ? 'საცდელი პერიოდი · დარჩა ' + trialStatus(data.pro).daysLeft + ' დღე' : 'აღმოაჩინე მეტი შესაძლებლობა Pro-ში'}</p></div><button class="text-button" data-action="pro">პაკეტის ნახვა ${icon('arrow')}</button></div><button class="delete-button" data-action="reset-profile">ლოკალური პროფილის გასუფთავება</button></section>`;
}

function mobileGlassNav() {
  const items=[
    {action:'home',label:'მთავარი',symbol:'grid',active:view==='landing'},
    {action:'lessons',label:'ვიდეოები',symbol:'play',active:view==='lessons'},
    {action:'ideas',label:'იდეები',symbol:'leaf',active:view==='ideas'},
    {action:'dock-menu',label:'მენიუ',symbol:'menu',active:['dashboard','profile','pro','planner'].includes(view)}
  ];
  return `<nav class="mobile-glass-nav" aria-label="ქვედა ნავიგაცია">${items.map(item=>`<button type="button" class="glass-nav-item" data-action="${item.action}" ${item.active?'aria-current="page"':''} ${item.action==='dock-menu'?'aria-haspopup="dialog" aria-controls="form-dialog"':''}>${icon(item.symbol)}<span>${item.label}</span></button>`).join('')}</nav>`;
}
function openMobileMenu() {
  const items=[
    {action:'home',title:'მთავარი გვერდი',symbol:'grid'},
    {action:'dashboard',title:'ჩემი დღე',symbol:'heart'},
    {action:'all-reminders',title:'შეხსენებები',symbol:'bell'},
    {action:'lessons',title:'ვიდეოგაკვეთილები',symbol:'play'},
    {action:'ideas',title:'იდეები Dediko-სთვის',symbol:'leaf'},
    {action:'pro',title:'Dediko Pro',symbol:'spark'},
    {action:'team',title:'ჩვენი გუნდი',symbol:'user'},
    {action:data.profile&&!demo?'profile':'register',title:data.profile&&!demo?'ჩემი პროფილი':'შექმენი შენი სივრცე',symbol:'user'}
  ];
  openDialog(`<span class="eyebrow">შენთან, დედობის ყოველ ნაბიჯზე</span><h2 id="dialog-title">შენი Dediko <span class="pink">♡</span></h2><div class="dock-menu-links">${items.map(item=>`<button type="button" data-action="dock-navigate" data-destination="${item.action}">${icon(item.symbol)}<span>${item.title}</span>${icon('arrow')}</button>`).join('')}</div>`);
  dialog.classList.add('dock-menu-dialog');
}
function render() {
  if (!account.ready) { app.innerHTML='<main class="auth-loading" id="main"><h1>Dediko ♡</h1><p>შენს სივრცეს ვამზადებთ…</p></main>'; return; }
  renderedDate = localDate();
  renderedProActive = trialStatus(data.pro).active;
  app.innerHTML = (view === 'landing' ? landing() : view === 'pro' && !data.profile ? publicProPage() : view === 'ideas' && !data.profile ? publicIdeasPage() : dashboard()) + mobileGlassNav();
  const main = app.querySelector('.dashboard-main');
  if (main && !demo) main.insertAdjacentHTML('afterbegin', accountBanner());
  if (view === 'profile' && !demo) {
    const panel = app.querySelector('.profile-panel');
    panel?.insertAdjacentHTML('beforeend', accountPanel());
    if (account.user) panel?.querySelector('[data-action="reset-profile"]')?.remove();
  }
  if (view === 'landing') app.querySelector('.site-header')?.insertAdjacentHTML('beforeend', `<button class="text-button" data-action="${account.user ? 'dashboard' : 'login'}">${account.user ? 'ჩემი სივრცე' : 'შესვლა'}</button>`);
  document.title = `Dediko — ${view === 'landing' ? 'შენთან, დედობის ყოველ ნაბიჯზე' : view === 'ideas' ? 'იდეები Dediko-სთვის' : view === 'pro' ? 'Dediko Pro' : view === 'planner' ? 'ჩემი Pro გეგმა' : view === 'profile' ? 'ჩემი პროფილი' : view === 'lessons' ? 'ვიდეოგაკვეთილები' : 'ჩემი დღე'}`;
}
function openDialog(content) {
  dialog.classList.remove('video-dialog', 'dock-menu-dialog');
  dialog.innerHTML = `<button class="dialog-close icon-button" data-action="close-dialog" aria-label="დახურვა">${icon('close')}</button>${content}`;
  dialog.showModal();
}
function register(stage = 'pregnant') {
  if (account.user && data.profile && !demo) { view = 'dashboard'; render(); return; }
  const old = load();
  openDialog(`<div class="dialog-symbol">${icon('heart')}</div><span class="eyebrow">კეთილი იყოს შენი მობრძანება</span><h2 id="dialog-title">შენი ამბავი აქ იწყება ♡</h2><p class="dialog-intro">შენი ანგარიში — ყველა მოწყობილობაზე.</p><form id="register-form">${!account.user ? authFields(true) : `<p class="account-email">${escape(account.user.email)}</p>`}${profileFields(onboardingDraft || old.profile || { stage })}${old.profile ? '<label class="switch-field"><span>ამ ბრაუზერის შეხსენებები და ჩანაწერები ჩემს ანგარიშში გადავიტანო</span><input type="checkbox" name="importLocal"></label>' : ''}<p class="form-note">პროფილი, შეხსენებები და ჩანაწერები შენს პირად ანგარიშში შეინახება. შეტყობინებებს ცალკე, შენი ნებართვით ჩართავ.</p><div class="form-error" role="alert"></div><button type="submit" class="button full-width">${account.user ? 'შეინახე ჩემი პროფილი' : 'შექმენი ჩემი ანგარიში'} ${icon('arrow')}</button></form>${!account.user ? '<p class="auth-switch">უკვე გაქვს ანგარიში? <button data-action="login">შესვლა</button></p>' : ''}`);
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
  beforeDemoData = structuredClone(data);
  demo = true;
  const date = new Date();
  date.setDate(date.getDate() + 100);
  data = { ...emptyData(), profile: { name: 'ანა', stage: 'pregnant', referenceDate: localDate(date) }, reminders: suggestedReminders('pregnant') };
  view = 'dashboard'; filter = 'today'; render(); window.scrollTo(0, 0);
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  event.preventDefault();
  let { action } = button.dataset;
  const { id } = button.dataset;
  if (account.user && ['reset-profile','confirm-reset'].includes(action)) return;
  if (['login','forgot-password','verify-email','logout','confirm-logout','retry-sync','reload-cloud','confirm-reload-cloud','download-data','enable-push','disable-push','test-push','retry-push'].includes(action)) { handleAccountAction(action, button); return; }
  if(action==='dock-menu'){openMobileMenu();return;}
  if(action==='dock-navigate'){
    action=button.dataset.destination;
    dialog.close();
    if(action==='team'){
      view='landing';history.replaceState(null,'',location.pathname+'#team');render();document.querySelector('#team')?.scrollIntoView();return;
    }
    if(['dashboard','all-reminders'].includes(action)&&!data.profile)startDemo();
  }
  if(action==='ideas'){view='ideas';history.replaceState(null,'','?page=ideas');render();window.scrollTo(0,0);loadIdeas();return;}
  if(action==='refresh-ideas'){loadIdeas();return;}
  if(action==='new-idea'){newIdeaDialog();return;}
  if(action==='vote-idea'){voteIdea(id);return;}
  if(action==='idea-category'){ideaFilters.category=button.dataset.filter;render();return;}
  if(action==='my-ideas'){ideaFilters.mine=!ideaFilters.mine;render();return;}
  if(action==='reset-idea-filters'){ideaFilters={category:'all',status:'all',search:'',sort:'popular',mine:false};render();return;}
  if(action==='withdraw-idea')return openDialog(`<h2 id="dialog-title">გააუქმებ შენს იდეას?</h2><p class="dialog-intro">იდეა საერთო დაფიდან წაიშლება.</p><button class="button full-width" data-action="confirm-withdraw-idea" data-id="${escape(id)}">დიახ, გავაუქმო იდეა</button><button class="delete-button" data-action="close-dialog">დატოვება</button>`);
  if(action==='confirm-withdraw-idea'){withdrawIdea(id);return;}
  if (action === 'pro') { view = 'pro'; history.replaceState(null, '', '?page=pro'); render(); window.scrollTo(0, 0); return; }
  if (action === 'start-pro-trial') {
    if (!data.profile || demo) { pendingProTrial = true; register(); return; }
    data.pro = startProTrial(data.pro); save(); view = trialStatus(data.pro).active ? 'planner' : 'pro'; render(); window.scrollTo(0, 0); return;
  }
  if (action === 'planner') { if (!requirePro()) return; view = 'planner'; render(); window.scrollTo(0, 0); return; }
  if (['previous-week', 'next-week', 'current-week', 'apply-week-template', 'add-planner-task', 'edit-planner-task', 'toggle-planner-task', 'delete-planner-task', 'export-calendar', 'end-pro-trial', 'confirm-end-pro'].includes(action)) {
    if (!requirePro()) return;
    if (action === 'previous-week') plannerWeek = shiftDate(plannerWeek, -7);
    if (action === 'next-week') plannerWeek = shiftDate(plannerWeek, 7);
    if (action === 'current-week') plannerWeek = weekStart();
    if (action === 'add-planner-task' || action === 'edit-planner-task') return plannerTaskDialog(id);
    if (action === 'apply-week-template') {
      const additions = weeklyTemplate(data.profile.stage, plannerWeek).filter(task => !data.plannerTasks.some(existing => existing.id === task.id));
      data.plannerTasks.push(...additions); save(); toast(additions.length ? 'კვირის შაბლონი დაემატა — მოირგე შენი სურვილით ♡' : 'ამ კვირის შაბლონი უკვე დამატებულია.');
    }
    if (action === 'toggle-planner-task') {
      const task = data.plannerTasks.find(item => item.id === id && item.stage === data.profile.stage);
      if (task) { task.done = !task.done; save(); }
    }
    if (action === 'delete-planner-task') { data.plannerTasks = data.plannerTasks.filter(task => task.id !== id || task.stage !== data.profile.stage); save(); dialog.close(); }
    if (action === 'export-calendar') {
      if (!currentReminders().some(reminder => reminder.enabled)) { toast('ექსპორტისთვის ჯერ ჩართე ან დაამატე შეხსენება.'); return; }
      const url = URL.createObjectURL(new Blob([remindersToCalendar(currentReminders())], {type:'text/calendar;charset=utf-8'}));
      const link = document.createElement('a'); link.href = url; link.download = 'dediko-reminders.ics'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('კალენდრის ფაილი მზადაა — გახსენი შენს კალენდარში.'); return;
    }
    if (action === 'end-pro-trial') return openDialog(`<h2 id="dialog-title">დაასრულებ Pro-ს საცდელ რეჟიმს?</h2><p class="dialog-intro">გეგმები და ჩანაწერები შენახული დარჩება. შენს სივრცეში 7-დღიანი საცდელი პერიოდის თავიდან ჩართვა აღარ იქნება შესაძლებელი.</p><button class="button full-width" data-action="confirm-end-pro">დიახ, დავასრულო საცდელი რეჟიმი</button><button class="delete-button" data-action="close-dialog">გაგრძელება</button>`);
    if (action === 'confirm-end-pro') { data.pro.cancelled = true; save(); dialog.close(); view = 'pro'; }
    render(); return;
  }
  if (action.startsWith('register')) return register(action === 'register-mother' ? 'mother' : 'pregnant');
  if (action === 'close-dialog') return dialog.close();
  if (action === 'demo') return startDemo();
  if (action === 'lessons') {
    if (!data.profile) startDemo();
    view = 'lessons'; lessonFilter = 'all'; lessonSearch = ''; render(); window.scrollTo(0, 0); return;
  }
  if (action === 'lesson-filter') { lessonFilter = button.dataset.filter; render(); return; }
  if (action === 'reset-lesson-filter') { lessonFilter = 'all'; lessonSearch = ''; render(); return; }
  if (action === 'add-lesson') return lessonDialog();
  if (action === 'edit-lesson') return lessonDialog(id);
  if (action === 'watch-lesson') return watchLesson(id);
  if (action === 'delete-lesson') {
    data.lessons = data.lessons.filter(lesson => lesson.id !== id);
    data.completedLessons = data.completedLessons.filter(lessonId => lessonId !== id);
    save(); dialog.close(); render(); toast('პირადი ვიდეო წაიშალა'); return;
  }
  if (action === 'toggle-watched') {
    if (!currentLessons().some(lesson => lesson.id === id)) return;
    const wasWatched = data.completedLessons.includes(id);
    data.completedLessons = wasWatched ? data.completedLessons.filter(lessonId => lessonId !== id) : [...data.completedLessons, id];
    save(); render();
    button.setAttribute('aria-pressed', String(!wasWatched));
    button.innerHTML = `${icon('check')} ${wasWatched ? 'მონიშნე ნანახად' : 'ნანახის მონიშვნის გაუქმება'}`;
    return;
  }
  if (action === 'reset-profile') return openDialog(`<h2 id="dialog-title">ლოკალური სივრცის გასუფთავება?</h2><p class="dialog-intro">ამ ბრაუზერიდან წაიშლება შენი პროფილი და ყველა შენახული შეხსენება. შემდეგ თავიდან შეძლებ სივრცის შექმნას.</p><button class="button full-width" data-action="confirm-reset">დიახ, გაასუფთავე ლოკალური სივრცე</button><button class="delete-button" data-action="close-dialog">გაუქმება</button>`);
  if (action === 'confirm-reset') {
    if (!demo) { try { localStorage.removeItem(storageKey); } catch { toast('ბრაუზერში მონაცემების გასუფთავება ვერ მოხერხდა.'); return; } }
    demo = false; data = load(); view = data.profile ? 'dashboard' : 'landing'; dialog.close(); render(); window.scrollTo(0, 0); return;
  }
  if (action === 'home') { view = 'landing'; history.replaceState(null, '', location.pathname); render(); window.scrollTo(0, 0); }
  if (action === 'exit-demo') { demo = false; data = account.user ? beforeDemoData || emptyData() : load(); beforeDemoData = null; view = 'landing'; render(); window.scrollTo(0, 0); }
  if (['dashboard', 'profile', 'all-reminders'].includes(action)) {
    if (!data.profile) { register(); return; }
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
    const key = completionKey(reminder, localDate());
    reminder.completed = reminder.completed.includes(key) ? reminder.completed.filter(date => date !== key) : [...reminder.completed, key];
    save(); render();
  }
});

document.addEventListener('change', event => {
  if(['ideaStatus','ideaSort'].includes(event.target.name)){ideaFilters[event.target.name==='ideaStatus'?'status':'sort']=event.target.value;document.querySelector('#idea-results').innerHTML=ideaResults();return;}
  if (event.target.name === 'lessonStage') {
    const select = event.target.form.elements.lessonCategory;
    select.innerHTML = lessonCategories(event.target.value).map(category => `<option value="${category.id}">${category.label}</option>`).join('');
    return;
  }
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
  if (['login-form','forgot-form','password-form','verify-form'].includes(form.id)) { event.preventDefault(); submitAuthForm(form); return; }
  if (!['register-form', 'profile-form', 'reminder-form', 'lesson-form', 'planner-task-form', 'planner-notes-form', 'idea-form'].includes(form.id)) return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  const error = form.querySelector('.form-error');
  if (form.id === 'idea-form') { submitIdea(form, values); return; }
  if (form.id.startsWith('planner-')) return submitPlanner(form, values);
  if (form.id === 'lesson-form') return submitLesson(form, values);
  if (form.id === 'register-form' || form.id === 'profile-form') {
    if (!values.name.trim()) { error.textContent = 'გთხოვ, მიუთითე შენი სახელი.'; return; }
    if (!['pregnant', 'mother'].includes(values.stage) || !values.referenceDate) { error.textContent = 'აირჩიე ეტაპი და შესაბამისი თარიღი.'; return; }
    const invalidDate = values.stage === 'mother' ? values.referenceDate > localDate() : values.referenceDate < localDate();
    if (invalidDate) { error.textContent = 'გთხოვ, გადაამოწმე არჩეული თარიღი.'; return; }
    if (form.id === 'register-form') { submitRegistration(form, values); return; }
    data.profile = { name: values.name.trim(), stage: values.stage, referenceDate: values.referenceDate };
    ensureSuggestions();
    if (form.id === 'register-form' && pendingProTrial) { data.pro = startProTrial(data.pro); }
    save();
    if (dialog.open) dialog.close();
    view = form.id === 'profile-form' ? 'profile' : pendingProTrial ? 'planner' : 'dashboard'; pendingProTrial = false; filter = 'today'; lessonFilter = 'all'; lessonSearch = ''; render();
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

document.addEventListener('input', event => {
  if(event.target.name==='ideaSearch'){ideaFilters.search=event.target.value;document.querySelector('#idea-results').innerHTML=ideaResults();return;}
  if(event.target.closest('form')?.id==='idea-form'){ideaDraft=Object.fromEntries(new FormData(event.target.closest('form')));return;}
  if (event.target.name !== 'lessonSearch') return;
  lessonSearch = event.target.value;
  document.querySelector('#lesson-results').innerHTML = lessonResults();
});
dialog.addEventListener('close', () => {
  // Removing the frame also stops playback when the user dismisses with Escape.
  dialog.querySelector('iframe')?.remove();
  dialog.classList.remove('video-dialog');
  dialog.classList.remove('dock-menu-dialog');
  pendingProTrial = false;
});
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
// Keep recurring reminders and the date current when an open tab crosses midnight.
setInterval(() => {
  const active = trialStatus(data.pro).active;
  if (!dialog.open && !document.activeElement?.closest('form') && (renderedProActive !== active || renderedDate !== localDate())) {
    renderedProActive = active; renderedDate = localDate();
    if (['dashboard', 'pro', 'planner'].includes(view)) render();
  }
}, 30000);
let saveTimer, saveRunning = false;
let migrationPending = false;
let onboardingDraft = null;
const draftKey = () => account.user ? `dediko.pending.${account.user.id}` : null;
function rememberDraft() {
  try { localStorage.setItem(draftKey(), JSON.stringify({ document:data, revision:account.revision, timezone:account.timezone })); }
  catch { /* The unsaved indicator and export remain available. */ }
}
function updateAccountStatus() {
  const banner = document.querySelector('#account-banner');
  if (banner) banner.outerHTML = accountBanner();
}
function accountBanner() {
  if (!account.user) return `<div id="account-banner" class="account-status"><p>${account.sessionError ? 'ანგარიშის შემოწმება ვერ მოხერხდა. ეს სივრცე მხოლოდ ამ ბრაუზერშია.' : 'ეს ძველი სივრცე მხოლოდ ამ ბრაუზერშია შენახული.'}</p><button class="text-button" data-action="register">ანგარიშის შექმნა</button><button class="text-button" data-action="login">შესვლა</button></div>`;
  const message = account.conflict ? 'ანგარიში სხვა მოწყობილობიდან შეიცვალა. შენი ცვლილებები ცალკე შენახულია; ანგარიშის ვერსია არ გადაგვიწერია.' : account.status === 'error' ? (account.error || 'ცვლილებები ჯერ ანგარიშში არ შენახულა. სცადე ხელახლა.') : account.dirty ? 'ცვლილებები ინახება…' : 'შენახულია შენს ანგარიშში ♡';
  return `<div id="account-banner" class="account-status ${account.conflict || account.status === 'error' ? 'is-error' : ''}" role="status"><p>${escape(message)}</p>${account.status === 'error' && !account.conflict ? '<button class="text-button" data-action="retry-sync">ხელახლა შენახვა</button>' : ''}${account.needsLogin ? '<button class="text-button" data-action="login">შესვლა</button>' : ''}${account.dirty ? '<button class="text-button" data-action="download-data">ჩამოტვირთე ასლი</button>' : ''}${account.conflict ? '<button class="text-button" data-action="reload-cloud">ანგარიშის ვერსიის ჩატვირთვა</button>' : ''}${!account.dirty ? `<span>${escape(account.user.email)}</span>` : ''}</div>`;
}
function queueCloudSave() {
  account.dirty = true; account.generation++; account.error = '';
  if (!account.conflict) account.status = 'saving';
  rememberDraft(); updateAccountStatus(); clearTimeout(saveTimer);
  if (!account.conflict) saveTimer = setTimeout(flushCloudSave, 450);
}
async function flushCloudSave() {
  clearTimeout(saveTimer);
  if (saveRunning || !account.user || !account.dirty || account.conflict || demo) return;
  saveRunning = true;
  const generation = account.generation, userId = account.user.id;
  const document = structuredClone(data);
  try {
    const result = await accountRequest('account', 'PUT', { document, revision:account.revision, timezone:account.timezone });
    if (account.user?.id !== userId) return;
    account.revision = result.revision;
    if (generation === account.generation) {
      account.dirty = false; account.status = 'saved';
      try { localStorage.removeItem(draftKey()); if (migrationPending) localStorage.removeItem(storageKey); } catch { /* Saved in the cloud. */ }
      migrationPending = false;
    } else rememberDraft();
    if (!result.scheduled) toast('მონაცემები შენახულია. შეტყობინებების დაგეგმვას განმეორება სჭირდება — ნახე პროფილი.');
  } catch (error) {
    account.conflict = error.status === 409; account.needsLogin = error.status === 401; account.status = 'error'; account.error = error.message;
    rememberDraft();
  } finally {
    saveRunning = false; updateAccountStatus();
    if (account.dirty && !account.conflict && account.status !== 'error') saveTimer = setTimeout(flushCloudSave, 100);
  }
}
function adoptAccount(result, restoreDraft = true) {
  setAccountOwner(result.user.id);
  account.user = result.user; account.revision = result.revision; account.timezone = result.timezone || browserZone();
  account.needsLogin = false;
  account.dirty = false; account.conflict = false; account.status = 'saved'; account.sessionError = false; demo = false;
  data = result.document ? migrateProState(migrateLessonState(result.document)) : emptyData();
  if (restoreDraft) try {
    const pending = JSON.parse(localStorage.getItem(draftKey()));
    if (pending?.document?.profile) {
      data = pending.document; account.timezone = pending.timezone; account.dirty = true;
      account.conflict = pending.revision !== result.revision; account.status = 'error';
      account.error = 'ამ მოწყობილობაზე შენახვას ელოდება ცვლილებები. დააჭირე „ხელახლა შენახვას“.';
    }
  } catch { /* No pending draft. */ }
}
async function initializeAccount() {
  try {
    account.config = await accountRequest('config');
    adoptAccount(await accountRequest('account'));
    if (!['pro','ideas'].includes(requestedPage) && location.hash !== '#team') view = data.profile ? 'dashboard' : 'landing';
  } catch (error) {
    account.sessionError = error.status !== 401;
    if (account.sessionError) account.error = error.message;
  }
  account.ready = true;
  if (requestedPage === 'reminders' && data.profile) { view = 'dashboard'; filter = 'all'; }
  render();
  if (view === 'ideas') loadIdeas();
  if (view === 'landing' && location.hash === '#team') document.querySelector('#team')?.scrollIntoView();
  if (new URLSearchParams(location.search).has('token')) passwordDialog();
  else if (new URLSearchParams(location.search).get('error')) { toast('პაროლის აღდგენის ბმული ვადაგასულია. მოითხოვე ახალი.'); authDialog('forgot'); }
  if (account.user) refreshPushState();
}
function authFields(signup = false) {
  return `<label class="field">ელფოსტა<input type="email" name="email" required autocomplete="email" maxlength="254" placeholder="name@example.com"></label><label class="field">პაროლი<input type="password" name="password" required ${signup ? 'minlength="12"' : ''} maxlength="128" autocomplete="${signup ? 'new-password' : 'current-password'}"></label>${signup ? '<p class="auth-help">გამოიყენე მინიმუმ 12 სიმბოლო. პაროლი მხოლოდ ანგარიშების სერვისში იგზავნება.</p>' : ''}`;
}
function authDialog(mode = 'login') {
  if (mode === 'forgot') {
    openDialog(`<h2 id="dialog-title">პაროლის აღდგენა</h2><p class="dialog-intro">გამოგიგზავნით პაროლის აღდგენის ბმულს.</p><form id="forgot-form"><label class="field">ელფოსტა<input type="email" name="email" required autocomplete="email" maxlength="254"></label><div class="form-error" role="alert"></div><button type="submit" class="button full-width">ბმულის გამოგზავნა</button></form><p class="auth-switch"><button data-action="login">შესვლაზე დაბრუნება</button></p>`); return;
  }
  openDialog(`<div class="dialog-symbol">${icon('heart')}</div><h2 id="dialog-title">კეთილი იყოს შენი დაბრუნება ♡</h2><p class="dialog-intro">შედი და გააგრძელე შენი ამბავი ნებისმიერი მოწყობილობიდან.</p><form id="login-form">${authFields()}<div class="form-error" role="alert"></div><button type="submit" class="button full-width">შესვლა ${icon('arrow')}</button></form><p class="auth-switch"><button data-action="forgot-password">პაროლი დაგავიწყდა?</button><button data-action="register">ანგარიშის შექმნა</button><button data-action="verify-email">ელფოსტის დადასტურება</button></p>`);
}
function passwordDialog() {
  openDialog(`<h2 id="dialog-title">ახალი პაროლი</h2><form id="password-form"><label class="field">ახალი პაროლი<input type="password" name="password" minlength="12" maxlength="128" autocomplete="new-password" required></label><div class="form-error" role="alert"></div><button type="submit" class="button full-width">პაროლის შენახვა</button></form>`);
}
function verifyDialog(email = account.user?.email || '', sent = false) {
  openDialog(`<h2 id="dialog-title">ელფოსტის დადასტურება</h2><p class="dialog-intro">${sent ? 'შეამოწმე ელფოსტა და შეიყვანე ერთჯერადი კოდი.' : 'გამოითხოვე ერთჯერადი კოდი შენს ელფოსტაზე.'}</p><form id="verify-form" data-sent="${sent}"><label class="field">ელფოსტა<input type="email" name="email" value="${escape(email)}" ${sent ? 'readonly' : ''} required autocomplete="email"></label>${sent ? '<label class="field">ერთჯერადი კოდი<input name="otp" required inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6"></label>' : ''}<div class="form-error" role="alert"></div><button type="submit" class="button full-width">${sent ? 'დადასტურება' : 'კოდის გამოგზავნა'}</button></form>`);
}
async function withFormBusy(form, work) {
  const buttons = [...form.querySelectorAll('button')]; buttons.forEach(button => button.disabled = true);
  const error = form.querySelector('.form-error'); error.textContent = '';
  try { await work(); } catch (failure) { error.textContent = failure.message; }
  finally { buttons.forEach(button => button.disabled = false); }
}
async function submitRegistration(form, values) {
  await withFormBusy(form, async () => {
    if (!account.user) {
      if (values.password.length < 12) throw new Error('პაროლი მინიმუმ 12 სიმბოლოს უნდა შეიცავდეს.');
      onboardingDraft = { name:values.name, stage:values.stage, referenceDate:values.referenceDate };
      await authCall('signUp.email', { email:values.email, password:values.password, name:values.name.trim() });
      try { adoptAccount(await accountRequest('account'), false); }
      catch (error) { if (error.status === 401) { verifyDialog(values.email); toast('ანგარიში შეიქმნა. შესვლამდე ელფოსტა დაადასტურე.'); return; } throw error; }
    }
    if (data.profile && !demo) throw new Error('ამ ანგარიშში პროფილი უკვე არსებობს. შედი შენს სივრცეში.');
    demo = false; data = values.importLocal === 'on' ? structuredClone(load()) : emptyData();
    migrationPending = values.importLocal === 'on';
    data.profile = { name:values.name.trim(), stage:values.stage, referenceDate:values.referenceDate };
    account.timezone = browserZone(); ensureSuggestions();
    if (pendingProTrial) data.pro = startProTrial(data.pro);
    save(); await flushCloudSave();
    onboardingDraft = null;
    const target = pendingProTrial ? 'planner' : 'dashboard';
    if (dialog.open) dialog.close(); view = target; render(); refreshPushState();
    toast(account.dirty ? 'ანგარიში შეიქმნა. მონაცემების შენახვას განმეორება სჭირდება.' : 'კეთილი იყოს შენი მობრძანება Dediko-ში ♡');
  });
}
async function submitAuthForm(form) {
  const values = Object.fromEntries(new FormData(form));
  await withFormBusy(form, async () => {
    if (form.id === 'login-form') {
      await authCall('signIn.email', values);
      adoptAccount(await accountRequest('account'));
      dialog.close(); view = data.profile ? 'dashboard' : 'landing'; render(); refreshPushState();
      if (!data.profile) register();
    } else if (form.id === 'forgot-form') {
      await authCall('requestPasswordReset', { email:values.email, redirectTo:`${location.origin}/?page=reset-password` });
      openDialog('<h2 id="dialog-title">შეამოწმე ელფოსტა ♡</h2><p class="dialog-intro">თუ ამ ელფოსტაზე ანგარიში არსებობს, აღდგენის ბმულს მიიღებ. შეამოწმე Spam საქაღალდეც.</p><button class="button full-width" data-action="login">შესვლაზე დაბრუნება</button>');
    } else if (form.id === 'password-form') {
      await authCall('resetPassword', { newPassword:values.password, token:new URLSearchParams(location.search).get('token') });
      history.replaceState(null, '', '/'); toast('პაროლი განახლდა. შედი ახალი პაროლით.'); authDialog();
    } else if (form.dataset.sent === 'true') {
      await authCall('emailOtp.verifyEmail', values); dialog.close();
      if (account.user) { account.user.emailVerified = true; render(); } else authDialog();
      toast('ელფოსტა დადასტურებულია ♡');
    } else {
      await authCall('emailOtp.sendVerificationOtp', { email:values.email, type:'email-verification' }); verifyDialog(values.email, true);
    }
  });
}
function accountPanel() {
  if (!account.user) return '<section class="account-panel"><h3>შენი სივრცე ყველა მოწყობილობაზე</h3><p>შექმენი ანგარიში, გადაიტანე ძველი მონაცემები და ჩართე ტელეფონზე შეხსენებები.</p><button class="button" data-action="register">ანგარიშის შექმნა</button><button class="text-button" data-action="login">შესვლა</button></section>';
  const support = pushSupport();
  const description = support === 'iphone-install' ? 'iPhone-ზე გახსენი Safari → გაზიარება → Add to Home Screen. შემდეგ Dediko გახსენი მთავარი ეკრანიდან და აქ ჩართე შეტყობინებები (iOS 16.4 ან ახალი).' : support === 'unsupported' ? 'ამ ბრაუზერში Push შეტყობინებები მიუწვდომელია. სცადე განახლებული Safari, Chrome, Firefox ან Edge.' : 'ჩართე შეხსენებები ამ მოწყობილობაზე. ისინი საიტის დახურვის შემდეგაც მოვა, თუ ბრაუზერისა და ტელეფონის პარამეტრები ამის საშუალებას იძლევა.';
  return `<section class="account-panel"><h3>ჩემი ანგარიში</h3><p>${escape(account.user.email)} · ${account.user.emailVerified ? 'ელფოსტა დადასტურებულია' : 'ელფოსტა ჯერ დაუდასტურებელია'}</p>${!account.user.emailVerified ? '<button class="text-button" data-action="verify-email">ელფოსტის დადასტურება</button>' : ''}<p>შეხსენებების დროის სარტყელი: <strong>${escape(account.timezone)}</strong>. მოწყობილობის მიმდინარე სარტყელი: ${escape(browserZone())}.</p>${account.timezone !== browserZone() ? '<button class="text-button" data-action="use-device-timezone">მოწყობილობის სარტყლის გამოყენება</button>' : ''}<h3>შეტყობინებები ტელეფონზე ${icon('bell')}</h3><span class="notification-state">${account.subscribed ? 'ჩართულია ამ მოწყობილობაზე' : 'გამორთულია ამ მოწყობილობაზე'}</span><p>${description}</p><p>დაბლოკილ ეკრანზე გამოჩნდება მხოლოდ ზოგადი ტექსტი. შეტყობინებაზე დაჭერით შენს შეხსენებებთან გადახვალ.</p>${support === 'supported' ? `<button class="button" data-action="${account.subscribed ? 'disable-push' : 'enable-push'}" ${account.pushBusy ? 'disabled' : ''}>${account.subscribed ? 'ამ მოწყობილობაზე გამორთვა' : 'შეტყობინებების ჩართვა'}</button>${account.subscribed ? `<button class="text-button" data-action="test-push" ${account.pushBusy ? 'disabled' : ''}>ტესტის გაგზავნა</button><button class="text-button" data-action="retry-push">დაგეგმვის განახლება</button>` : ''}` : ''}<p>ინტერნეტის, Focus რეჟიმისა და ბრაუზერის პარამეტრებმა შეიძლება მიწოდება შეაფერხოს. მნიშვნელოვანი ვიზიტებისთვის დამატებით კალენდარიც გამოიყენე.</p><button class="delete-button" data-action="logout">ანგარიშიდან გასვლა</button></section>`;
}
async function refreshPushState() {
  try {
    const subscription = await currentSubscription();
    const state = subscription ? await accountRequest('push', 'POST', { action:'status', endpoint:subscription.endpoint }) : { subscribed:false };
    account.subscribed = state.subscribed;
    if (state.pending) toast('ზოგი შეხსენება დაგეგმვას ელოდება. პროფილში დააჭირე „დაგეგმვის განახლებას“.');
    if (view === 'profile' && !dialog.open && !document.activeElement?.closest('form')) render();
  } catch { account.subscribed = false; }
}
async function handleAccountAction(action, button) {
  if (action === 'login') { authDialog(); return; }
  if (action === 'forgot-password') { authDialog('forgot'); return; }
  if (action === 'verify-email') { verifyDialog(); return; }
  if (action === 'download-data') { downloadData(); return; }
  if (action === 'retry-sync') { account.status = 'saving'; await flushCloudSave(); return; }
  if (action === 'reload-cloud') { openDialog('<h2 id="dialog-title">ჩაიტვირთოს ანგარიშის ვერსია?</h2><p class="dialog-intro">ამ მოწყობილობის შეუნახავი ცვლილებები შეიცვლება. ჯერ ჩამოტვირთე ასლი, თუ მათი შენარჩუნება გჭირდება.</p><button class="text-button" data-action="download-data">ასლის ჩამოტვირთვა</button><button class="button full-width" data-action="confirm-reload-cloud">ანგარიშის ვერსიის ჩატვირთვა</button>'); return; }
  if (action === 'logout' && account.dirty) { openDialog('<h2 id="dialog-title">ცვლილებები ჯერ არ შენახულა</h2><p class="dialog-intro">გასვლით ამ მოწყობილობაზე შეუნახავი ცვლილებები გასუფთავდება. შეგიძლია ჩამოტვირთო ასლი ან დაბრუნდე და გაიმეორო შენახვა.</p><button class="text-button" data-action="download-data">ასლის ჩამოტვირთვა</button><button class="button full-width" data-action="confirm-logout">გასვლა და შეუნახავი ცვლილებების გასუფთავება</button>'); return; }
  button.disabled = true;
  try {
    if (action === 'confirm-reload-cloud') {
      const result = await accountRequest('account');
      try { localStorage.removeItem(draftKey()); } catch { /* Clear memory as well. */ }
      adoptAccount(result, false); dialog.close(); view = data.profile ? 'dashboard' : 'landing'; render(); return;
    }
    if (['logout','confirm-logout'].includes(action)) {
      if (saveRunning) throw new Error('შენახვა მიმდინარეობს. ცოტა ხანში სცადე.');
      clearTimeout(saveTimer);
      await disablePush(); await authCall('signOut');
      try { localStorage.removeItem(draftKey()); } catch { /* No local cloud cache. */ }
      account.user = null; account.dirty = false; account.conflict = false; account.subscribed = false;
      try { localStorage.setItem('dediko.signed-out', String(Date.now())); } catch { /* Other tabs also revalidate on focus. */ }
      data = load(); demo = false; view = 'landing'; if (dialog.open) dialog.close(); history.replaceState(null, '', '/'); render(); return;
    }
    if (!account.user) throw new Error('ჯერ შედი შენს ანგარიშში.');
    account.pushBusy = true;
    if (action === 'enable-push') {
      if (!account.config?.pushPublicKey) throw new Error('შეტყობინებების სერვისი ჯერ მზად არ არის.');
      const result = await enablePush(account.config.pushPublicKey); account.subscribed = true;
      toast(result.scheduled ? 'შეტყობინებები ჩაირთო ♡ შეგიძლია გაგზავნო ტესტი.' : 'მოწყობილობა შეინახა. დაგეგმვის განახლება ჯერ საჭიროა.');
    } else if (action === 'disable-push') { await disablePush(); account.subscribed = false; toast('ამ მოწყობილობაზე შეტყობინებები გამოირთო.'); }
    else {
      const subscription = await currentSubscription();
      if (!subscription) throw new Error('ჯერ ჩართე შეტყობინებები.');
      await accountRequest('push', 'POST', { action:action === 'test-push' ? 'test' : 'retry', endpoint:subscription.endpoint });
      toast(action === 'test-push' ? 'ტესტი შეტყობინებების სერვისს გადაეცა ♡' : 'შეხსენებების დაგეგმვა განახლდა.');
    }
  } catch (error) { toast(error.message); }
  finally { account.pushBusy = false; button.disabled = false; if (view === 'profile' && !dialog.open) render(); }
}
function downloadData() {
  const blob = new Blob([JSON.stringify({ ...data, timezone:account.timezone }, null, 2)], { type:'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `dediko-${localDate()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
document.addEventListener('click', event => {
  if (event.target.closest('[data-action="use-device-timezone"]')) {
    account.timezone = browserZone(); save(); render(); toast('შეხსენებების დროის სარტყელი განახლდა.');
  }
});
window.addEventListener('beforeunload', event => { if (account.dirty) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('online', () => { if (account.dirty && !account.conflict) { account.status = 'saving'; flushCloudSave(); } });
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !account.user || account.dirty || saveRunning || demo || dialog.open || document.activeElement?.closest('form')) return;
  try {
    const result = await accountRequest('account');
    if (result.revision !== account.revision) { adoptAccount(result); if (!data.profile) view = 'landing'; render(); }
  } catch (error) { if (error.status === 401) { clearAccountSession(); toast('შენი სესია დასრულდა ან ანგარიში შეიცვალა. ხელახლა შედი.'); } }
});
function clearAccountSession() {
  clearTimeout(saveTimer);
  try { if (draftKey()) localStorage.removeItem(draftKey()); } catch { /* Clear the in-memory account too. */ }
  setAccountOwner(null); account.user = null; account.dirty = false; account.conflict = false; account.subscribed = false;
  data = load(); demo = false; view = 'landing'; if (dialog.open) dialog.close(); render();
}
window.addEventListener('storage', event => { if (event.key === 'dediko.signed-out' && account.user) clearAccountSession(); });
render();
initializeAccount();
if ('serviceWorker' in navigator && window.isSecureContext) serviceWorkerReady().catch(() => {});
