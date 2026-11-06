import { readFile, appendFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import * as webpush from 'web-push';

process.loadEnvFile('.env.local');
const keys = webpush.generateVAPIDKeys();
const values = {
  AUTH_COOKIE_SECRET: process.env.AUTH_COOKIE_SECRET || randomBytes(48).toString('base64url'),
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || keys.publicKey,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || keys.privateKey,
  VAPID_SUBJECT: 'https://dediko.vercel.app',
  APP_ORIGIN: 'https://dediko.vercel.app',
  CRON_SECRET: process.env.CRON_SECRET || randomBytes(32).toString('base64url')
};
const existing = await readFile('.env.local', 'utf8');
for (const [name, value] of Object.entries(values)) {
  if (!new RegExp(`^${name}=`, 'm').test(existing)) await appendFile('.env.local', `\n${name}=${JSON.stringify(value)}\n`);
  await new Promise((resolve, reject) => {
    const child = spawn('npm.cmd', ['exec', '--yes', '--package=vercel', '--', 'vercel', 'env', 'add', name, 'production', '--scope', 'tavdos-projects', '--non-interactive'], { shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.stdin.end(value);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${name}: environment provisioning failed (code ${code}). ${output.includes('already exists') ? 'Already exists.' : ''}`)));
  });
  console.log(`${name} provisioned.`);
}
