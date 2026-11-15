import test from 'node:test';
import assert from 'node:assert/strict';
import { consoleAdminId, consoleSession, consoleLoginRoute } from '../server/console-auth.js';
import { hasAdminAccess } from '../server/admin-access.js';
const origin='https://dediko.vercel.app';
const post=(body,headers={})=>new Request(origin+'/api/admin?auth=login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
test('console access requires the singleton username session; a verified member is insufficient',async()=>{
  const session=user=>({api:{getSession:async()=>user?{user}:null}});
  const request=new Request(origin+'/api/admin');
  await assert.rejects(consoleSession(request,session(null)),{status:401});
  await assert.rejects(consoleSession(request,session({id:'member',username:'admin',emailVerified:true})),{status:401});
  await assert.rejects(consoleSession(request,session({id:consoleAdminId,username:'someone'})),{status:401});
  assert.equal((await consoleSession(request,session({id:consoleAdminId,username:'admin'}))).user.id,consoleAdminId);
  assert.equal(await hasAdminAccess({id:consoleAdminId,emailVerified:true}),false);
});
test('console mutations reject an absent or different expected session owner',async()=>{
  const auth={api:{getSession:async()=>({user:{id:consoleAdminId,username:'admin'}})}};
  for(const owner of [undefined,'member'])await assert.rejects(consoleSession(post({},owner?{'X-Dediko-Account':owner}:{}),auth),{status:401});
  assert.equal((await consoleSession(post({},{'X-Dediko-Account':consoleAdminId}),auth)).user.id,consoleAdminId);
});
test('console proxy exposes only login/logout and drops public tokens and spoofed rate headers',async()=>{
  let forwarded;
  const auth={handler:async request=>{
    forwarded=request;
    return Response.json({token:'must-never-reach-browser',user:{email:'internal@example.invalid'}},{headers:{'Set-Cookie':'test.session=value; HttpOnly; Secure; SameSite=Strict; Path=/api/admin'}});
  }};
  const response=await consoleLoginRoute(post({username:'admin',password:'test-only-password',rememberMe:true},{'X-Dediko-Console-Client':'198.51.100.9'}),'login',auth);
  assert.deepEqual(await response.json(),{ok:true});assert.equal(response.headers.get('cache-control'),'no-store');assert.ok(response.headers.get('set-cookie').includes('HttpOnly'));
  assert.equal(forwarded.headers.get('x-dediko-console-client'),'127.0.0.1');assert.equal((await forwarded.json()).rememberMe,false);
  await assert.rejects(consoleLoginRoute(post({}),'sign-up/email',auth),{status:404});
  await assert.rejects(consoleLoginRoute(post({username:'admin',password:'x'},{Origin:'https://other.example'}),'login',auth),{status:403});
});
