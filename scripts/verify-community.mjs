// Explicit integration check against the linked database. Creates only marked
// test content under unique synthetic member IDs and removes it in finally.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../server/db.js';
import { createCommunityService } from '../server/community-service.js';

process.loadEnvFile('.env.local');
const sql = db(), service = createCommunityService(sql);
const first = `community-verification-${randomUUID()}`, second = `community-verification-${randomUUID()}`;
const post = { action: 'post', author: 'ტესტი', title: 'ავტომატური შემოწმება — წაიშლება', body: 'ეს არის დროებითი ინტეგრაციის შემოწმების ჩანაწერი.', type: 'question', topic: 'other', consent: true };
try {
  const { id } = await service.mutate(first, post);
  const experience = await service.mutate(second, { ...post, type: 'experience' });
  const feed = await service.list(second, new URLSearchParams('type=question&topic=other'));
  assert.equal(feed.posts.find(item => item.id === id).mine, false);
  assert.ok(!JSON.stringify(feed).includes(first));
  const comment = await service.mutate(second, { action: 'comment', postId: id, author: 'მეორე ტესტი', body: 'ვაზიარებ პირად გამოცდილებას.', consent: true });
  assert.equal((await service.detail(first, id)).comments.find(item => item.id === comment.id).mine, false);
  assert.equal((await service.detail(second, id)).comments.find(item => item.id === comment.id).mine, true);
  await assert.rejects(service.mutate(second, { action: 'delete', kind: 'post', id }), { status: 404 });
  await service.mutate(first, { action: 'report', kind: 'comment', id: comment.id, reason: 'spam' });
  await service.mutate(first, { action: 'report', kind: 'comment', id: comment.id, reason: 'spam' });
  assert.equal((await service.moderationList()).find(item => item.id === comment.id).reports, 1);
  await service.moderate({ id: comment.id, kind: 'comment', hidden: true });
  assert.equal((await service.detail(first, id)).comments.length, 0);
  await service.moderate({ id: comment.id, kind: 'comment', hidden: false });
  await service.moderate({ id, kind: 'post', hidden: true });
  await assert.rejects(service.detail(second, id), { status: 404 });
  await assert.rejects(service.mutate(second, { action: 'comment', postId: id, author: 'ტესტი', body: 'დამალული პოსტი', consent: true }), { status: 409 });
  await service.moderate({ id, kind: 'post', hidden: false });
  const burst = await Promise.allSettled(Array.from({ length: 7 }, () => service.mutate(first, post)));
  assert.equal(burst.filter(item => item.status === 'fulfilled').length, 4);
  assert.ok(burst.filter(item => item.status === 'rejected').every(item => item.reason.status === 429));
  await sql`update dediko.community_posts set comments_created = 299 where id = ${id}`;
  const replies = await Promise.allSettled(Array.from({ length: 2 }, () => service.mutate(second, { action: 'comment', postId: id, author: 'ტესტი', body: 'ბოლო ადგილი', consent: true })));
  assert.equal(replies.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(replies.find(item => item.status === 'rejected').reason.status, 409);
  assert.equal((await service.detail(first, id)).full, true);
  await service.mutate(second, { action: 'delete', kind: 'comment', id: comment.id });
  const [cleared] = await sql`select body from dediko.community_comments where id = ${comment.id}`;
  assert.equal(cleared.body, '');
  await service.mutate(first, { action: 'delete', kind: 'post', id });
  await assert.rejects(service.detail(first, id), { status: 404 });
  await service.mutate(second, { action: 'delete', kind: 'post', id: experience.id });
  console.log('PASS: persistence, ownership, privacy, reports, moderation, atomic limits and deletion.');
} finally {
  await sql`delete from dediko.community_reports where user_id in (${first}, ${second})`;
  await sql`delete from dediko.community_posts where user_id in (${first}, ${second})`;
  await sql`delete from dediko.community_limits where user_id in (${first}, ${second})`;
  console.log('Temporary community verification content removed.');
}
