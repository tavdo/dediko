import assert from 'node:assert/strict';
const origin=new URL(process.argv[2]||'http://localhost:5173').origin;
function session(){let cookie='';return async(method='GET',body)=>{
  const response=await fetch(origin+'/api/ideas',{method,headers:{...(cookie?{cookie}:{}),...(body?{origin,'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const setCookie=response.headers.get('set-cookie');if(setCookie)cookie=setCookie.split(';')[0];
  let result;try{result=await response.json();}catch{throw new Error(`API did not return JSON (${response.status})`);}
  assert.ok(response.ok,`API ${response.status}: ${result.error||''}`);
  return result;
};}
const first=session(),second=session();
await first();await second();
let created;
try{
  const title=`სატესტო მოთხოვნა — შემოწმება ${Date.now()}`;
  const result=await first('POST',{title,description:'ტექნიკური შემოწმება: იდეა უნდა გამოჩნდეს ორ დამოუკიდებელ სესიაში.',benefit:'ვამოწმებთ საერთო შენახვასა და ერთჯერად ხმას. შემოწმების შემდეგ წაიშლება.',category:'other',publish:true});
  created=result.ideas.find(idea=>idea.title===title);assert.ok(created?.mine);assert.equal(created.votes,1);
  let other=(await second()).ideas.find(idea=>idea.id===created.id);assert.ok(other);assert.equal(other.mine,false);
  for(let i=0;i<2;i++) {other=(await second('PATCH',{id:created.id,voted:true})).ideas.find(idea=>idea.id===created.id);assert.equal(other.votes,2);}
  const authorView=(await first()).ideas.find(idea=>idea.id===created.id);assert.equal(authorView.votes,2);
  await second('PATCH',{id:created.id,voted:false});
  await first('DELETE',{id:created.id});
  assert.equal((await second()).ideas.some(idea=>idea.id===created.id),false);created=null;
  console.log(`PASS ${origin}: shared submission, independent-session visibility, persisted votes, idempotent retry, undo and author withdrawal.`);
}finally{
  if(created){try{await second('PATCH',{id:created.id,voted:false});await first('DELETE',{id:created.id});}catch{console.error('Test submission cleanup needs attention:',created.id);}}
}
