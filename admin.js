import { accountRequest, authCall, setAccountOwner } from './account-client.js';
import { ideaCategories, ideaStatuses } from './ideas.js';
import { lessonCategories } from './lessons.js';

const app = document.querySelector('#admin-app');
const editor = document.querySelector('#admin-editor');
const labels = { overview: 'მიმოხილვა', ideas: 'იდეები', lessons: 'ვიდეოგაკვეთილები' };
const stages = { pregnant: 'ორსულებისთვის', mother: 'ახალბედა დედებისთვის' };
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const brand = '<a class="admin-brand" href="/"><img src="/assets/dediko-logo.jpg" alt="Dediko" width="144" height="56"></a>';
let user = null;
let section = 'overview';
let data = null;
let errorMessage = '';
let loading = false;
let access = 'checking';
let requestNumber = 0;
let notice = '';

function options(items, value) {
  return items.map(({ id, label }) => `<option value="${escape(id)}"${id === value ? ' selected' : ''}>${escape(label)}</option>`).join('');
}

function accessView() {
  const login = `<form id="admin-login">
    <label>ელფოსტა<input name="email" type="email" autocomplete="username" maxlength="254" required></label>
    <label>პაროლი<input name="password" type="password" autocomplete="current-password" maxlength="128" required></label>
    <button class="primary" type="submit">შესვლა</button>
  </form>`;
  const action = {
    login,
    denied: '<button data-action="logout">სხვა ანგარიშით შესვლა</button>',
    error: '<button data-action="retry">ხელახლა ცდა</button>',
    checking: '<p role="status">ანგარიშს ვამოწმებთ…</p>'
  };
  return `<main class="access-card">${brand}<h1>მართვის პანელი</h1>
    <p>შედი Dediko-ს ადმინის ანგარიშით.</p>
    <p class="form-error" role="alert">${escape(errorMessage)}</p>
    ${action[access]}<a class="back-link" href="/">საიტზე დაბრუნება ↗</a>
  </main>`;
}

