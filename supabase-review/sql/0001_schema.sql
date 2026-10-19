-- ============================================================================
-- REVIEW ONLY — DO NOT EXECUTE.  لا يُنفَّذ قبل موافقة صريحة من المالك.
-- Task 07 / 0001: tables, enums, constraints, indexes for ONE team database.
-- Target: a separate STAGING Supabase project first (never production first).
-- Staging holds fake data only. No real personal data before explicit approval.
-- ============================================================================
begin;

create schema if not exists app;  -- private helpers; MUST NOT be in the Data API "exposed schemas" list

-- ---------- enums (English codes; Arabic labels live in the client label map) ----------
create type public.app_role        as enum ('founder','admin','secretary','coach','officer','treasurer');
create type public.player_position as enum ('gk','def','mid','fwd');                       -- حارس/مدافع/وسط/مهاجم
create type public.player_status   as enum ('active','injured','suspended','unregistered'); -- نشط/مصاب/موقوف/غير مسجّل
create type public.staff_kind      as enum ('technical','administrative');                 -- فني/إداري
create type public.event_type      as enum ('goal','yellow','red');                        -- هدف/صفراء/حمراء

-- ---------- team & membership ----------
create table public.teams (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(btrim(name)) between 1 and 80),
  city         text not null default '' check (char_length(city) <= 80),
  color        text not null default '#0b6b3a' check (color ~ '^#[0-9a-fA-F]{6}$'),
  founded_year smallint check (founded_year between 1900 and 2100),
  created_at   timestamptz not null default now()
);

create table public.team_members (
  user_id      uuid not null references auth.users(id) on delete cascade,
  team_id      uuid not null references public.teams(id) on delete cascade,
  role         public.app_role not null,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  primary key (user_id, team_id)
);
create unique index team_members_one_founder on public.team_members(team_id) where role = 'founder' and active;
create index team_members_team_idx on public.team_members(team_id);

create table public.permission_catalog (
  code     text primary key,
  label_ar text not null
);

create table public.role_permissions (
  team_id    uuid not null references public.teams(id) on delete cascade,
  role       public.app_role not null,
  permission text not null references public.permission_catalog(code),
  primary key (team_id, role, permission),
  check (role <> 'founder'),  -- the founder is implicit, never table-driven
  check (not (role = 'officer' and permission in ('staff','viewStaff','contactStaff','contactStaffTeam'))) -- hard rule from Task 06
);

-- ---------- players (privacy tiers are separated by table) ----------
create table public.players (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams(id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  shirt_number smallint not null check (shirt_number between 1 and 99),
  position     public.player_position not null,
  city         text not null default '' check (char_length(city) <= 60),
  status       public.player_status not null default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (team_id, id)
);
create unique index players_shirt_unique on public.players(team_id, shirt_number) where status <> 'unregistered';

create table public.player_contacts (  -- phone/email: only 'contactPlayers' may read or write
  player_id uuid primary key,
  team_id   uuid not null,
  phone     text not null default '' check (char_length(phone) <= 30),
  email     text not null default '' check (char_length(email) <= 80),
  foreign key (team_id, player_id) references public.players(team_id, id) on delete cascade
);

create table public.player_photos (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null,
  player_id    uuid not null,
  storage_path text not null unique
               check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp')),
  size_bytes   integer not null check (size_bytes between 1 and 2097152),
  is_primary   boolean not null default false,
  uploaded_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  foreign key (team_id, player_id) references public.players(team_id, id) on delete cascade
);
create unique index player_photos_one_primary on public.player_photos(player_id) where is_primary;

-- ---------- staff ----------
create table public.staff_members (
  id      uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name    text not null check (char_length(btrim(name)) between 1 and 60),
  title   text not null default '' check (char_length(title) <= 40),
  kind    public.staff_kind not null,
  unique (team_id, id)
);
create table public.staff_contacts (  -- phone only (no staff email in any structure)
  staff_id uuid primary key,
  team_id  uuid not null,
  phone    text not null default '' check (char_length(phone) <= 30),
  foreign key (team_id, staff_id) references public.staff_members(team_id, id) on delete cascade
);

-- ---------- lineup, sessions, attendance ----------
create table public.lineups (
  team_id   uuid primary key references public.teams(id) on delete cascade,
  formation text not null default '4-4-2' check (formation ~ '^[0-9](-[0-9]){1,4}$')
);
create table public.lineup_starters (
  team_id   uuid not null,
  player_id uuid not null,
  primary key (team_id, player_id),
  foreign key (team_id) references public.lineups(team_id) on delete cascade,
  foreign key (team_id, player_id) references public.players(team_id, id) on delete cascade
);
create table public.training_sessions (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams(id) on delete cascade,
  title        text not null check (char_length(btrim(title)) between 1 and 80),
  session_date date not null,
  unique (team_id, id)
);
create table public.attendance (
  team_id     uuid not null,
  session_id  uuid not null,
  player_id   uuid not null,
  present     boolean not null,
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  primary key (session_id, player_id),
  foreign key (team_id, session_id) references public.training_sessions(team_id, id) on delete cascade,
  foreign key (team_id, player_id)  references public.players(team_id, id) on delete cascade
);

-- ---------- matches, participants, events (our goals are DERIVED from goal events) ----------
create table public.matches (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams(id) on delete cascade,
  opponent   text not null check (char_length(btrim(opponent)) between 1 and 80),
  match_date date not null,
  is_home    boolean not null,
  played     boolean not null default false,
  opp_goals  smallint not null default 0 check (opp_goals between 0 and 99),
  officer_id uuid not null,
  unique (team_id, id),
  foreign key (officer_id, team_id) references public.team_members(user_id, team_id)
);
create index matches_officer_idx on public.matches(officer_id);

create table public.match_players (
  team_id   uuid not null,
  match_id  uuid not null,
  player_id uuid not null,
  primary key (match_id, player_id),
  foreign key (team_id, match_id)  references public.matches(team_id, id) on delete cascade,
  foreign key (team_id, player_id) references public.players(team_id, id) on delete restrict -- history is never silently lost
);
create table public.match_events (
  id         bigint generated always as identity primary key,
  team_id    uuid not null,
  match_id   uuid not null,
  player_id  uuid not null,
  event_type public.event_type not null,
  minute     smallint not null check (minute between 1 and 130),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (match_id, player_id) references public.match_players(match_id, player_id) on delete cascade
);
create index match_events_match_idx on public.match_events(match_id);

-- ---------- audit log: append-only, never stores contact values ----------
create table public.audit_log (
  id         bigint generated always as identity primary key,
  team_id    uuid not null references public.teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  actor_id   uuid,
  actor_name text not null,
  actor_role public.app_role,
  action     text not null check (char_length(action) <= 80),
  detail     text not null default '' check (char_length(detail) <= 300)
);
create index audit_log_team_time_idx on public.audit_log(team_id, created_at desc);

create function app.audit_immutable() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'audit_log is append-only'; end $$;
create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function app.audit_immutable();

commit;
