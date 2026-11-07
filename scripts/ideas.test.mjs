import test from 'node:test';
import assert from 'node:assert/strict';
import {validateIdea,filterIdeas} from '../ideas.js';
import {newBoard,mutateBoard,publicIdeas,changeIdeas,browserIdentity,adminIdeas,moderateIdea} from '../server/ideas-service.js';
import {createIdeasHandler} from '../api/ideas.js';
const input={title:'პარტნიორთან შეხსენებების გაზიარება',description:'მინდა ბავშვის მოვლის შეხსენებები პარტნიორთან გავაზიარო.',benefit:'ორივე მშობელი უკეთ დავგეგმავთ ყოველდღიურობას.',category:'reminders',publish:true};
function memoryStore(){let board=newBoard(),revision=0;return {async read(){return {board:structuredClone(board),revision};},async write(next,expected){if(expected!==revision)return false;board=structuredClone(next);revision++;return true;}};}
test('publishing requires consent, valid content and known categories',()=>{
  assert.ok(validateIdea(input).value);
  for(const change of [{publish:false},{category:'admin'},{title:' '},{website:'bot'},{description:'x'.repeat(1001)}]) assert.ok(validateIdea({...input,...change}).error);
});
test('public output does not leak voter IDs, author identity or activity',()=>{
  const board=mutateBoard(newBoard(),'actor','POST',input);
  const idea=publicIdeas(board,'actor')[0];
  assert.equal(idea.voted,true);assert.equal(idea.mine,true);assert.equal(idea.votes,1);
  assert.ok(!('voters' in idea));assert.ok(!('author' in idea));assert.ok(!('activity' in idea));
  assert.equal(publicIdeas(board,'other')[0].mine,false);
});
test('setting a vote is idempotent, undoable and cannot change roadmap status',()=>{
  let board=mutateBoard(newBoard(),'a','POST',input);const id=board.ideas[0].id;
  board=mutateBoard(board,'b','PATCH',{id,voted:true,status:'completed'});
  board=mutateBoard(board,'b','PATCH',{id,voted:true});
  assert.equal(publicIdeas(board,'b')[0].votes,2);assert.equal(publicIdeas(board,'b')[0].status,'reviewing');
  board=mutateBoard(board,'b','PATCH',{id,voted:false});assert.equal(board.ideas[0].voters.length,1);
  assert.equal(publicIdeas(board,'a',{[id]:{status:'planned',reply:'მივიღეთ'}})[0].status,'planned');
  assert.deepEqual(publicIdeas(board,'a',{[id]:{hidden:true}}),[]);
});
test('duplicate titles and daily submission bursts are rejected',()=>{
  let board=mutateBoard(newBoard(),'a','POST',input);
  assert.throws(()=>mutateBoard(board,'b','POST',{...input,title:'  '+input.title+'  '}),error=>error.status===409);
  for(let i=0;i<4;i++)board=mutateBoard(board,'a','POST',{...input,title:input.title+i});
  assert.throws(()=>mutateBoard(board,'a','POST',{...input,title:input.title+'extra'}),error=>error.status===429);
});
test('conditional-write retries preserve concurrent votes and submissions',async()=>{
  const store=memoryStore();await changeIdeas(store,'author','POST',input);
  const id=(await store.read()).board.ideas[0].id;
  await Promise.all(['b','c','d'].map(actor=>changeIdeas(store,actor,'PATCH',{id,voted:true})));
  assert.equal((await store.read()).board.ideas[0].voters.length,4);
});
test('moderation preserves votes, overrides legacy settings and rejects stale edits', async () => {
  const store = memoryStore();
  await changeIdeas(store, 'author', 'POST', input);
  const { id } = (await store.read()).board.ideas[0];
  const legacy = { [id]: { status: 'planned' } };
  assert.equal(adminIdeas((await store.read()).board, legacy)[0].status, 'planned');
  const change = { id, revision: 0, status: 'completed', reply: 'დაემატა', hidden: false };
  await Promise.all([changeIdeas(store, 'voter', 'PATCH', { id, voted: true }, legacy), moderateIdea(store, change, legacy)]);
  const current = publicIdeas((await store.read()).board, 'voter', legacy)[0];
  assert.equal(current.votes, 2);
  assert.equal(current.status, 'completed');
  assert.equal(current.reply, 'დაემატა');
  assert.equal(current.revision, undefined);
  await assert.rejects(moderateIdea(store, change, legacy), { status: 409 });
  await moderateIdea(store, { ...change, revision: 1, hidden: true }, legacy);
  const { board } = await store.read();
  assert.deepEqual(publicIdeas(board, 'voter', legacy), []);
  const [hidden] = adminIdeas(board, legacy);
  assert.equal(hidden.hidden, true);
  assert.equal(hidden.voters, undefined);
  assert.equal(hidden.author, undefined);
  await assert.rejects(changeIdeas(store, 'new-voter', 'PATCH', { id, voted: true }, legacy), { status: 404 });
});
test('only the author may withdraw an idea, and not after others support it',()=>{
  let board=mutateBoard(newBoard(),'a','POST',input);const id=board.ideas[0].id;
  assert.throws(()=>mutateBoard(board,'b','DELETE',{id}),error=>error.status===403);
  assert.equal(mutateBoard(board,'a','DELETE',{id}).ideas.length,0);
  board=mutateBoard(board,'b','PATCH',{id,voted:true});
  assert.throws(()=>mutateBoard(board,'a','DELETE',{id}),error=>error.status===409);
});
test('HTTP boundary rejects cross-origin, over-limit and invalid JSON requests',async()=>{
  const handler=createIdeasHandler(memoryStore());
  const request=(body,origin='https://dediko.vercel.app')=>new Request('https://dediko.vercel.app/api/ideas',{method:'POST',headers:{origin,'content-type':'application/json'},body});
  assert.equal((await handler(request(JSON.stringify(input),'https://evil.test'))).status,403);
  assert.equal((await handler(request('x'.repeat(10001)))).status,413);
  assert.equal((await handler(request('{'))).status,400);
  const created=await handler(request(JSON.stringify(input)));assert.equal(created.status,201);
  assert.match(created.headers.get('set-cookie'),/HttpOnly; SameSite=Lax/);
  const cookie=created.headers.get('set-cookie').split(';')[0];
  const response=await handler(new Request('https://dediko.vercel.app/api/ideas',{headers:{cookie}}));
  assert.equal((await response.json()).ideas[0].mine,true);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.notEqual(browserIdentity(cookie).actor,cookie.split('=')[1]);
});
test('filters combine category, roadmap status, ownership and search',()=>{
  const idea={id:'x',title:'ახალი ვიდეო',description:'გაკვეთილი',benefit:'დაგვეხმარება',category:'lessons',status:'planned',votes:3,mine:true,createdAt:'2026-11-06'};
  assert.equal(filterIdeas([idea],{category:'lessons',status:'planned',search:'ვიდეო',mine:true}).length,1);
  assert.equal(filterIdeas([idea],{category:'mother'}).length,0);
});
