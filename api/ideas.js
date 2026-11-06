import { blobIdeasStore } from '../server/ideas-store.js';
import { browserIdentity, publicIdeas, changeIdeas, IdeaError } from '../server/ideas-service.js';
import { ideaUpdates } from '../server/idea-statuses.js';

export const maxDuration=30;
export function createIdeasHandler(store=blobIdeasStore) {
  return async function handle(request) {
    const identity=browserIdentity(request.headers.get('cookie')||'',new URL(request.url).protocol==='https:');
    const headers={'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Vary':'Cookie'};
    if(identity.cookie) headers['Set-Cookie']=identity.cookie;
    const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
    try {
      if(request.method==='GET') {
        const {board}=await store.read();
        return json({ideas:publicIdeas(board,identity.actor,ideaUpdates)});
      }
      if(!['POST','PATCH','DELETE'].includes(request.method)) return json({error:'მეთოდი მიუწვდომელია.'},405);
      if(request.headers.get('origin')!==new URL(request.url).origin) return json({error:'მოთხოვნის წყარო არასწორია.'},403);
      if(!request.headers.get('content-type')?.startsWith('application/json')) return json({error:'საჭიროა JSON ფორმატი.'},415);
      if(Number(request.headers.get('content-length')||0)>10000) return json({error:'მოთხოვნა ძალიან დიდია.'},413);
      const reader=request.body?.getReader();
      if(!reader) return json({error:'მოთხოვნა ცარიელია.'},400);
      const chunks=[];let size=0;
      while(true) {const {value,done}=await reader.read();if(done) break;size+=value.length;if(size>10000){await reader.cancel();return json({error:'მოთხოვნა ძალიან დიდია.'},413);}chunks.push(value);}
      let input;
      try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return json({error:'მოთხოვნის ფორმატი არასწორია.'},400);}
      const ideas=await changeIdeas(store,identity.actor,request.method,input,ideaUpdates);
      return json({ideas},request.method==='POST'?201:200);
    } catch(error) {
      if(error instanceof IdeaError) return json({error:error.message,...error.extra},error.status);
      console.error('ideas_api_error',{name:error.name});
      return json({error:'იდეების შენახვა დროებით ვერ ხერხდება. შენს ტექსტს ფორმაში შევინარჩუნებთ — სცადე ხელახლა.'},503);
    }
  };
}
const handler=createIdeasHandler();
export const GET=handler;
export const POST=handler;
export const PATCH=handler;
export const DELETE=handler;
