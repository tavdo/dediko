import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {newBoard} from './ideas-service.js';
const path=resolve(import.meta.dirname,'../.local/ideas.json');
let queue=Promise.resolve();
export const localIdeasStore={
  async read(){try{const text=await readFile(path,'utf8');return {board:JSON.parse(text),revision:createHash('sha256').update(text).digest('hex')};}catch(error){if(error.code==='ENOENT')return {board:newBoard(),revision:null};throw error;}},
  write(board,revision){
    const operation=queue.then(async()=>{const current=await this.read();if(current.revision!==revision)return false;await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(board),'utf8');return true;});
    queue=operation.catch(()=>{});return operation;
  }
};
