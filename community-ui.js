import { accountRequest } from './account-client.js';
import { communityTypes, communityTopics, communityReasons, validateCommunity } from './community.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const options = items => items.map(item => `<option value="${item.id}">${item.label}</option>`).join('');
const rules = 'გაუზიარე პირადი გამოცდილება პატივისცემით. არ გამოაქვეყნო სხვისი პირადი მონაცემები, სამედიცინო დოკუმენტები ან წამლის დანიშნულება.';

export function createCommunityUI({ getUser, changed, openDialog, closeDialog, toast, login, date }) {
  let owner = null, generation = 0, status = 'idle', busy = false, error = '', posts = [], more = false, needsLogin = false;
  let type = 'all', topic = 'all', selected = null, detail = null, nickname = '';
  function reset() {
    owner = getUser()?.id || null; generation++; status = 'idle'; busy = false; error = ''; posts = []; more = false;
    selected = null; detail = null; nickname = ''; needsLogin = false;
  }
  function syncOwner() { if (owner !== (getUser()?.id || null)) reset(); }
  function authorFields() {
    return `<label class="field">საჯარო სახელი ან ფსევდონიმი<input name="author" required minlength="2" maxlength="40" autocomplete="nickname" value="${escape(nickname)}" placeholder="როგორ მოგმართონ საზოგადოებაში?"></label>`;
  }
  function consent() {
    return `<label class="community-consent"><input type="checkbox" name="consent" required><span>ვეთანხმები საზოგადოების წესებს. ჩემი სახელი და ტექსტი საზოგადოების წევრებისთვის გამოჩნდება.</span></label>`;
  }
  function actions(item, kind) {
    return `<div class="community-actions">${item.mine ? `<span>შენი ${kind === 'post' ? 'პოსტი' : 'კომენტარი'}</span><button type="button" class="text-button" data-community-action="delete" data-kind="${kind}" data-id="${item.id}">წაშლა</button>` : `<button type="button" class="text-button" data-community-action="report" data-kind="${kind}" data-id="${item.id}">გასაჩივრება</button>`}</div>`;
  }
  function card(post, expanded = false) {
    const category = communityTypes.find(x => x.id === post.type);
    return `<article class="community-card ${expanded ? 'community-expanded' : ''}">
      <div class="community-meta"><span class="community-type ${post.type}">${category?.symbol || '?'} ${category?.label || ''}</span><span>${communityTopics.find(x => x.id === post.topic)?.label || ''}</span></div>
      <h2>${expanded ? escape(post.title) : `<button data-community-action="open" data-id="${post.id}">${escape(post.title)}</button>`}</h2>
      <p class="community-body">${escape(expanded ? post.body : post.body.length > 260 ? post.body.slice(0, 260) + '…' : post.body)}</p>
      <div class="community-byline"><span class="community-avatar" aria-hidden="true">${escape(post.author.slice(0, 1))}</span><strong>${escape(post.author)}</strong><time datetime="${escape(post.createdAt)}">${date(post.createdAt)}</time></div>
      <div class="community-card-bottom">${expanded ? '' : `<button class="text-button" data-community-action="open" data-id="${post.id}">${post.comments} კომენტარი · საუბრის ნახვა →</button>`}${actions(post, 'post')}</div>
    </article>`;
  }
  function conversation() {
    if (!detail) return '';
    return `<div class="community-thread-tools"><button class="text-button" data-community-action="back">← ყველა პოსტი</button><button class="text-button" data-community-action="refresh" ${status === 'loading' ? 'disabled' : ''}>↻ განახლება</button></div>${card(detail.post, true)}
      <section class="community-conversation" aria-label="კომენტარები"><h2>გამოცდილებები და პასუხები <span>${detail.comments.length}</span></h2>
      ${detail.comments.length ? detail.comments.map(comment => `<article class="community-comment"><div class="community-byline"><span class="community-avatar" aria-hidden="true">${escape(comment.author.slice(0, 1))}</span><strong>${escape(comment.author)}</strong><time datetime="${escape(comment.createdAt)}">${date(comment.createdAt)}</time></div><p class="community-body">${escape(comment.body)}</p>${actions(comment, 'comment')}</article>`).join('') : '<div class="community-empty"><p>ჯერ არავინ გამოხმაურებია. შეგიძლია შენი გამოცდილება გაუზიარო ♡</p></div>'}
      ${detail.full ? '<p>ამ საუბარში კომენტარების ლიმიტი შევსებულია.</p>' : `<form id="community-comment-form" class="community-composer"><h3>შენი გამოხმაურება</h3><p>დაწერე, რა გამოგიცდია პირადად. საჭიროებისას ურჩიე ექიმთან დაკავშირება.</p>${authorFields()}<label class="field">კომენტარი<textarea name="body" required minlength="2" maxlength="1500" rows="4" placeholder="ჩემი გამოცდილებით…"></textarea></label>${consent()}<p class="form-error" role="alert"></p><button class="button" type="submit" ${busy ? 'disabled' : ''}>კომენტარის გამოქვეყნება</button></form>`}</section>`;
  }
  function view() {
    syncOwner();
    const heading = `<div class="dashboard-title"><div><span class="eyebrow">მოუსმინე. ჰკითხე. გაუზიარე.</span><h1>დედიკოს საზოგადოება <span>♡</span></h1><p>კითხვები, პატარა აღმოჩენები და გამოცდილებები — დედებისგან დედებისთვის.</p></div>${owner ? `<button class="button" data-community-action="new" ${busy || status === 'loading' ? 'disabled' : ''}>+ პოსტის დამატება</button>` : ''}</div>`;
    const notice = `<aside class="community-guidelines"><strong>ერთმანეთის გვერდით, პატივისცემით ♡</strong><p>${rules}</p><p>წევრების პასუხები პირადი გამოცდილებაა და ექიმის კონსულტაციას ვერ ჩაანაცვლებს. ექიმების ჩართულობა ამ ეტაპზე გარანტირებული არ არის.</p></aside>`;
    if (!owner) return `<section class="community-page">${heading}<div class="community-welcome"><span aria-hidden="true">♡</span><h2>ზოგჯერ ერთი „მეც ასე ვიყავი“ ბევრს ნიშნავს.</h2><p>დასვი კითხვა, გაუზიარე სხვებს შენი გამოცდილება ან უბრალოდ მოუსმინე. საზოგადოების სანახავად და საუბარში ჩასართავად შედი ანგარიშში.</p><button class="button" data-community-action="login">შესვლა / ანგარიშის შექმნა</button></div>${notice}</section>`;
    const filters = `<div class="community-toolbar"><div class="community-tabs" role="group" aria-label="პოსტის ტიპი">${[{ id: 'all', label: 'ყველა პოსტი' }, ...communityTypes].map(item => `<button data-community-action="filter" data-type="${item.id}" aria-pressed="${type === item.id}" class="${type === item.id ? 'selected' : ''}">${item.label}</button>`).join('')}</div><label>თემა<select name="communityTopic" ${status === 'loading' ? 'disabled' : ''}><option value="all" ${topic === 'all' ? 'selected' : ''}>ყველა თემა</option>${communityTopics.map(x => `<option value="${x.id}" ${topic === x.id ? 'selected' : ''}>${x.label}</option>`).join('')}</select></label><button class="text-button" data-community-action="refresh" ${status === 'loading' ? 'disabled' : ''}>↻ განახლება</button></div>`;
    const contents = selected && detail ? conversation() : !selected ? `${filters}<div class="community-feed">${posts.length ? posts.map(post => card(post)).join('') : status === 'ready' ? '<div class="community-empty"><h2>აქ თქვენი ამბები დაიწყება ♡</h2><p>ამ თემაზე პოსტი ჯერ არ არის. დასვი პირველი კითხვა ან გაგვიზიარე გამოცდილება.</p><button class="text-button" data-community-action="new">+ პირველი პოსტი</button></div>' : ''}</div>${more ? '<button class="button button-secondary" data-community-action="more">მეტი პოსტი</button>' : ''}` : '';
    return `<section class="community-page">${heading}${notice}${error ? `<p class="community-error" role="alert">${escape(error)} <button class="text-button" data-community-action="refresh">${needsLogin ? 'შესვლა' : 'ხელახლა ცდა'}</button>${selected && !detail ? '<button class="text-button" data-community-action="back">← ყველა პოსტი</button>' : ''}</p>` : ''}${status === 'loading' ? '<p role="status">საუბრები იტვირთება…</p>' : ''}${contents}</section>`;
  }
  async function load(append = false) {
    syncOwner();
    if (!owner || busy || status === 'loading') return;
    const run = generation, postId = selected;
    status = 'loading'; error = ''; changed();
    try {
      const path = postId ? `community?id=${postId}` : `community?type=${type}&topic=${topic}&offset=${append ? posts.length : 0}`;
      const result = await accountRequest(path);
      if (run !== generation || owner !== (getUser()?.id || null)) return;
      if (postId) detail = result;
      else { posts = append ? [...posts, ...result.posts] : result.posts; more = result.more; }
      status = 'ready';
    } catch (failure) {
      if (run === generation) {
        status = 'error'; error = failure.message;
        if (failure.status === 404) { detail = null; posts = posts.filter(post => post.id !== postId); }
        if (failure.status === 401) { posts = []; detail = null; more = false; needsLogin = true; }
      }
    }
    finally { if (run === generation) changed(); }
  }
  function newPost() {
    if (!owner) return login();
    openDialog(`<span class="eyebrow">შენი ამბავი მნიშვნელოვანია</span><h2 id="dialog-title">გაუზიარე დედიკოებს ♡</h2><p class="dialog-intro">${rules}</p><form id="community-post-form">${authorFields()}<div class="field-row"><label class="field">პოსტის ტიპი<select name="type">${options(communityTypes)}</select></label><label class="field">თემა<select name="topic">${options(communityTopics)}</select></label></div><label class="field">სათაური<input name="title" required minlength="5" maxlength="120" placeholder="რის შესახებ გინდა საუბარი?"></label><label class="field">შენი კითხვა ან გამოცდილება<textarea name="body" required minlength="10" maxlength="4000" rows="6" placeholder="მოგვიყევი შენი ამბავი…"></textarea></label>${consent()}<p class="form-error" role="alert"></p><button class="button full-width" type="submit">პოსტის გამოქვეყნება</button></form>`);
  }
  async function submit(form) {
    if (busy) return;
    const values = Object.fromEntries(new FormData(form)); values.consent = values.consent === 'on';
    const comment = form.id === 'community-comment-form', report = form.id === 'community-report-form';
    const validation = report ? null : validateCommunity(values, comment);
    const errorNode = form.querySelector('.form-error');
    if (validation?.error) { errorNode.textContent = validation.error; return; }
    const run = generation, postId = selected;
    busy = true; errorNode.textContent = ''; form.querySelector('button[type="submit"]').disabled = true;
    try {
      const result = await accountRequest('community', 'POST', report
        ? { action: 'report', id: form.dataset.id, kind: form.dataset.kind, reason: values.reason }
        : { ...validation.value, consent: true, action: comment ? 'comment' : 'post', ...(comment ? { postId } : {}) });
      if (run !== generation || owner !== (getUser()?.id || null)) return;
      if (!report) nickname = validation.value.author;
      if (!comment) closeDialog();
      if (report) toast('გასაჩივრება გუნდს გადაეგზავნა.');
      else { selected = comment ? postId : result.id; detail = null; toast(comment ? 'კომენტარი გამოქვეყნდა ♡' : 'პოსტი გამოქვეყნდა ♡'); }
      busy = false;
      if (!report) await load();
    } catch (failure) { if (run === generation && form.isConnected) errorNode.textContent = failure.message; }
    finally { if (run === generation) { busy = false; if (form.isConnected) form.querySelector('button[type="submit"]').disabled = false; } }
  }
  document.addEventListener('submit', event => {
    if (!['community-post-form', 'community-comment-form', 'community-report-form'].includes(event.target.id)) return;
    event.preventDefault(); submit(event.target);
  });
  document.addEventListener('change', event => {
    if (event.target.name !== 'communityTopic' || busy || status === 'loading') return;
    topic = event.target.value; posts = []; load();
  });
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-community-action]');
    if (!button) return;
    event.preventDefault(); syncOwner();
    const action = button.dataset.communityAction;
    if (action === 'login' || needsLogin) { reset(); return login(); }
    if (busy || status === 'loading') return;
    if (action === 'new') return newPost();
    if (action === 'filter') { type = button.dataset.type; posts = []; return load(); }
    if (action === 'open') { selected = button.dataset.id; detail = null; return load(); }
    if (action === 'back') { selected = null; detail = null; return load(); }
    if (action === 'refresh' || action === 'more') return load(action === 'more');
    if (action === 'report') return openDialog(`<h2 id="dialog-title">ჩანაწერის გასაჩივრება</h2><p class="dialog-intro">აირჩიე მიზეზი. გუნდი ჩანაწერს განიხილავს.</p><form id="community-report-form" data-id="${button.dataset.id}" data-kind="${button.dataset.kind}"><label class="field">მიზეზი<select name="reason">${options(communityReasons)}</select></label><p class="form-error" role="alert"></p><button type="submit" class="button full-width">გასაჩივრების გაგზავნა</button></form>`);
    if (action === 'delete') return openDialog(`<h2 id="dialog-title">წაშლი შენს ჩანაწერს?</h2><p class="dialog-intro">წაშლილი ტექსტის აღდგენა ვერ მოხერხდება.${button.dataset.kind === 'post' ? ' პოსტთან ერთად მისი საუბარიც აღარ გამოჩნდება.' : ''}</p><button class="button full-width" data-community-action="confirm-delete" data-id="${button.dataset.id}" data-kind="${button.dataset.kind}">დიახ, წავშალო</button>`);
    if (action === 'confirm-delete') {
      const run = generation; busy = true; button.disabled = true;
      try {
        await accountRequest('community', 'POST', { action: 'delete', id: button.dataset.id, kind: button.dataset.kind });
        if (run !== generation || owner !== (getUser()?.id || null)) return;
        closeDialog(); if (button.dataset.kind === 'post') { selected = null; detail = null; }
        busy = false; toast('ჩანაწერი წაიშალა.'); await load();
      } catch (failure) { if (run === generation) toast(failure.message); }
      finally { if (run === generation) { busy = false; button.disabled = false; } }
    }
  });
  return { view, load, reset, ensureLoaded() { syncOwner(); if (owner && status === 'idle') load(); } };
}
