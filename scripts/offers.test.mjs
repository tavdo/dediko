import test from 'node:test';
import assert from 'node:assert/strict';
import {validateOffer,validatePreferences,safeOfferURL,demoOffers} from '../offers.js';
import {createOffersHandler} from '../api/offers.js';
import {createPartnerHandler} from '../api/partner.js';
import {offerActor,publicOffer} from '../server/offers-service.js';
import {HttpError} from '../server/http.js';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const origin='https://dediko.vercel.app';
const offer={title:'შეთავაზების სატესტო სათაური',description:'მხოლოდ ტესტისთვის განკუთვნილი პროდუქტის აღწერა.',category:'hygiene',stage:'mother',city:'თბილისი',mode:'online',benefit:'20% ფასდაკლება',terms:'მოქმედებს შერჩეულ პროდუქტებზე, სხვა აქციებთან არ ერთიანდება.',url:'https://example.com/product',image:'',code:'TEST',start:'2026-11-01T00:00:00Z',end:'2026-12-01T00:00:00Z',price:'8.00',originalPrice:'10.00',pro:true};
test('offers validate prices, categories, durations, addresses and ignore self-granted placement',()=>{
  const result=validateOffer({...offer,featured:true,sponsored:true,status:'approved'});assert.equal(result.value.price,800);assert.equal(result.value.featured,undefined);
  for(const fields of [{price:'11'},{price:'1.999'},{category:'unknown'},{stage:'doctor'},{mode:'store',branches:''},{url:'javascript:alert(1)'},{image:'http://example.com/image.jpg'},{end:'2026-10-01'},{price:'',originalPrice:'10'},{pro:true,title:'x'}])assert.ok(validateOffer({...offer,...fields}).error);
  assert.equal(safeOfferURL('https://127.0.0.1/test'),null);assert.equal(safeOfferURL('https://example.com@localhost/test'),null);assert.equal(safeOfferURL('https://example.com:8080'),null);
  assert.equal(demoOffers.length,6);assert.ok(demoOffers.every(x=>x.demo&&!x.url&&!x.code));
});
test('Pro offer responses redact redemption secrets while leaving explanatory terms visible',()=>{
  const row={id:'test',content:validateOffer(offer).value,partner:'პარტნიორი',featured:true,sponsored:true,revision:2};
  assert.equal(publicOffer(row).code,null);assert.equal(publicOffer(row).url,null);assert.equal(publicOffer(row).locked,true);
  assert.equal(publicOffer(row,true).code,'TEST');assert.equal(publicOffer(row,true).locked,false);
});
test('offer notifications require explicit opt-in, bounded categories and valid audience',()=>{
  assert.ok(validatePreferences({enabled:true,categories:[],stage:'all',city:''}).error);
  assert.ok(validatePreferences({enabled:'true',categories:['hygiene'],stage:'all',city:''}).error);
  assert.ok(validatePreferences({enabled:true,categories:['medicine'],stage:'all',city:''}).error);
  assert.deepEqual(validatePreferences({enabled:false,categories:['hygiene','hygiene'],stage:'all',city:''}).value.categories,['hygiene']);
});
test('analytics browser cookie is signed, scoped, and malformed unicode cannot crash validation',()=>{
  const prior=process.env.AUTH_COOKIE_SECRET;process.env.AUTH_COOKIE_SECRET='test-only-cookie-key'.repeat(3);
  try {
    const minted=offerActor(new Request(origin+'/api/offers'),true);assert.ok(minted.setCookie.includes('HttpOnly'));assert.ok(minted.setCookie.includes('Secure'));
    const cookie=minted.setCookie.split(';')[0];assert.equal(offerActor(new Request(origin+'/api/offers',{headers:{cookie}})).actor,minted.actor);
    assert.throws(()=>offerActor(new Request(origin+'/api/offers',{headers:{cookie:cookie.slice(0,-1)+(cookie.endsWith('x')?'y':'x')}})),{status:403});
    assert.throws(()=>offerActor(new Request(origin+'/api/offers',{headers:{cookie:'dediko.offers=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.'+'é'.repeat(43)}})),{status:403});
  } finally {if(prior===undefined)delete process.env.AUTH_COOKIE_SECRET;else process.env.AUTH_COOKIE_SECRET=prior;}
});
test('push clicks keep reminder and offer destinations separate and reject external targets',async()=>{
  const handlers={},shown=[];let pending,navigated;
  const self={addEventListener:(type,handler)=>handlers[type]=handler,registration:{showNotification:async(title,options)=>shown.push(options)},
    location:{origin},clients:{matchAll:async()=>[{url:origin+'/',navigate:async value=>{navigated=value;},focus:async()=>{}}]}};
  vm.runInNewContext(await readFile(new URL('../sw.js',import.meta.url),'utf8'),{self,URL});
  for(const [url,expected]of[['/?page=offers','/?page=offers'],['https://elsewhere.example','/?page=reminders']]){
    handlers.push({data:{json:()=>({url,tag:'test'})},waitUntil:promise=>pending=promise});await pending;
    assert.equal(shown.at(-1).data.url,expected);
    handlers.notificationclick({notification:{close(){},data:{url}},waitUntil:promise=>pending=promise});await pending;assert.equal(navigated,origin+expected);
  }
});
test('offers API permits public browsing but protects member changes and partner portal',async()=>{
  const prior=process.env.AUTH_COOKIE_SECRET;process.env.AUTH_COOKIE_SECRET='test-only-api-key'.repeat(3);
  try {
    let mutations=0;const auth=async()=>{throw new HttpError(401,'შედით');};
    const handler=createOffersHandler({catalog:async()=>({offers:[]}),member:async()=>{mutations++;}},auth);
    assert.equal((await handler(new Request(origin+'/api/offers'))).status,200);
    assert.equal((await handler(new Request(origin+'/api/offers?member=1'))).status,401);
    const post=body=>new Request(origin+'/api/offers',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await handler(post({action:'save',id:demoOffers[0].id,saved:true}))).status,401);
    const foreign=new Request(origin+'/api/offers',{method:'POST',headers:{origin:'https://other.example','Content-Type':'application/json'},body:'{}'});
    assert.equal((await handler(foreign)).status,403);assert.equal(mutations,0);
    const partner=createPartnerHandler({},auth);assert.equal((await partner(new Request(origin+'/api/partner'))).status,401);
  } finally {if(prior===undefined)delete process.env.AUTH_COOKIE_SECRET;else process.env.AUTH_COOKIE_SECRET=prior;}
});
