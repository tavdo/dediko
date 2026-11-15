-- Dedicated Dediko application schema; managed Neon Auth tables remain untouched.
create schema if not exists dediko;
revoke all on schema dediko from public;
create table if not exists dediko.accounts (
  user_id text primary key,
  document jsonb,
  revision integer not null default 0,
  write_id uuid,
  timezone text not null default 'Asia/Tbilisi',
  updated_at timestamptz not null default now()
);
create table if not exists dediko.push_subscriptions (
  endpoint_hash text primary key,
  user_id text not null references dediko.accounts(user_id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  last_test_at timestamptz
);
create index if not exists push_user_idx on dediko.push_subscriptions(user_id);
create table if not exists dediko.schedules (
  user_id text not null references dediko.accounts(user_id) on delete cascade,
  reminder_id text not null,
  signature text not null,
  job_key uuid not null,
  next_at timestamptz not null,
  queued boolean not null default false,
  primary key (user_id, reminder_id)
);
create index if not exists schedules_outbox_idx on dediko.schedules(next_at) where not queued;
create table if not exists dediko.push_deliveries (
  endpoint_hash text not null references dediko.push_subscriptions(endpoint_hash) on delete cascade,
  occurrence text not null,
  status text not null check(status in ('sending', 'sent')),
  lease_until timestamptz not null,
  created_at timestamptz not null default now(),
  primary key(endpoint_hash, occurrence)
);
create index if not exists delivery_cleanup_idx on dediko.push_deliveries(created_at);
create table if not exists dediko.admins (
  user_id text primary key,
  granted_at timestamptz not null default now()
);
create table if not exists dediko.lesson_overrides (
  id text primary key,
  lesson jsonb not null,
  published boolean not null default false,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now()
);
create table if not exists dediko.community_posts (
  id uuid primary key,
  user_id text not null,
  author text not null check (length(author) between 2 and 40),
  title text not null check (length(title) between 5 and 120),
  body text not null check (length(body) <= 4000),
  type text not null check (type in ('question', 'experience')),
  topic text not null check (topic in ('pregnancy', 'motherhood', 'baby', 'wellbeing', 'other')),
  comments_created integer not null default 0 check (comments_created between 0 and 300),
  hidden boolean not null default false,
  deleted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists community_feed_idx on dediko.community_posts(created_at desc, id desc) where not hidden and not deleted;
create table if not exists dediko.community_comments (
  id uuid primary key,
  post_id uuid not null references dediko.community_posts(id) on delete cascade,
  user_id text not null,
  author text not null check (length(author) between 2 and 40),
  body text not null check (length(body) <= 1500),
  hidden boolean not null default false,
  deleted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists community_comments_post_idx on dediko.community_comments(post_id, created_at, id);
create table if not exists dediko.community_reports (
  user_id text not null,
  kind text not null check (kind in ('post', 'comment')),
  target_id uuid not null,
  reason text not null check (reason in ('medical', 'abuse', 'privacy', 'spam', 'other')),
  created_at timestamptz not null default now(),
  primary key (target_id, kind, user_id)
);
create table if not exists dediko.community_limits (
  user_id text not null,
  kind text not null check (kind in ('post', 'comment', 'report')),
  started_at timestamptz not null default now(),
  used integer not null,
  primary key (user_id, kind)
);
revoke all on all tables in schema dediko from public;
