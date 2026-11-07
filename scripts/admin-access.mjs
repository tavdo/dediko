import { db } from '../server/db.js';

const [action, address] = process.argv.slice(2);
if (!['grant', 'revoke'].includes(action) || !address?.trim()) {
  console.error('Usage: node scripts/admin-access.mjs grant|revoke email@example.com');
  process.exit(1);
}

process.loadEnvFile('.env.local');
const sql = db();
const email = address.trim().toLowerCase();
const users = await sql`select id, "emailVerified" from neon_auth."user" where lower(email) = ${email} limit 2`;
if (users.length !== 1 || (action === 'grant' && users[0].emailVerified !== true)) {
  console.error('Granting access requires a unique Dediko account with a verified email.');
  process.exit(1);
}

if (action === 'grant') {
  await sql`insert into dediko.admins (user_id) values (${users[0].id}) on conflict do nothing`;
  console.log('Admin access granted.');
} else {
  await sql`delete from dediko.admins where user_id = ${users[0].id}`;
  console.log('Admin access revoked.');
}
