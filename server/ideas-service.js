import { randomUUID, createHash } from 'node:crypto';
import { validateIdea, normalizeIdeaTitle, ideaStatuses } from '../ideas.js';

export class IdeaError extends Error {
  constructor(status,message,extra={}) {super(message);this.status=status;this.extra=extra;}
}
export const newBoard=()=>({version:1,ideas:[],activity:[]});
const validId=value=>typeof value==='string'&&/^[0-9a-f-]{36}$/i.test(value);

export function browserIdentity(cookie='',secure=true) {
  const raw=cookie.split(';').map(item=>item.trim()).find(item=>item.startsWith('dediko_ideas='))?.slice('dediko_ideas='.length);
  const value=validId(raw)?raw:randomUUID();
  return {actor:createHash('sha256').update(value).digest('hex').slice(0,32),cookie:raw===value?null:`dediko_ideas=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure?'; Secure':''}`};
}
export function publicIdeas(board,actor,updates={}) {
  return board.ideas.filter(idea=>!updates[idea.id]?.hidden).map(idea=>{
    const update=updates[idea.id];
    return {id:idea.id,title:idea.title,description:idea.description,benefit:idea.benefit,category:idea.category,createdAt:idea.createdAt,
      status:ideaStatuses.some(status=>status.id===update?.status)?update.status:'reviewing',reply:typeof update?.reply==='string'?update.reply.slice(0,1000):'',votes:idea.voters.length,voted:idea.voters.includes(actor),mine:idea.author===actor};
  });
}
export function mutateBoard(board,actor,method,input,now=Date.now(),updates={}) {
  const next=structuredClone(board);
  next.activity=next.activity.filter(item=>item.at>now-86400000);
  const hourly=next.activity.filter(item=>item.actor===actor&&item.at>now-3600000);
  if (hourly.length>=120) throw new IdeaError(429,'ცოტა ხნით შეისვენე და მოგვიანებით სცადე.');
  if (method==='POST') {
    const validation=validateIdea(input);
    if (validation.error) throw new IdeaError(400,validation.error);
    if (next.activity.filter(item=>item.actor===actor&&item.type==='create').length>=5) throw new IdeaError(429,'დღეში მაქსიმუმ 5 იდეის დამატება შეგიძლია.');
    const duplicate=next.ideas.find(idea=>!updates[idea.id]?.hidden&&normalizeIdeaTitle(idea.title)===normalizeIdeaTitle(validation.value.title));
    if (duplicate) throw new IdeaError(409,'მსგავსი სათაურის იდეა უკვე არსებობს — შეგიძლია მას მისცე ხმა.',{existingId:duplicate.id});
    if (next.ideas.length>=250) throw new IdeaError(503,'ახალი იდეების მიღება დროებით შეჩერებულია. მოგვიანებით სცადე.');
    next.ideas.push({...validation.value,id:randomUUID(),createdAt:new Date(now).toISOString(),author:actor,voters:[actor]});
    next.activity.push({actor,at:now,type:'create'});
  } else if (method==='PATCH') {
    const idea=next.ideas.find(idea=>idea.id===input?.id&&!updates[idea.id]?.hidden);
    if (!idea) throw new IdeaError(404,'იდეა ვერ მოიძებნა.');
    if (typeof input.voted!=='boolean') throw new IdeaError(400,'ხმის მდგომარეობა არასწორია.');
    const already=idea.voters.includes(actor);
    if (already===input.voted) return board;
    if (input.voted && idea.voters.length>=250) throw new IdeaError(429,'ამ იდეაზე ხმების მიღება დროებით შეჩერებულია.');
    idea.voters=input.voted?[...idea.voters,actor]:idea.voters.filter(voter=>voter!==actor);
    next.activity.push({actor,at:now,type:'vote'});
  } else if (method==='DELETE') {
    const idea=next.ideas.find(idea=>idea.id===input?.id);
    if (!idea) throw new IdeaError(404,'იდეა ვერ მოიძებნა.');
    if (idea.author!==actor) throw new IdeaError(403,'ამ იდეის წაშლა არ შეგიძლია.');
    if (idea.voters.some(voter=>voter!==actor)) throw new IdeaError(409,'იდეას უკვე სხვა მომხმარებლების ხმები აქვს. წაშლისთვის მიმართე Dediko-ს გუნდს.');
    next.ideas=next.ideas.filter(item=>item.id!==idea.id);
  } else throw new IdeaError(405,'ეს მოქმედება ხელმისაწვდომი არ არის.');
  // Bound the shared object size even if many anonymous actors submit votes.
  if (Buffer.byteLength(JSON.stringify(next),'utf8')>3000000) throw new IdeaError(503,'სერვისი დროებით გადატვირთულია. მოგვიანებით სცადე.');
  return next;
}
export async function changeIdeas(store,actor,method,input,updates={},now=Date.now()) {
  for(let attempt=0;attempt<6;attempt++) {
    const {board,revision}=await store.read();
    const next=mutateBoard(board,actor,method,input,now,updates);
    if (next===board) return publicIdeas(board,actor,updates);
    if(await store.write(next,revision)) return publicIdeas(next,actor,updates);
  }
  throw new IdeaError(409,'სხვა ცვლილებაც ინახება. გთხოვ, ხელახლა სცადე.');
}
