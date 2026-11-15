import {accountRequest} from './account-client.js';
import {offerCategories,offerStages,offerModes,demoOffers,offerStatuses,partnerStatuses,money} from './offers.js';
import {offerEscape as esc,offerOptions,offerFields,readOfferForm} from './offer-forms.js';

export function offerPhoto(offer,extra='') {
  const category=offerCategories.find(x=>x.id===offer.category)||offerCategories[0];
  return offer.image?`<div class="offer-photo ${extra}"><img src="${esc(offer.image)}" alt="${esc(offer.title)}" loading="lazy" referrerpolicy="no-referrer"></div>`
    :`<div class="offer-photo offer-photo-${category.photo} ${extra}" role="img" aria-label="${esc(category.label)} — საილუსტრაციო ფოტო"></div>`;
}
export function createOffersUI({getUser,getStage,changed,openDialog,closeDialog,toast,login,date,enableNotifications}) {
  let owner=null,generation=0,status='idle',error='',busy=false,items=[],saved=new Set(),pro=false,prefs={enabled:false,categories:[],stage:'all',city:''};
  let demo=false,category='all',stage='all',city='all',mode='all',onlySaved=false,onlyPro=false,search='';
  let portal=null,portalStatus='idle',portalError='',observer,seen=new Set(),expiryTimer;
  function reset() {owner=getUser()?.id||null;generation++;status='idle';error='';busy=false;items=[];saved=new Set();onlySaved=false;pro=false;portal=null;portalStatus='idle';portalError='';seen=new Set();prefs={enabled:false,categories:[],stage:'all',city:''};observer?.disconnect();clearTimeout(expiryTimer);}
  function sync(){if (owner!==(getUser()?.id||null)) reset();}
  const all=()=>demo?demoOffers:items;
  const current=id=>[...items,...demoOffers].find(x=>x.id===id);
  function filtered() {
    const source=onlySaved?[...items,...demoOffers.filter(d=>saved.has(d.id))]:all();
    return source.filter(x=>(x.demo||new Date(x.end)>new Date())&&(category==='all'||x.category===category)&&(stage==='all'||x.stage==='all'||x.stage===stage)&&
      (city==='all'||x.city===city||x.mode!=='store'&&mode!=='store')&&(mode==='all'||x.mode==='both'||x.mode===mode)&&
      (!onlySaved||saved.has(x.id))&&(!onlyPro||x.pro)&&`${x.title} ${x.partner} ${x.description}`.toLocaleLowerCase('ka-GE').includes(search.trim().toLocaleLowerCase('ka-GE')));
  }
  function card(offer) {
    const c=offerCategories.find(x=>x.id===offer.category);
    return `<article class="offer-card" data-offer-card="${offer.id}" ${offer.demo?'data-demo="true"':''}>
      <div class="offer-image-wrap"><button class="offer-image-button" data-offer-action="detail" data-id="${offer.id}" aria-label="${esc(offer.title)} — პირობები">${offerPhoto(offer)}</button>
      <div class="offer-badges">${offer.demo?'<span class="offer-demo-badge">დემო</span>':offer.sponsored?'<span>რეკლამა</span>':''}${offer.featured?'<span>✧ გამორჩეული</span>':''}${offer.pro?'<span class="offer-pro-badge">PRO ✧</span>':''}</div>
      <button class="offer-save ${saved.has(offer.id)?'saved':''}" data-offer-action="save" data-id="${offer.id}" aria-label="${saved.has(offer.id)?'შენახვის გაუქმება':'შეთავაზების შენახვა'}" aria-pressed="${saved.has(offer.id)}">${saved.has(offer.id)?'♥':'♡'}</button></div>
      <div class="offer-card-content"><p class="offer-partner">${esc(offer.partner)} <span>· ${esc(c?.label)}</span></p><h2><button data-offer-action="detail" data-id="${offer.id}">${esc(offer.title)}</button></h2>
      <strong class="offer-benefit">${esc(offer.benefit)}</strong>${offer.price!==null?`<p class="offer-price"><del>${money(offer.originalPrice)}</del> ${money(offer.price)}</p>`:''}
      <div class="offer-meta"><span>${esc(offer.city)} · ${offer.mode==='online'?'ონლაინ':offer.mode==='store'?'ფილიალში':'ონლაინ / ფილიალში'}</span><span>${offer.demo?'საილუსტრაციო მაგალითი':`მოქმედებს ${date(offer.end)}-მდე`}</span></div>
      <button class="offer-detail-link" data-offer-action="detail" data-id="${offer.id}">პირობების ნახვა <span>↗</span></button></div></article>`;
  }
  function results() {
    const visible=filtered();
    return `<p class="offer-result-count" role="status">${visible.length} ${demo&&!onlySaved?'დემო ':''}შეთავაზება${onlySaved?' · შენახული':''}</p><div class="offers-grid">${visible.map(card).join('')||'<div class="offers-empty"><span>♡</span><h2>აქ შენი შემდეგი აღმოჩენა გამოჩნდება</h2><p>ამ არჩევანში შეთავაზება ჯერ არ არის. სცადე სხვა კატეგორია ან შეინახე სასურველი ბარათი.</p></div>'}</div>`;
  }
  function view() {
    sync();const cities=[...new Set([...items,...demoOffers].map(x=>x.city))];
    return `<section class="offers-page"><div class="offers-topline"><span class="eyebrow">პატარა აღმოჩენები, ყოველდღე</span><button class="text-button" data-action="partner">ბიზნესისთვის ↗</button></div>
      <section class="offers-hero"><div><span class="offers-hero-tag">♡ დედიკოს შეთავაზებები</span><h1>შენთვის. პატარასთვის.<br><span>ცოტა მეტი სიხარული.</span></h1><p>მოვლა, კომფორტი და სასარგებლო აღმოჩენები —<br>შენს ყოველდღიურობაზე მორგებული არჩევანი.</p><div class="offers-hero-actions"><button class="button" data-offer-action="browse">აღმოაჩინე შეთავაზებები ↓</button><button class="text-button" data-offer-action="preferences">შეტყობინებების არჩევა</button></div></div><div class="offers-hero-photo">${offerPhoto(demoOffers[1])}<span class="offers-photo-note">პატარა ზრუნვა<br><strong>დიდი სიყვარულით ♡</strong></span></div></section>
      ${demo?'<div class="offers-demo-notice"><strong>დემო კოლექცია · ჯერ პარტნიორები არ გვყავს</strong><p>ფოტოები და შეთავაზებები საილუსტრაციოა. ნაჩვენები ფასდაკლებები და Pro მაგალითები მოქმედ აქციებს არ წარმოადგენს.</p></div>':''}
      <div class="offers-category-strip" role="group" aria-label="შეთავაზებების კატეგორიები"><button data-offer-action="category" data-category="all" class="${category==='all'?'selected':''}" aria-pressed="${category==='all'}"><span>✧</span>ყველა</button>${offerCategories.map(x=>`<button data-offer-action="category" data-category="${x.id}" class="${category===x.id?'selected':''}" aria-pressed="${category===x.id}"><span>${x.icon}</span>${x.label}</button>`).join('')}</div>
      <div class="offers-toolbar" id="offers-catalog"><label class="offers-search"><span>⌕</span><input name="offerSearch" type="search" maxlength="100" value="${esc(search)}" placeholder="რას ეძებ შენთვის ან პატარასთვის?" aria-label="შეთავაზებების ძიება"></label>
      <div class="offers-filters"><label><span class="visually-hidden">აუდიტორია</span><select name="offerStage">${offerOptions(offerStages,stage)}</select></label><label><span class="visually-hidden">ქალაქი</span><select name="offerCity">${offerOptions([{id:'all',label:'ყველა ქალაქი'},...cities.map(id=>({id,label:id}))],city)}</select></label><label><span class="visually-hidden">შეძენის გზა</span><select name="offerMode">${offerOptions([{id:'all',label:'შეძენის გზა'},...offerModes.filter(x=>x.id!=='both')],mode)}</select></label></div></div>
      <div class="offers-quick-filters"><button data-offer-action="for-me">♡ ჩემთვის</button><button data-offer-action="saved" aria-pressed="${onlySaved}" class="${onlySaved?'selected':''}">შენახული (${saved.size})</button><button data-offer-action="pro" aria-pressed="${onlyPro}" class="${onlyPro?'selected':''}">Pro ექსკლუზივი ✧</button><button data-offer-action="demo">${demo?'რეალური შეთავაზებები':'დემოს ნახვა'}</button><button data-offer-action="refresh">↻ განახლება</button></div>
      ${error?`<p class="offers-error" role="alert">${esc(error)}</p>`:''}${status==='loading'?'<p role="status">შეთავაზებები იტვირთება…</p>':''}<div id="offer-results">${results()}</div>
      <aside class="offers-partner-invite"><div><span class="eyebrow">შენი ბიზნესი დედიკოებთან</span><h2>კარგ შეთავაზებებს აქ ელოდებიან.</h2><p>გახდი პარტნიორი, დაამატე შეთავაზებები და ნახე შედეგები შენს კაბინეტში.</p></div><button class="button button-secondary" data-action="partner">პარტნიორის კაბინეტი ↗</button></aside>
      <p class="offers-footnote">შეთავაზების გამოყენებამდე გადაამოწმე პირობები და ხელმისაწვდომობა პარტნიორთან. რეკლამა აღინიშნება ცალკე; პარტნიორები შენს პირად პროფილს ვერ ხედავენ.</p></section>`;
  }
  async function load() {
    sync();if(status==='loading')return;const run=generation;status='loading';error='';changed();
    try {const result=await accountRequest(`offers${owner?'?member=1':''}`);if(run!==generation||owner!==(getUser()?.id||null))return;items=result.offers;saved=new Set(result.saved);pro=result.pro;prefs=result.preferences;demo=items.length===0;status='ready';}
    catch(failure){if(run===generation){error=failure.message;status='error';if(failure.status===401){items=[];saved=new Set();pro=false;}}}
    finally{if(run===generation)changed();}
  }
  function afterRender() {
    observer?.disconnect();clearTimeout(expiryTimer);
    const nextExpiry=Math.min(...items.map(x=>new Date(x.end).getTime()).filter(time=>time>Date.now()));
    if(Number.isFinite(nextExpiry))expiryTimer=setTimeout(()=>updateResults(),Math.min(86400000,Math.max(100,nextExpiry-Date.now()+100)));
    if (!('IntersectionObserver' in window)||status!=='ready')return;
    observer=new IntersectionObserver(entries=>entries.forEach(entry=>{const id=entry.target.dataset.offerCard;if(entry.isIntersecting&&!seen.has(id)){seen.add(id);observer.unobserve(entry.target);accountRequest('offers','POST',{action:'event',kind:'view',id}).catch(()=>{seen.delete(id);});}}),{threshold:.6});
    document.querySelectorAll('[data-offer-card]:not([data-demo])').forEach(node=>observer.observe(node));
  }
  function updateResults(){const root=document.querySelector('#offer-results');if(root){root.innerHTML=results();afterRender();}}
  function detail(id) {
    const offer=current(id);if(!offer)return;
    openDialog(`<div class="offer-detail">${offerPhoto(offer)}<span class="eyebrow">${offer.demo?'დემო · საილუსტრაციო შეთავაზება':offer.sponsored?'რეკლამა · პარტნიორის შეთავაზება':'პარტნიორის შეთავაზება'}</span><h2 id="dialog-title">${esc(offer.title)}</h2><p class="offer-partner">${esc(offer.partner)}</p><strong class="offer-benefit">${esc(offer.benefit)}</strong><p>${esc(offer.description)}</p><dl><dt>ვისთვის</dt><dd>${offerStages.find(x=>x.id===offer.stage)?.label}</dd><dt>სად</dt><dd>${esc(offer.city)} · ${offerModes.find(x=>x.id===offer.mode)?.label}</dd>${offer.branches?`<dt>ფილიალები</dt><dd>${esc(offer.branches)}</dd>`:''}<dt>მოქმედების ვადა</dt><dd>${offer.demo?'დემო — არ აქვს მოქმედი ვადა':`${date(offer.start)} — ${date(offer.end)}`}</dd></dl><h3>გამოყენების პირობები</h3><p class="offer-terms">${esc(offer.terms)}</p>
      ${offer.demo?'<p class="offers-demo-notice">დემოა — კოდი და შეძენის ბმული არ მოქმედებს.</p>':offer.locked?`<div class="offer-pro-lock"><strong>Pro ექსკლუზივი ✧</strong><p>კოდი და შეძენის ბმული გაიხსნება დადასტურებული Pro წვდომით. საცდელი დამგეგმავი ამ წვდომას არ ანიჭებს.</p><button class="button" data-offer-action="pro-access">${owner?'ჩემი Pro წვდომა':'შესვლა'}</button></div>`:`${offer.code?`<button class="offer-code" data-offer-action="copy" data-id="${offer.id}"><span>${esc(offer.code)}</span> კოპირება</button>`:''}<button class="button full-width" data-offer-action="visit" data-id="${offer.id}">მაღაზიის საიტზე გადასვლა ↗</button>`}
      <button class="text-button" data-offer-action="save" data-id="${offer.id}">${saved.has(id)?'♥ შენახულია · გაუქმება':'♡ შეთავაზების შენახვა'}</button></div>`);
  }
  function preferences() {
    if(!owner)return login();
    openDialog(`<span class="eyebrow">მხოლოდ შენი სურვილით</span><h2 id="dialog-title">რა გაინტერესებს?</h2><p class="dialog-intro">არჩეულ კატეგორიებში ახალი შეთავაზებების დღიური შეჯამება. შეხსენებებისგან დამოუკიდებლად შეგიძლია ჩართო ან გამორთო.</p><form id="offer-preferences-form"><label class="offer-check"><input name="enabled" type="checkbox" ${prefs.enabled?'checked':''}> ახალი შეთავაზებების შეტყობინებები</label><fieldset class="offer-interest-fields"><legend>საინტერესო კატეგორიები</legend>${offerCategories.map(c=>`<label class="offer-check"><input type="checkbox" name="categories" value="${c.id}" ${prefs.categories.includes(c.id)?'checked':''}>${c.label}</label>`).join('')}</fieldset><label class="field">ეტაპი<select name="stage">${offerOptions(offerStages,prefs.stage)}</select></label><label class="field">ქალაქი (ცარიელი — ყველა)<input name="city" maxlength="60" value="${esc(prefs.city)}"></label><p class="form-note">მოვლენები მოდის მხოლოდ დაკავშირებულ მოწყობილობაზე. ფოტოები და პროფილის მონაცემები პარტნიორებს არ გადაეცემა. დემო შეთავაზებები შეტყობინებებში არ იგზავნება.</p><button type="button" class="text-button" data-offer-action="enable-push">ამ მოწყობილობაზე შეტყობინებების ჩართვა</button><p class="form-error" role="alert"></p><button type="submit" class="button full-width">არჩევანის შენახვა</button></form>`);
  }
  function partnerView() {
    sync();const p=portal?.partner;
    const intro=`<div class="dashboard-title"><div><span class="eyebrow">DEDIKO · პარტნიორებისთვის</span><h1>კარგ შეთავაზებებს<br>სწორი აუდიტორია სჭირდება.</h1><p>შენი შეთავაზებები, შედეგები და ანგარიშსწორება — ერთ კაბინეტში.</p></div><button class="text-button" data-action="offers">შეთავაზებების ნახვა ↗</button></div>`;
    if(!owner)return `<section class="offers-page">${intro}<div class="partner-welcome"><h2>გახდი დედიკოს პარტნიორი ♡</h2><p>განათავსე შეთავაზება დედებისა და ორსულებისთვის. განაცხადის დამტკიცების შემდეგ შენს შეთავაზებებს კაბინეტიდან მართავ.</p><button class="button" data-offer-action="login">შესვლა</button> <button class="text-button" data-action="partner-register">პარტნიორის ანგარიშის შექმნა ↗</button></div>${plans()}</section>`;
    if(portalStatus==='loading')return `${intro}<p role="status">კაბინეტი იტვირთება…</p>`;
    if(portalError)return `${intro}<p class="offers-error" role="alert">${esc(portalError)}</p><button class="button" data-offer-action="portal-refresh">ხელახლა ცდა</button>`;
    if(!p)return `${intro}${plans()}<section class="partner-application"><h2>პარტნიორობის განაცხადი</h2>${!getUser()?.emailVerified ? '<p class="offers-demo-notice">განაცხადამდე დაადასტურე ანგარიშის ელფოსტა. <button class="text-button" data-action="verify-email">ელფოსტის დადასტურება →</button></p>' : ''}<form id="partner-application-form"><label class="field">კომპანიის / მაღაზიის სახელი<input name="name" required minlength="2" maxlength="100"></label><label class="field">საიტის ბმული<input name="website" type="url" required placeholder="https://" maxlength="1000"></label><label class="field">საქმიანი საკონტაქტო ინფორმაცია<input name="contact" required minlength="5" maxlength="160" placeholder="ელფოსტა ან ტელეფონი"></label><label class="field">რას სთავაზობთ დედიკოებს?<textarea name="description" rows="4" maxlength="800"></textarea></label><label class="offer-check"><input type="checkbox" required>ვადასტურებ, რომ ამ ბიზნესის სახელით განაცხადის გაგზავნა შემიძლია.</label><p class="form-note">განაცხადისთვის საჭიროა პროფილიდან ელფოსტის დადასტურება. საკონტაქტო ინფორმაცია მხოლოდ გუნდისთვისაა.</p><p class="form-error" role="alert"></p><button type="submit" class="button">განაცხადის გაგზავნა</button></form></section>`;
    const offers=portal.offers,counts={views:0,clicks:0,copies:0};for(const o of offers)for(const key of Object.keys(counts))counts[key]+=o[key];
    const pending=portal.charges.filter(x=>x.status==='pending').reduce((n,x)=>n+x.amount,0)+portal.sales.filter(x=>x.status==='confirmed').reduce((n,x)=>n+x.commission,0);
    return `<section class="offers-page">${intro}<div class="partner-status"><div><strong>${esc(p.name)}</strong><p>${partnerStatuses[p.status]}${p.note?` · ${esc(p.note)}`:''}</p></div><button class="text-button" data-offer-action="portal-refresh">↻ განახლება</button></div>
      ${p.status!=='approved'?'<div class="offers-demo-notice">განაცხადს გუნდი განიხილავს. შეთავაზებების გამოქვეყნება დამტკიცების შემდეგ შეგეძლება.</div>':`<div class="partner-stats">${[['ნახვა',counts.views],['გადასვლა',counts.clicks],['კოდის კოპირება',counts.copies],['გადასახდელი',money(pending)]].map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong></div>`).join('')}</div><div class="offers-section-heading"><h2>ჩემი შეთავაზებები</h2><button class="button" data-offer-action="new-offer">+ ახალი შეთავაზება</button></div>
      <div class="partner-offer-list">${offers.map(o=>`<article><div><h3>${esc(o.content.title)}</h3><p>${offerStatuses[o.status]} · ${date(o.ends_at)}-მდე</p>${o.review_note?`<p>${esc(o.review_note)}</p>`:''}<small>${o.views} ნახვა · ${o.clicks} გადასვლა · ${o.copies} კოპირება</small></div><div><button class="text-button" data-offer-action="edit-offer" data-id="${o.id}">რედაქტირება</button>${o.status==='approved'?`<button class="text-button" data-offer-action="pause-offer" data-id="${o.id}">შეჩერება</button>`:''}</div></article>`).join('')||'<div class="offers-empty"><h3>დაამატე შენი პირველი შეთავაზება</h3><p>გუნდის დამტკიცებამდე ჩანაწერი საჯაროდ არ გამოჩნდება.</p></div>'}</div>
      <p class="offers-footnote">ნახვები, გადასვლები და კოპირებები ითვლება თითო ბრაუზერზე დღეში ერთხელ; ეს არ არის დადასტურებული ადამიანების ან გაყიდვების რაოდენობა. მომხმარებლების ვინაობა და პირადი მონაცემები არ ჩანს.</p>
      <div class="offers-section-heading"><h2>შეკვეთები და საკომისიო</h2><button class="text-button" data-offer-action="new-sale">+ შეკვეთის აღრიცხვა</button></div>${salesTable(portal.sales)}
      <h2 class="partner-ledger-heading">განთავსების ანგარიშსწორება</h2>${chargesTable(portal.charges)}<p class="offers-footnote">განთავსების საფასური და საკომისიო ინდივიდუალურად თანხმდება გუნდთან. გადახდა სრულდება შეთანხმებული გარე გზით; აქ სტატუსს ადმინი დადასტურების შემდეგ აახლებს.</p>`}</section>`;
  }
  function plans(){return `<div class="partner-plans">${[['განთავსება','შეთავაზების გამოქვეყნება შეთანხმებული პერიოდით'],['გამორჩეული პოზიცია','უფრო თვალსაჩინო ადგილი კატალოგში'],['შედეგზე შეთანხმება','საკომისიო მხოლოდ დადასტურებულ შეკვეთაზე']].map(([title,body])=>`<article><span>✧</span><h2>${title}</h2><p>${body}</p><small>პირობები ინდივიდუალურად თანხმდება</small></article>`).join('')}</div>`;}
  const saleLabels={pending:'ელოდება დადასტურებას',confirmed:'დადასტურებულია',rejected:'უარყოფილია',paid:'გადახდილია'};
  function salesTable(rows){return `<div class="offer-table-wrap"><table class="offer-table"><thead><tr><th>შეთავაზება</th><th>შეკვეთის თანხა</th><th>საკომისიო</th><th>სტატუსი</th></tr></thead><tbody>${rows.map(s=>`<tr><td>${esc(s.title)}</td><td>${money(s.amount)}</td><td>${money(s.commission)}</td><td>${saleLabels[s.status]}${s.note?`<small>${esc(s.note)}</small>`:''}</td></tr>`).join('')||'<tr><td colspan="4">აღრიცხული შეკვეთა ჯერ არ არის.</td></tr>'}</tbody></table></div>`;}
  function chargesTable(rows){return `<div class="offer-table-wrap"><table class="offer-table"><thead><tr><th>დანიშნულება</th><th>თანხა</th><th>სტატუსი</th></tr></thead><tbody>${rows.map(c=>`<tr><td>${esc(c.description)}</td><td>${money(c.amount)}</td><td>${({pending:'გადასახდელია',paid:'გადახდილია',void:'გაუქმებულია'})[c.status]}${c.receipt?`<small>${esc(c.receipt)}</small>`:''}</td></tr>`).join('')||'<tr><td colspan="3">დარიცხვა ჯერ არ არის.</td></tr>'}</tbody></table></div>`;}
  async function loadPortal(){sync();if(portalStatus==='loading'||!owner)return;const run=generation;portalStatus='loading';portalError='';changed();try{const result=await accountRequest('partner');if(run!==generation||owner!==(getUser()?.id||null))return;portal=result;portalStatus='ready';}catch(failure){if(run===generation){portalError=failure.message;portalStatus='error';}}finally{if(run===generation)changed();}}
  function editOffer(id){const item=portal?.offers.find(x=>x.id===id);openDialog(`<h2 id="dialog-title">${item?'შეთავაზების რედაქტირება':'ახალი შეთავაზება'}</h2><p class="dialog-intro">გამოქვეყნებამდე გუნდი პირობებს გადაამოწმებს. ცვლილებაც ხელახალ დამტკიცებას საჭიროებს.</p><form id="partner-offer-form" data-id="${esc(id||'')}" data-revision="${item?.revision||0}">${offerFields(item)}<label class="offer-check"><input type="checkbox" name="submit" checked>დასამტკიცებლად გაგზავნა</label><p class="form-error" role="alert"></p><button class="button full-width" type="submit">შენახვა</button></form>`);}
  document.addEventListener('input',event=>{if(event.target.name==='offerSearch'){search=event.target.value;updateResults();}});
  document.addEventListener('change',event=>{if(['offerStage','offerCity','offerMode'].includes(event.target.name)){if(event.target.name==='offerStage')stage=event.target.value;if(event.target.name==='offerCity')city=event.target.value;if(event.target.name==='offerMode')mode=event.target.value;updateResults();}});
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-offer-action]');if(!button)return;event.preventDefault();sync();const action=button.dataset.offerAction,id=button.dataset.id;
    if(action==='login')return login();if(action==='browse')return document.querySelector('#offers-catalog')?.scrollIntoView({behavior:'smooth'});
    if(action==='detail')return detail(id);if(action==='preferences')return preferences();if(action==='enable-push'){try{await enableNotifications(button);toast('მოწყობილობა მზადაა. ახლა შეინახე კატეგორიების არჩევანი.');}catch(failure){toast(failure.message);}return;}
    if(action==='pro-access'){if(!owner)return login();return openDialog('<h2 id="dialog-title">Pro შეთავაზებებზე წვდომა ✧</h2><p class="dialog-intro">პარტნიორების ექსკლუზიური კოდები ხელმისაწვდომია გუნდის მიერ დადასტურებული Pro წვდომით. ამ ეტაპზე ავტომატური გამოწერის შეძენა არ არის ჩართული. დემო მაგალითები მოქმედ ფასდაკლებებს არ წარმოადგენს.</p>');}
    if(action==='category'){category=button.dataset.category;changed();return;}if(action==='for-me'){stage=getStage()||'all';changed();return;}
    if(action==='saved'){if(!owner)return login();onlySaved=!onlySaved;changed();return;}if(action==='pro'){onlyPro=!onlyPro;changed();return;}if(action==='demo'){demo=!demo;onlySaved=false;changed();return;}
    if(action==='refresh')return load();if(action==='portal-refresh')return loadPortal();if(busy)return;
    if(action==='new-offer'||action==='edit-offer')return editOffer(id);
    if(action==='new-sale')return openDialog('<h2 id="dialog-title">შეკვეთის აღრიცხვა</h2><p class="dialog-intro">მიუთითე DEDIKO-დან გადმოყოლილი dediko_ref რეფერენსი და რეალურად დასრულებული შეკვეთა. კლიენტის სახელი, ტელეფონი ან სხვა პირადი მონაცემი არ ჩაწერო. დადასტურებამდე საკომისიო შემოსავლად არ ჩაითვლება.</p><form id="partner-sale-form"><label class="field">DEDIKO რეფერენსი<input name="reference" required maxlength="36"></label><label class="field">შეკვეთის შიდა ნომერი<input name="order" required minlength="2" maxlength="100"></label><label class="field">შეკვეთის თანხა, ₾<input name="amount" type="number" min="0.01" max="100000" step="0.01" required></label><p class="form-error" role="alert"></p><button type="submit" class="button full-width">დასადასტურებლად გაგზავნა</button></form>');
    const run=generation;busy=true;button.disabled=true;
    try {
      if(action==='save'){if(!owner){login();return;}const value=!saved.has(id);await accountRequest('offers','POST',{action:'save',id,saved:value});if(run!==generation||owner!==(getUser()?.id||null))return;value?saved.add(id):saved.delete(id);toast(value?'შეთავაზება შენახულია ♡':'შენახვა გაუქმდა');changed();if(button.closest('.offer-detail'))detail(id);}
      if(action==='copy'){const result=await accountRequest('offers','POST',{action:'event',kind:'copy',id});if(run!==generation)return;try{await navigator.clipboard.writeText(result.code);toast('პრომოკოდი დაკოპირებულია');}catch{toast('კოპირება ვერ მოხერხდა — მონიშნე კოდი ხელით.');}}
      if(action==='visit'){const popup=window.open('about:blank','_blank');if(popup)popup.opener=null;try{const result=await accountRequest('offers','POST',{action:'event',kind:'click',id});if(run!==generation){popup?.close();return;}if(popup)popup.location.replace(result.url);else location.assign(result.url);}catch(failure){popup?.close();throw failure;}}
      if(action==='pause-offer'){await accountRequest('partner','POST',{action:'pause',id});if(run===generation){busy=false;await loadPortal();}}
    }catch(failure){if(run===generation)toast(failure.message);}finally{if(run===generation){busy=false;button.disabled=false;}}
  });
  document.addEventListener('submit',async event=>{
    const form=event.target;if(!['offer-preferences-form','partner-application-form','partner-offer-form','partner-sale-form'].includes(form.id))return;event.preventDefault();sync();if(busy)return;
    const run=generation,errorNode=form.querySelector('.form-error');busy=true;form.querySelector('[type="submit"]').disabled=true;errorNode.textContent='';
    try{
      let endpoint='partner',body=Object.fromEntries(new FormData(form));
      if(form.id==='offer-preferences-form'){endpoint='offers';body={...body,action:'preferences',enabled:new FormData(form).has('enabled'),categories:new FormData(form).getAll('categories')};}
      if(form.id==='partner-application-form')body.action='apply';
      if(form.id==='partner-offer-form')body={...readOfferForm(form),action:'offer',id:form.dataset.id||null,revision:Number(form.dataset.revision),submit:new FormData(form).has('submit')};
      if(form.id==='partner-sale-form')body.action='sale';
      const result=await accountRequest(endpoint,'POST',body);if(run!==generation||owner!==(getUser()?.id||null))return;
      if(form.id==='offer-preferences-form'){prefs=result.preferences;closeDialog();toast('შეტყობინებების არჩევანი შენახულია');}
      else{closeDialog();busy=false;toast('მონაცემები შენახულია');await loadPortal();}
    }catch(failure){if(run===generation&&form.isConnected)errorNode.textContent=failure.message;}finally{if(run===generation){busy=false;if(form.isConnected)form.querySelector('[type="submit"]').disabled=false;}}
  });
  return {view,partnerView,reset,load,loadPortal,afterRender,ensureLoaded(page){sync();if(page==='partner'&&owner&&portalStatus==='idle')loadPortal();else if(page==='offers'&&status==='idle')load();},promo(){return `<section class="offers-dashboard-promo"><div><span class="eyebrow">შენთვის საინტერესო</span><h3>პატარა აღმოჩენები დედიკოსგან ♡</h3><p>აღმოაჩინე შეთავაზებები და შეინახე სასურველი არჩევანი.</p></div><button class="text-button" data-action="offers">შეთავაზებების ნახვა ↗</button></section>`;}};
}