function overview() {
  const metrics = [
    ['შევსებული პროფილები', data.counts.profiles],
    ['გამოქვეყნებული ვიდეოები', data.counts.lessons],
    ['ხილული იდეები', data.counts.ideas],
    ['განხილვაში მყოფი იდეები', data.counts.reviewing]
  ];
  return `<dl class="admin-metrics">${metrics.map(([label, value]) =>
    `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>
    <div class="admin-panel"><h2>საიტის შიგთავსი</h2>
      <p>განაახლე ვიდეოების კატალოგი ან უპასუხე მომხმარებლების იდეებს.</p>
      <div class="admin-actions"><button class="primary" data-section="lessons">ვიდეოების მართვა</button>
      <button data-section="ideas">იდეების განხილვა</button></div>
    </div>`;
}

function contentList() {
  const isLesson = section === 'lessons';
  const items = isLesson ? data.lessons : data.ideas;
  return `<section class="admin-panel">
    <div class="list-header">
      <label class="search-field">ძიება<input type="search" id="admin-search" placeholder="მოძებნე სათაურით" maxlength="100"></label>
      ${isLesson ? '<button class="primary" data-action="add-lesson">+ ვიდეოს დამატება</button>' : ''}
    </div>
    <div id="admin-list">${items.map(item => {
      const category = isLesson ? stages[item.stage] : ideaCategories.find(entry => entry.id === item.category)?.label;
      const status = isLesson
        ? (item.published ? 'გამოქვეყნებულია' : 'მონახაზი')
        : (item.hidden ? 'დამალულია' : ideaStatuses.find(entry => entry.id === item.status)?.label);
      return `<article class="admin-row" data-title="${escape(item.title.toLocaleLowerCase('ka-GE'))}">
        <div><h2>${escape(item.title)}</h2>
          <p>${escape(category)} · ${isLesson ? escape(item.language) : `${item.votes} ხმა`}</p></div>
        <span class="admin-chip">${escape(status)}</span>
        <button data-action="edit" data-id="${escape(item.id)}">რედაქტირება</button>
      </article>`;
    }).join('')}</div>
    <p id="empty-list"${items.length ? ' hidden' : ''}>ჩანაწერი ვერ მოიძებნა.</p>
  </section>`;
}

function render() {
  if (access !== 'allowed') {
    app.innerHTML = accessView();
    return;
  }
  let content;
  if (loading) content = '<p class="admin-panel" role="status">მონაცემები იტვირთება…</p>';
  else if (errorMessage) content = `<div class="admin-panel"><p role="alert">${escape(errorMessage)}</p><button data-action="retry">ხელახლა ცდა</button></div>`;
  else content = section === 'overview' ? overview() : contentList();
  app.innerHTML = `<div class="admin-shell">
    <aside class="admin-sidebar">${brand}<p>საიტის მართვა</p>
      <nav aria-label="მართვის განყოფილებები">${Object.entries(labels).map(([id, label]) =>
        `<button data-section="${id}" ${section === id ? 'aria-current="page"' : ''}>${label}</button>`).join('')}</nav>
    </aside>
    <main class="admin-main">
      <header class="admin-top"><a href="/">საიტზე გადასვლა ↗</a><button data-action="logout">გასვლა</button></header>
      <p class="admin-kicker">DEDIKO ADMIN</p><h1 tabindex="-1">${labels[section]}</h1>
      <p class="admin-notice" role="status"${notice ? '' : ' hidden'}>${escape(notice)}</p>
      ${content}
    </main>
  </div>`;
}

async function openSection(next) {
  const request = ++requestNumber;
  section = next;
  errorMessage = '';
  notice = '';
  loading = true;
  render();
  try {
    const result = await accountRequest(`admin?section=${next}`);
    if (request !== requestNumber) return;
    if (result.user) {
      user = result.user;
      setAccountOwner(user.id);
      access = 'allowed';
    }
    data = result;
  } catch (error) {
    if (request !== requestNumber) return;
    errorMessage = error.message;
    if (error.status === 401 || error.status === 403) {
      user = null;
      data = null;
      setAccountOwner(null);
      access = error.status === 401 ? 'login' : 'denied';
    } else if (!user) access = 'error';
  } finally {
    if (request === requestNumber) {
      loading = false;
      render();
    }
  }
}

function openEditor(item) {
  const isLesson = section === 'lessons';
  const stage = item?.stage ?? 'pregnant';
  const fields = isLesson ? `
    <label>სათაური<input name="title" required maxlength="100" value="${escape(item?.title)}"></label>
    <label>YouTube ან Vimeo ბმული<input name="url" type="url" required maxlength="500" value="${escape(item?.url)}"></label>
    <label>აღწერა<textarea name="description" maxlength="500" rows="3">${escape(item?.description)}</textarea></label>
    <div class="form-columns">
      <label>ეტაპი<select name="stage">${options(Object.entries(stages).map(([id, label]) => ({ id, label })), stage)}</select></label>
      <label>კატეგორია<select name="category">${options(lessonCategories(stage), item?.category)}</select></label>
    </div>
    <label>ენა<select name="language">${options(['ქართული', 'ინგლისური', 'სხვა'].map(id => ({ id, label: id })), item?.language)}</select></label>
    <label>წყაროს სახელი<input name="source" required maxlength="120" value="${escape(item?.source)}"></label>
    <label>წყაროს ბმული (არასავალდებულო)<input name="sourceUrl" type="url" maxlength="500" value="${escape(item?.sourceUrl)}"></label>
    <label class="admin-checkbox"><input type="checkbox" name="published"${item?.published ? ' checked' : ''}> გამოქვეყნდეს საერთო კატალოგში</label>`
    : `<div class="idea-context"><p>${escape(item.description)}</p><p><strong>სარგებელი</strong> · ${escape(item.benefit)}</p></div>
    <label>სტატუსი<select name="status">${options(ideaStatuses, item.status)}</select></label>
    <label>გუნდის საჯარო პასუხი<textarea name="reply" maxlength="1000" rows="4">${escape(item.reply)}</textarea></label>
    <label class="admin-checkbox"><input type="checkbox" name="hidden"${item.hidden ? ' checked' : ''}> საჯარო დაფიდან დამალვა</label>`;
  editor.innerHTML = `<h2 id="editor-title">${isLesson ? (item ? 'ვიდეოს რედაქტირება' : 'ვიდეოს დამატება') : escape(item.title)}</h2>
    <form id="admin-edit" data-id="${escape(item?.id)}" data-revision="${item?.revision ?? 0}">
      ${fields}<p class="form-error" role="alert"></p>
      <div class="admin-actions"><button type="submit" class="primary">შენახვა</button>
      <button type="button" data-action="cancel">გაუქმება</button></div>
    </form>`;
  editor.showModal();
}

editor.addEventListener('change', event => {
  if (event.target.name === 'stage') {
    editor.querySelector('[name="category"]').innerHTML = options(lessonCategories(event.target.value));
  }
});
editor.addEventListener('cancel', event => {
  if (editor.querySelector('button[type="submit"]')?.disabled) event.preventDefault();
});
editor.addEventListener('click', event => {
  if (event.target.closest('[data-action="cancel"]')) editor.close();
});
editor.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  const fields = new FormData(form);
  const inputs = Object.fromEntries(fields);
  const isLesson = section === 'lessons';
  const id = form.dataset.id || null;
  const body = { ...inputs, id, revision: Number(form.dataset.revision) };
  if (isLesson) body.published = fields.has('published');
  else body.hidden = fields.has('hidden');
  const error = form.querySelector('.form-error');
  const buttons = [...form.querySelectorAll('button')];
  buttons.forEach(button => { button.disabled = true; });
  error.textContent = '';
  try {
    const result = await accountRequest(`admin?section=${section}`, 'POST', body);
    const updated = isLesson ? result.lesson : result.idea;
    const list = isLesson ? data.lessons : data.ideas;
    const index = list.findIndex(item => item.id === updated.id);
    if (index === -1) list.push(updated);
    else list[index] = updated;
    notice = 'ცვლილებები შენახულია.';
    editor.close();
    render();
  } catch (failure) {
    if (failure.status === 401 || failure.status === 403) {
      editor.close();
      await openSection('overview');
    } else error.textContent = failure.message;
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
});

app.addEventListener('input', event => {
  if (event.target.id !== 'admin-search') return;
  const search = event.target.value.trim().toLocaleLowerCase('ka-GE');
  const rows = [...app.querySelectorAll('.admin-row')];
  for (const row of rows) row.hidden = !row.dataset.title.includes(search);
  app.querySelector('#empty-list').hidden = rows.some(row => !row.hidden);
});
app.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.section) return openSection(button.dataset.section);
  if (button.dataset.action === 'retry') return openSection(user ? section : 'overview');
  if (button.dataset.action === 'add-lesson') return openEditor(null);
  if (button.dataset.action === 'edit') {
    const item = data[section].find(entry => entry.id === button.dataset.id);
    if (item) openEditor(item);
  }
  if (button.dataset.action === 'logout') {
    button.disabled = true;
    try {
      await authCall('signOut');
      try { localStorage.setItem('dediko.signed-out', String(Date.now())); } catch { /* Storage is optional. */ }
      user = null;
      data = null;
      access = 'login';
      errorMessage = '';
      ++requestNumber;
      render();
    } catch (error) {
      const message = document.createElement('p');
      message.setAttribute('role', 'alert');
      message.textContent = error.message;
      button.after(message);
    } finally { button.disabled = false; }
  }
});
app.addEventListener('submit', async event => {
  if (event.target.id !== 'admin-login') return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.target));
  const button = event.target.querySelector('button');
  button.disabled = true;
  try {
    await authCall('signIn.email', values);
    access = 'checking';
    await openSection('overview');
  } catch (error) {
    app.querySelector('.form-error').textContent = error.message;
  } finally { button.disabled = false; }
});

openSection('overview');
