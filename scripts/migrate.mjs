import { readFile } from 'node:fs/promises';
import { db } from '../server/db.js';
process.loadEnvFile('.env.local');
const sql = await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8');
// Run only against the linked, provisioned database; never during static builds.
for (const statement of sql.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)) await db().query(statement);
console.log('Dediko account schema is ready.');
