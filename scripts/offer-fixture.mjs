import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {db} from '../server/db.js';
// Explicit integration tooling only: all app-table references are redirected
// into a fresh schema, with no writes to the production application tables.
export async function offerFixture() {
  process.loadEnvFile('.env.local');const sql=db(),schema=`dediko_verify_${randomBytes(8).toString('hex')}`;
  if(!/^dediko_verify_[0-9a-f]{16}$/.test(schema))throw Error('Invalid verification schema');
  const source=await readFile(new URL('../server/schema.sql',import.meta.url),'utf8');
  const scoped=(parts,...values)=>{
    const transformed=parts.map(part=>part.replaceAll('dediko.',`${schema}.`));transformed.raw=parts.raw.map(part=>part.replaceAll('dediko.',`${schema}.`));
    return sql(transformed,...values);
  };
  scoped.transaction=(queries,...options)=>sql.transaction(queries,...options);
  const cleanup=()=>sql.query(`drop schema if exists "${schema}" cascade`);
  try{
    for(const statement of source.replace(/^--.*$/gm,'').replaceAll('dediko.',`${schema}.`).replace(/(\bschema(?: if not exists)?) dediko\b/g,`$1 ${schema}`).split(';').map(x=>x.trim()).filter(Boolean))await sql.query(statement);
  }catch(error){await cleanup();throw error;}
  return {sql:scoped,schema,cleanup};
}
