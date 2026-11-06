// DOM/event integration check, not a browser layout or physical Push test.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';
import { randomUUID, webcrypto } from 'node:crypto';
import { db } from '../server/db.js';
process.loadEnvFile('.env.local');
const origin = process.argv[2] || 'http://localhost:5173';
const { window, document } = parseHTML(await readFile(new URL('../index.html',import.meta.url),'utf8'));
const memory = new Map(), cookies = new Map(), createdUsers = [], errors = [], timers = new Set();
const legacy = {version:1,profile:{name:'ძველი სივრცე',stage:'pregnant',referenceDate:'2027-06-01'},reminders:[{id:'legacy-check',title:'ძველი პირადი შეხსენება',date:'2027-01-01',time:'10:00',repeat:'none',category:'self',enabled:true,automatic:false,completed:[]}],lessons:[],completedLessons:[],pro:null,plannerTasks:[],plannerNotes:{}};
memory.set('dediko.local.v1',JSON.stringify(legacy));
const storage = {getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,String(value)),removeItem:key=>memory.delete(key)};
const location = new URL(origin);
const dialog = document.querySelector('dialog');
dialog.showModal = function(){this.open=true;};
dialog.close = function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
const originalFetch = globalThis.fetch;
async function browserFetch(input, init) {
  const request = input instanceof Request ? new Request(input,init) : new Request(new URL(String(input),origin),init);
  if(cookies.size) request.headers.set('cookie',[...cookies].map(([k,v])=>`${k}=${v}`).join('; '));
  if(request.method !== 'GET') request.headers.set('origin',origin);
  const response = await originalFetch(request);
  for(const raw of response.headers.getSetCookie()) {const pair=raw.split(';')[0],i=pair.indexOf('=');if(i>0)cookies.set(pair.slice(0,i),pair.slice(i+1));}
  if(request.url.includes('/sign-up/email')) { const body=await response.clone().json(); if(body.user?.id) createdUsers.push(body.user.id); }
  return response;
}
class BrowserFormData extends FormData {
  constructor(form) {
    super(); if(!form)return;
    for(const field of form.querySelectorAll('input,select,textarea')) {
      if(!field.name || field.disabled || (['radio','checkbox'].includes(field.type) && !(field.checked ?? field.hasAttribute('checked'))))continue;
      const value = field.type==='checkbox' ? field.getAttribute('value') || 'on' : field.value;
      this.append(field.name,value ?? '');
    }
  }
}
Object.defineProperty(window.HTMLElement.prototype,'elements',{get(){return new Proxy({}, {get:(_target,name)=>this.querySelector(`[name="${String(name)}"]`)});}});
Object.defineProperty(window.HTMLInputElement.prototype,'validity',{get(){return {valid:true};}});
const browserWindow = { addEventListener:window.addEventListener.bind(window), isSecureContext:false, scrollTo(){}, navigator:{userAgent:'Dediko DOM integration',platform:'test',maxTouchPoints:0} };
const context = vm.createContext({
  window:browserWindow,document,location,navigator:browserWindow.navigator,history:{replaceState(_state,_title,url){const next=new URL(url,origin);location.search=next.search;location.hash=next.hash;}},
  localStorage:storage,sessionStorage:storage,fetch:browserFetch,Headers,Request,Response,FormData:BrowserFormData,URL,URLSearchParams,TextEncoder,TextDecoder,
  crypto:webcrypto,console:{log(){},warn(){},error(...args){errors.push(args.map(String).join(' '));}},
  AbortController,AbortSignal,DOMException,Blob,ReadableStream,Uint8Array,ArrayBuffer,atob,btoa,structuredClone,
  setTimeout(fn,ms,...args){const timer=setTimeout(()=>{timers.delete(timer);fn(...args);},ms);timers.add(timer);return timer;},clearTimeout(timer){timers.delete(timer);clearTimeout(timer);},
  setInterval(){},clearInterval(){},matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})
});
const click = action => {
  const element = document.querySelector(`[data-action="${action}"]`);assert.ok(element,`Missing action ${action}`);
  element.dispatchEvent(new window.Event('click',{bubbles:true,cancelable:true}));
};
const fill = (form,name,value) => {const field=form.querySelector(`[name="${name}"]`);assert.ok(field,`Missing field ${name}`);field.value=value;};
const submit = form => form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
async function until(predicate,label) {const start=Date.now();while(Date.now()-start<15000){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error(`Timed out: ${label}. Form: ${document.querySelector('.form-error')?.textContent}. Errors: ${errors.join(';')}`);}
try {
  new vm.Script(await readFile(new URL('../dist/app.js',import.meta.url),'utf8')).runInContext(context);
  await until(()=>document.querySelector('#account-banner'),'legacy local space');
  click('register');const form=document.querySelector('#register-form');assert.ok(form);
  fill(form,'email',`dediko-ui-${randomUUID()}@example.invalid`);fill(form,'password',randomUUID()+randomUUID());fill(form,'name','UI დედიკო');fill(form,'referenceDate','2027-06-01');
  form.querySelector('[name="importLocal"]').checked=true;
  submit(form);
  await until(()=>document.querySelector('#account-banner')?.textContent.includes('შენახულია შენს ანგარიშში'),'signup and save');
  assert.match(document.querySelector('#main').textContent,/UI დედიკო/);
  assert.equal(memory.has('dediko.local.v1'),false);
  const [imported]=await db()`select document from dediko.accounts where user_id=${createdUsers[0]}`;
  assert.ok(imported.document.reminders.some(r=>r.id==='legacy-check'));
  assert.equal(document.querySelectorAll('.glass-nav-item').length,4);
  click('add-reminder');const reminder=document.querySelector('#reminder-form');fill(reminder,'title','UI პირადი შეხსენება');fill(reminder,'date','2027-01-02');fill(reminder,'time','11:30');
  // Linkedom does not implement the browser's default select value.
  reminder.querySelector('[name="repeat"]').querySelector('option[value="none"]').selected=true;
  reminder.querySelector('[name="category"]').querySelector('option[value="self"]').selected=true;
  submit(reminder);
  await until(()=>document.querySelector('#account-banner')?.textContent.includes('შენახულია შენს ანგარიშში')&&!dialog.open,'reminder save');
  click('profile');assert.ok(document.querySelector('.notification-state'));assert.match(document.querySelector('.account-panel').textContent,/შეტყობინებები ტელეფონზე/);
  const profile=document.querySelector('#profile-form');fill(profile,'name','განახლებული დედიკო');submit(profile);
  await until(()=>document.querySelector('#account-banner')?.textContent.includes('შენახულია შენს ანგარიშში'),'profile save');
  const stageForm=document.querySelector('#profile-form');
  stageForm.querySelector('[name="stage"][value="pregnant"]').checked=false;
  const mother=stageForm.querySelector('[name="stage"][value="mother"]');mother.checked=true;mother.dispatchEvent(new window.Event('change',{bubbles:true}));
  fill(stageForm,'referenceDate','2026-10-01');submit(stageForm);
  await until(()=>document.querySelector('#account-banner')?.textContent.includes('შენახულია შენს ანგარიშში'),'stage switch');
  const [switched]=await db()`select document from dediko.accounts where user_id=${createdUsers[0]}`;
  assert.equal(switched.document.profile.stage,'mother');assert.ok(switched.document.reminders.some(r=>r.id==='legacy-check'));
  await db()`update dediko.accounts set revision=revision+1 where user_id=${createdUsers[0]}`;
  const conflictForm=document.querySelector('#profile-form');fill(conflictForm,'name','შეუნახავი ცვლილება');submit(conflictForm);
  await until(()=>document.querySelector('#account-banner')?.textContent.includes('არ გადაგვიწერია'),'concurrent-change warning');
  click('reload-cloud');click('confirm-reload-cloud');
  await until(()=>!dialog.open&&document.querySelector('#account-banner')?.textContent.includes('შენახულია შენს ანგარიშში'),'reload authoritative account');
  click('profile');
  click('logout');await until(()=>document.querySelector('.site-header'),'logout');
  assert.ok(!document.querySelector('#account-banner'));assert.equal(errors.length,0,errors.join('; '));
  console.log('PASS: built SDK + UI signup, explicit legacy import, reminder, stage switch, conflict recovery and logout; mobile dock preserved. DOM/event test, not browser visual QA.');
} finally {
  for(const timer of timers)clearTimeout(timer);
  for(const id of createdUsers){await db()`delete from dediko.accounts where user_id=${id}`;await db()`delete from neon_auth.user where id=${id}`;}
  console.log(`Cleaned ${createdUsers.length} temporary UI account(s).`);
}
