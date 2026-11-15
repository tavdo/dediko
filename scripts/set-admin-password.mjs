// Local operator tool. Password comes from stdin, never command arguments,
// source configuration or a browser-side default. Re-running rotates it.
import { readFileSync } from 'node:fs';
import { hashPassword } from 'better-auth/crypto';
import { db } from '../server/db.js';
import { consoleAdminId } from '../server/console-auth.js';
process.loadEnvFile('.env.local');
const password = readFileSync(0, 'utf8').replace(/[\r\n]+$/, '');
if (password.length < 8 || password.length > 128) throw new Error('Provide an 8–128 character password through stdin.');
const hash = await hashPassword(password), sql = db();
await sql.transaction([
  sql`insert into dediko.console_users(id,name,email,"emailVerified",username,"displayUsername","createdAt","updatedAt")
    values(${consoleAdminId},'admin','console@dediko.invalid',true,'admin','admin',now(),now())
    on conflict(id) do update set username='admin',"displayUsername"='admin',"updatedAt"=now()`,
  sql`insert into dediko.console_accounts(id,"accountId","providerId","userId",password,"createdAt","updatedAt")
    values('dediko-console-credential',${consoleAdminId},'credential',${consoleAdminId},${hash},now(),now())
    on conflict(id) do update set password=excluded.password,"updatedAt"=now()`,
  sql`delete from dediko.console_sessions where "userId"=${consoleAdminId}`
]);
console.log('The single admin username is configured. Previous console sessions were revoked.');
