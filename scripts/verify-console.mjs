import assert from 'node:assert/strict';
import { hashPassword } from 'better-auth/crypto';
import { Pool,neonConfig } from '@neondatabase/serverless';
import { consoleAdminId,createConsoleAuth,consoleLoginRoute,consoleSession } from '../server/console-auth.js';
import { offerFixture } from './offer-fixture.mjs';
const fixture=await offerFixture(),sql=fixture.sql;
const origin='http://localhost:5173',previousOrigin=process.env.APP_ORIGIN;process.env.APP_ORIGIN=origin;
neonConfig.webSocketConstructor=WebSocket;
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2,idleTimeoutMillis:1000});
const auth=createConsoleAuth({pool,schema:fixture.schema,origin,secret:'isolated-console-verification-secret-only-12345'});
const password='isolated-console-password',headers={Origin:origin,'Content-Type':'application/json'};
const post=(body,cookie)=>new Request(origin+'/api/admin',{method:'POST',headers:{...headers,...(cookie?{cookie,'X-Dediko-Account':consoleAdminId}:{})},body:JSON.stringify(body)});
try{
  await sql`insert into dediko.console_users(id,name,email,"emailVerified",username,"displayUsername","createdAt","updatedAt") values(${consoleAdminId},'admin','console@example.invalid',true,'admin','admin',now(),now())`;
  await sql`insert into dediko.console_accounts(id,"accountId","providerId","userId",password,"createdAt","updatedAt") values('test-credential',${consoleAdminId},'credential',${consoleAdminId},${await hashPassword(password)},now(),now())`;
  assert.equal((await consoleLoginRoute(post({username:'other',password}),'login',auth)).status,401);
  assert.equal((await consoleLoginRoute(post({username:'admin',password:'incorrect-password'}),'login',auth)).status,401);
  let response=await consoleLoginRoute(post({username:'admin',password}),'login',auth);assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});
  const raw=response.headers.getSetCookie();assert.ok(raw.every(x=>x.includes('HttpOnly')&&x.includes('SameSite=Strict')&&x.includes('Path=/api/admin')));
  const cookie=raw.map(x=>x.split(';')[0]).join('; '),read=()=>new Request(origin+'/api/admin',{headers:{cookie}});
  assert.equal((await consoleSession(read(),auth)).user.id,consoleAdminId);
  await sql`update dediko.console_sessions set "expiresAt"=now()-interval '1 second'`;
  await assert.rejects(consoleSession(read(),auth),{status:401});
  response=await consoleLoginRoute(post({username:'admin',password}),'login',auth);
  const nextCookie=response.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
  assert.equal((await consoleLoginRoute(post({},nextCookie),'logout',auth)).status,200);
  await assert.rejects(consoleSession(new Request(origin+'/api/admin',{headers:{cookie:nextCookie}}),auth),{status:401});
  // Persistent shared limits cannot be bypassed by another browser/header/IP.
  for(let i=0;i<10;i++){
    const result=await consoleLoginRoute(post({username:'other',password}),'login',auth);
    if(result.status===429)break;
  }
  assert.equal((await consoleLoginRoute(post({username:'admin',password}),'login',auth)).status,429);
  const [count]=await sql`select count(*)::integer as users from dediko.console_users`;assert.equal(count.users,1);
  console.log('PASS: real Better Auth username/password, HTTP-only sessions, sole administrator, expiry, logout and persistent brute-force limits in an isolated schema.');
}finally{await pool.end();await fixture.cleanup();if(previousOrigin===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=previousOrigin;}
