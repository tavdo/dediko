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
create table if not exists dediko.partners (
  id uuid primary key,
  user_id text not null unique,
  name text not null,
  website text not null,
  contact text not null,
  description text not null default '',
  status text not null default 'pending' check(status in ('pending','approved','suspended')),
  note text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists dediko.offers (
  id uuid primary key,
  partner_id uuid not null references dediko.partners(id) on delete cascade,
  content jsonb not null,
  status text not null default 'draft' check(status in ('draft','pending','approved','rejected','paused')),
  revision integer not null default 1,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  published_at timestamptz,
  featured boolean not null default false,
  sponsored boolean not null default false,
  commission_bps integer not null default 0 check(commission_bps between 0 and 5000),
  review_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists offers_partner_idx on dediko.offers(partner_id,created_at desc);
create index if not exists offers_active_idx on dediko.offers(ends_at,starts_at) where status='approved';
create table if not exists dediko.offer_saved (
  user_id text not null,
  offer_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(user_id,offer_id)
);
create table if not exists dediko.offer_preferences (
  user_id text primary key,
  enabled boolean not null default false,
  categories jsonb not null default '[]',
  stage text not null default 'all',
  city text not null default '',
  enabled_at timestamptz not null default now(),
  last_notified timestamptz not null default now(),
  digest_key uuid,
  digest_cutoff timestamptz,
  queued_at timestamptz
);
create table if not exists dediko.offer_events (
  id uuid primary key,
  offer_id uuid not null references dediko.offers(id) on delete cascade,
  kind text not null check(kind in ('view','click','copy')),
  actor text not null,
  commission_bps integer not null default 0,
  day date not null default current_date,
  created_at timestamptz not null default now(),
  unique(offer_id,kind,actor,day)
);
alter table dediko.offer_preferences add column if not exists digest_cutoff timestamptz;
create index if not exists offer_events_offer_idx on dediko.offer_events(offer_id,kind);
create index if not exists offer_events_actor_idx on dediko.offer_events(actor,day);
create table if not exists dediko.offer_sales (
  id uuid primary key,
  partner_id uuid not null references dediko.partners(id) on delete cascade,
  offer_id uuid not null references dediko.offers(id) on delete cascade,
  click_id uuid not null references dediko.offer_events(id) on delete cascade,
  order_hash text not null,
  amount integer not null check(amount>0),
  commission integer not null check(commission>=0),
  status text not null default 'pending' check(status in ('pending','confirmed','rejected','paid')),
  note text not null default '',
  created_at timestamptz not null default now(),
  unique(partner_id,order_hash)
);
create table if not exists dediko.offer_charges (
  id uuid primary key,
  partner_id uuid not null references dediko.partners(id) on delete cascade,
  offer_id uuid not null references dediko.offers(id) on delete cascade,
  revision integer not null,
  amount integer not null check(amount>=0),
  description text not null,
  status text not null default 'pending' check(status in ('pending','paid','void')),
  receipt text not null default '',
  created_at timestamptz not null default now(),
  unique(offer_id,revision)
);
create table if not exists dediko.offer_entitlements (
  user_id text primary key,
  expires_at timestamptz not null,
  note text not null,
  granted_by text not null,
  created_at timestamptz not null default now()
);
create table if not exists dediko.console_users (
  id text primary key check(id='dediko-console-admin'),
  name text not null,
  email text not null unique,
  "emailVerified" boolean not null,
  image text,
  username text not null unique check(username='admin'),
  "displayUsername" text not null,
  "createdAt" timestamptz not null,
  "updatedAt" timestamptz not null
);
create table if not exists dediko.console_accounts (
  id text primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references dediko.console_users(id) on delete cascade,
  password text,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  "createdAt" timestamptz not null,
  "updatedAt" timestamptz not null
);
create index if not exists console_accounts_user_idx on dediko.console_accounts("userId");
create table if not exists dediko.console_sessions (
  id text primary key,
  token text not null unique,
  "userId" text not null references dediko.console_users(id) on delete cascade,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null,
  "updatedAt" timestamptz not null,
  "ipAddress" text,
  "userAgent" text
);
create index if not exists console_sessions_user_idx on dediko.console_sessions("userId");
create table if not exists dediko.console_verifications (
  id text primary key,
  identifier text not null,
  value text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz,
  "updatedAt" timestamptz
);
create index if not exists console_verifications_identifier_idx on dediko.console_verifications(identifier);
create table if not exists dediko.console_rate_limits (
  id text primary key,
  key text not null unique,
  count integer not null,
  "lastRequest" bigint not null
);
revoke all on all tables in schema dediko from public;
