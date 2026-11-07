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
function moderationFor(idea, updates) {
  const update = idea.moderation ?? updates[idea.id];
  return {
    status: ideaStatuses.some(status => status.id === update?.status) ? update.status : 'reviewing',
    reply: typeof update?.reply === 'string' ? update.reply.slice(0, 1000) : '',
    hidden: Boolean(update?.hidden),
    revision: idea.moderation?.revision ?? 0
  };
}

function ideaDetails(idea) {
  const { id, title, description, benefit, category, createdAt, voters } = idea;
  return { id, title, description, benefit, category, createdAt, votes: voters.length };
}

export function publicIdeas(board, actor, updates = {}) {
  return board.ideas.flatMap(idea => {
    const { status, reply, hidden } = moderationFor(idea, updates);
    if (hidden) return [];
    return [{ ...ideaDetails(idea), status, reply, voted: idea.voters.includes(actor), mine: idea.author === actor }];
  });
}

export function adminIdeas(board, updates = {}) {
  return board.ideas.map(idea => ({ ...ideaDetails(idea), ...moderationFor(idea, updates) }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function assertBoardSize(board) {
  if (Buffer.byteLength(JSON.stringify(board), 'utf8') > 3000000) {
    throw new IdeaError(503, 'სერვისი დროებით გადატვირთულია. მოგვიანებით სცადე.');
  }
}

export async function moderateIdea(store, input, updates = {}) {
  if (!validId(input?.id) || !Number.isSafeInteger(input.revision) || input.revision < 0 ||
      !ideaStatuses.some(status => status.id === input.status) || typeof input.reply !== 'string' ||
      input.reply.length > 1000 || typeof input.hidden !== 'boolean') {
    throw new IdeaError(400, 'შეამოწმე იდეის სტატუსი და პასუხი.');
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    const { board, revision } = await store.read();
    const idea = board.ideas.find(item => item.id === input.id);
    if (!idea) throw new IdeaError(404, 'იდეა ვერ მოიძებნა.');
    if (moderationFor(idea, updates).revision !== input.revision) {
      throw new IdeaError(409, 'იდეა შეიცვალა. განაახლე სია და სცადე ხელახლა.');
    }
    const moderation = { status: input.status, reply: input.reply.trim(), hidden: input.hidden, revision: input.revision + 1 };
    const next = { ...board, ideas: board.ideas.map(item => item === idea ? { ...item, moderation } : item) };
    assertBoardSize(next);
    if (await store.write(next, revision)) return { ...ideaDetails(idea), ...moderation };
  }
  throw new IdeaError(409, 'სხვა ცვლილებაც ინახება. გთხოვ, ხელახლა სცადე.');
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
    const duplicate=next.ideas.find(idea=>!moderationFor(idea,updates).hidden&&normalizeIdeaTitle(idea.title)===normalizeIdeaTitle(validation.value.title));
    if (duplicate) throw new IdeaError(409,'მსგავსი სათაურის იდეა უკვე არსებობს — შეგიძლია მას მისცე ხმა.',{existingId:duplicate.id});
    if (next.ideas.length>=250) throw new IdeaError(503,'ახალი იდეების მიღება დროებით შეჩერებულია. მოგვიანებით სცადე.');
    next.ideas.push({...validation.value,id:randomUUID(),createdAt:new Date(now).toISOString(),author:actor,voters:[actor]});
    next.activity.push({actor,at:now,type:'create'});
  } else if (method==='PATCH') {
    const idea=next.ideas.find(idea=>idea.id===input?.id&&!moderationFor(idea,updates).hidden);
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
  assertBoardSize(next);
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
