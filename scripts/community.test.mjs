import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCommunity } from '../community.js';
import { createCommunityHandler } from '../api/community.js';
import { communityId, createCommunityService } from '../server/community-service.js';
import { HttpError } from '../server/http.js';

const input = { author: 'ანა', title: 'როგორ პოულობთ დასვენების დროს?', body: 'მაინტერესებს თქვენი პირადი გამოცდილება და ყოველდღიური ჩვევები.', type: 'question', topic: 'motherhood', consent: true };
const origin = 'https://dediko.vercel.app';
const request = (body, headers = {}) => new Request(`${origin}/api/community`, { method: 'POST', headers: { origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('community publishing requires an explicit public name, consent and bounded known content', () => {
  assert.equal(validateCommunity(input).value.author, 'ანა');
  assert.equal(validateCommunity({ ...input, type: 'experience' }).value.type, 'experience');
  for (const change of [{ consent: 'true' }, { consent: false }, { author: ' ' }, { body: 'x'.repeat(4001) }, { title: 'tiny' }, { type: 'doctor' }, { topic: 'unknown' }]) assert.ok(validateCommunity({ ...input, ...change }).error);
  assert.ok(validateCommunity(null).error);
  assert.ok(validateCommunity({ ...input, author: '♡' }).error);
  assert.ok(validateCommunity({ ...input, author: '🙂' }).error);
  assert.ok(validateCommunity({ author: 'ანა', body: 'მადლობა', consent: true }, true).value);
  assert.ok(validateCommunity({ author: 'ანა', body: 'x'.repeat(1501), consent: true }, true).error);
  const clean = validateCommunity({ ...input, userId: 'forged', verifiedDoctor: true, hidden: true }).value;
  assert.equal(clean.userId, undefined); assert.equal(clean.verifiedDoctor, undefined); assert.equal(clean.hidden, undefined);
});

test('community API requires authentication for member reads and all writes', async () => {
  const handler = createCommunityHandler({}, async () => { throw new HttpError(401, 'შესვლა საჭიროა'); });
  assert.equal((await handler(new Request(`${origin}/api/community`))).status, 401);
  assert.equal((await handler(request(input))).status, 401);
});

test('community API validates origin and body, and always takes identity from the session', async () => {
  const calls = [];
  const handler = createCommunityHandler({
    mutate: async (id, body) => { calls.push([id, body]); return { id: 'saved' }; },
    list: async (id, params) => ({ posts: [], more: false, type: params.get('type') }),
    detail: async (id, post) => ({ post })
  }, async () => ({ user: { id: 'real-member' }, cookies: [] }));
  assert.equal((await handler(request(input, { origin: 'https://elsewhere.example' }))).status, 403);
  assert.equal((await handler(request({ body: 'x'.repeat(24001) }))).status, 413);
  assert.equal((await handler(new Request(`${origin}/api/community`, { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: '{' }))).status, 400);
  const response = await handler(request({ ...input, userId: 'forged-member' }));
  assert.equal(response.status, 200); assert.equal(calls.length, 1); assert.equal(calls[0][0], 'real-member');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const list = await handler(new Request(`${origin}/api/community?type=experience`));
  assert.equal((await list.json()).type, 'experience');
});

test('community rejects malformed IDs and actions before touching storage', async () => {
  const service = createCommunityService(() => { throw new Error('Storage should not be called'); });
  assert.throws(() => communityId("x' OR 1=1"), { status: 400 });
  await assert.rejects(service.detail('member', 'invalid'), { status: 400 });
  await assert.rejects(service.list('member', new URLSearchParams('offset=-20')), { status: 400 });
  await assert.rejects(service.list('member', new URLSearchParams('topic=forged')), { status: 400 });
  await assert.rejects(service.mutate('member', { action: 'become-doctor' }), { status: 400 });
  await assert.rejects(service.mutate('member', { action: 'delete', id: 'invalid' }), { status: 400 });
  await assert.rejects(service.moderate({ id: 'd769fbf6-10b6-412f-98a4-c74a467bd121', hidden: 'true' }), { status: 400 });
});
