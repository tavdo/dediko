import { randomUUID } from 'node:crypto';
import { db } from './db.js';
import { HttpError } from './http.js';
import { communityReasons, communityTypes, communityTopics, validateCommunity } from '../community.js';

export function communityId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new HttpError(400, 'ჩანაწერის ნომერი არასწორია.');
  return value;
}
// All SQL is parameterized. Internal account IDs and emails never enter member responses.
export function createCommunityService(sql) {
  const query = () => sql || db();
  async function rate(userId, kind) {
    const limit = { post: 5, comment: 30, report: 20 }[kind];
    const rows = await query()`insert into dediko.community_limits (user_id, kind, started_at, used)
      values (${userId}, ${kind}, now(), 1)
      on conflict (user_id, kind) do update set
        used = case when community_limits.started_at < now() - interval '1 hour' then 1 else community_limits.used + 1 end,
        started_at = case when community_limits.started_at < now() - interval '1 hour' then now() else community_limits.started_at end
      where community_limits.started_at < now() - interval '1 hour' or community_limits.used < ${limit}
      returning used`;
    if (!rows.length) throw new HttpError(429, 'ამ საათში გამოქვეყნების ლიმიტს მიაღწიე. ცოტა მოგვიანებით სცადე.');
  }
  async function list(userId, params) {
    const type = params.get('type') || 'all', topic = params.get('topic') || 'all';
    if ((type !== 'all' && !communityTypes.some(x => x.id === type)) || (topic !== 'all' && !communityTopics.some(x => x.id === topic))) throw new HttpError(400, 'ფილტრი არასწორია.');
    const raw = params.get('offset') || '0';
    if (!/^\d{1,6}$/.test(raw)) throw new HttpError(400, 'გვერდის ნომერი არასწორია.');
    const offset = Number(raw);
    const rows = await query()`select p.id, p.author, p.title, p.body, p.type, p.topic, p.created_at as "createdAt",
      p.user_id = ${userId} as mine,
      (select count(*)::integer from dediko.community_comments c where c.post_id = p.id and not c.hidden and not c.deleted) as comments
      from dediko.community_posts p where not p.hidden and not p.deleted
      and (${type} = 'all' or p.type = ${type}) and (${topic} = 'all' or p.topic = ${topic})
      order by p.created_at desc, p.id desc limit 21 offset ${offset}`;
    return { posts: rows.slice(0, 20), more: rows.length > 20 };
  }
  async function detail(userId, id) {
    communityId(id);
    const [post] = await query()`select id, author, title, body, type, topic, created_at as "createdAt", user_id = ${userId} as mine, comments_created >= 300 as full
      from dediko.community_posts where id = ${id} and not hidden and not deleted`;
    if (!post) throw new HttpError(404, 'პოსტი აღარ არის ხელმისაწვდომი.');
    const comments = await query()`select id, author, body, created_at as "createdAt", user_id = ${userId} as mine
      from dediko.community_comments where post_id = ${id} and not hidden and not deleted order by created_at, id limit 301`;
    const full = post.full; delete post.full;
    return { post, comments: comments.slice(0, 300), full };
  }
  async function mutate(userId, input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'მონაცემები არასწორია.');
    if (input.action === 'post' || input.action === 'comment') {
      const comment = input.action === 'comment', result = validateCommunity(input, comment);
      if (result.error) throw new HttpError(400, result.error);
      const value = result.value, id = randomUUID();
      if (comment) {
        const postId = communityId(input.postId);
        await rate(userId, 'comment');
        // Atomically reserve a reply slot; concurrent writers cannot exceed the cap.
        const rows = await query()`with parent as (
          update dediko.community_posts set comments_created = comments_created + 1
          where id = ${postId} and not hidden and not deleted and comments_created < 300 returning id
        ) insert into dediko.community_comments (id, post_id, user_id, author, body)
          select ${id}, parent.id, ${userId}, ${value.author}, ${value.body} from parent
          returning id`;
        if (!rows.length) throw new HttpError(409, 'პოსტი მიუწვდომელია ან კომენტარების ლიმიტი შევსებულია.');
      } else {
        await rate(userId, 'post');
        await query()`insert into dediko.community_posts (id, user_id, author, title, body, type, topic)
          values (${id}, ${userId}, ${value.author}, ${value.title}, ${value.body}, ${value.type}, ${value.topic})`;
      }
      return { id };
    }
    if (input.action === 'delete') {
      const id = communityId(input.id);
      const rows = input.kind === 'post'
        ? await query()`update dediko.community_posts set deleted = true, body = '', title = 'წაშლილია', author = 'წაშლილია' where id = ${id} and user_id = ${userId} and not deleted returning id`
        : input.kind === 'comment' ? await query()`update dediko.community_comments set deleted = true, body = '', author = 'წაშლილია' where id = ${id} and user_id = ${userId} and not deleted returning id` : [];
      if (!rows.length) throw new HttpError(404, 'შენი ჩანაწერი ვერ მოიძებნა.');
      return { ok: true };
    }
    if (input.action === 'report') {
      const id = communityId(input.id);
      if (!communityReasons.some(x => x.id === input.reason)) throw new HttpError(400, 'აირჩიე გასაჩივრების მიზეზი.');
      const found = input.kind === 'post'
        ? await query()`select id from dediko.community_posts where id = ${id} and not deleted and not hidden`
        : input.kind === 'comment' ? await query()`select c.id from dediko.community_comments c join dediko.community_posts p on p.id = c.post_id
          where c.id = ${id} and not c.deleted and not c.hidden and not p.deleted and not p.hidden` : [];
      if (!found.length) throw new HttpError(404, 'ჩანაწერი ვერ მოიძებნა.');
      await rate(userId, 'report');
      await query()`insert into dediko.community_reports (user_id, kind, target_id, reason) values (${userId}, ${input.kind}, ${id}, ${input.reason}) on conflict do nothing`;
      return { ok: true };
    }
    throw new HttpError(400, 'მოქმედება არასწორია.');
  }
  async function moderate(input) {
    const id = communityId(input?.id);
    if (typeof input.hidden !== 'boolean') throw new HttpError(400, 'აირჩიე ხილვადობა.');
    const rows = input.kind === 'post'
      ? await query()`update dediko.community_posts set hidden = ${input.hidden} where id = ${id} and not deleted returning id`
      : input.kind === 'comment' ? await query()`update dediko.community_comments set hidden = ${input.hidden} where id = ${id} and not deleted returning id` : [];
    if (!rows.length) throw new HttpError(404, 'ჩანაწერი ვერ მოიძებნა.');
    return { ok: true };
  }
  async function moderationList() {
    return query()`select * from (
      select p.id, 'post' as kind, p.title, p.body, p.author, p.hidden, p.created_at as "createdAt",
        (select count(*)::integer from dediko.community_reports r where r.target_id = p.id and r.kind = 'post') as reports
      from dediko.community_posts p where not p.deleted
      union all
      select c.id, 'comment' as kind, p.title, c.body, c.author, c.hidden, c.created_at as "createdAt",
        (select count(*)::integer from dediko.community_reports r where r.target_id = c.id and r.kind = 'comment') as reports
      from dediko.community_comments c join dediko.community_posts p on c.post_id = p.id where not c.deleted and not p.deleted
    ) items order by reports desc, "createdAt" desc limit 200`;
  }
  return { list, detail, mutate, moderate, moderationList };
}
