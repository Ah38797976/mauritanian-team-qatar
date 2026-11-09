-- 0020: ربط اشتراكات الإشعارات بالأشخاص (لاعب / عضو إدارة) لمعرفة من فعّل ومن لم يفعّل.
-- NOT APPLIED. يُطبَّق على staging فقط بعد موافقة صريحة. يعتمد على 0019.
-- - لكل لاعب وعضو إدارة «رمز تفعيل» عشوائي من 8 خانات يعطيه المسؤول للشخص؛ يدخله الشخص في صندوق التنبيهات (أو يصله برابط) فيُربط جهازه باسمه.
-- - الاشتراك بلا رمز يبقى مجهولًا كما هو. الرمز لا يمنح أي صلاحية سوى ربط الجهاز باسم صاحبه.
-- - القائمة (الأسماء + الرموز + الحالة) تقرؤها صلاحية 'settings' فقط عبر rpc_push_roster.
create table public.push_invites (
  code      text primary key check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  team_id   uuid not null references public.teams(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  member_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((player_id is not null)::int + (member_id is not null)::int = 1)
);
create unique index push_invites_player_uq on public.push_invites(player_id) where player_id is not null;
create unique index push_invites_member_uq on public.push_invites(member_id) where member_id is not null;
alter table public.push_invites enable row level security;
revoke all on public.push_invites from anon, authenticated;

alter table public.push_subscriptions
  add column player_id uuid references public.players(id) on delete set null,
  add column member_id uuid references auth.users(id) on delete set null;

create or replace function app.push_code() returns text language plpgsql volatile set search_path = '' as $$
declare a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; r text := ''; i int;
begin for i in 1..8 loop r := r || substr(a, 1 + floor(random() * 32)::int, 1); end loop; return r; end $$;

-- rpc_push_subscribe: نفس 0019 مع رمز اختياري p->>'code' يربط الجهاز بصاحبه (رمز غير صالح يُتجاهَل ويبقى الاشتراك مجهولًا)
create or replace function public.rpc_push_subscribe(p jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare t public.teams; e text; k1 text; k2 text; c text; inv public.push_invites;
begin
  if jsonb_typeof(p) is distinct from 'object' then return 'بيانات غير صالحة'; end if;
  e := p->>'endpoint'; k1 := p->>'p256dh'; k2 := p->>'auth'; c := upper(btrim(coalesce(p->>'code', '')));
  if e is null or k1 is null or k2 is null then return 'بيانات غير صالحة'; end if;
  if e !~ '^https://(fcm\.googleapis\.com|[a-z0-9.-]+\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)/' then return 'خدمة الإشعارات غير مدعومة'; end if;
  if k1 !~ '^[A-Za-z0-9_-]{20,200}$' or k2 !~ '^[A-Za-z0-9_-]{8,100}$' then return 'بيانات غير صالحة'; end if;
  select * into t from public.teams order by created_at limit 1;
  if not found then return 'تعذّر الاشتراك الآن'; end if;
  if (select count(*) from public.push_subscriptions) >= 3000 and not exists (select 1 from public.push_subscriptions where endpoint = e) then return 'تعذّر الاشتراك الآن'; end if;
  if c ~ '^[A-HJ-NP-Z2-9]{8}$' then select * into inv from public.push_invites where code = c and team_id = t.id; end if;
  insert into public.push_subscriptions(team_id, endpoint, p256dh, auth, player_id, member_id) values (t.id, e, k1, k2, inv.player_id, inv.member_id)
    on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, fails = 0,
      player_id = coalesce(excluded.player_id, public.push_subscriptions.player_id), member_id = coalesce(excluded.member_id, public.push_subscriptions.member_id);
  return '';
exception when check_violation then return 'بيانات غير صالحة';
end $$;

-- التحقق من رمز قبل الاشتراك: يرجع اسم صاحبه (لعرض «مرحبًا فلان») أو '' إن لم يصح
create or replace function public.rpc_push_code_name(p_code text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare c text := upper(btrim(coalesce(p_code, '')));
begin
  if c !~ '^[A-HJ-NP-Z2-9]{8}$' then return ''; end if;
  return coalesce((select coalesce(pl.name, m.display_name) from public.push_invites i left join public.players pl on pl.id = i.player_id left join public.team_members m on m.user_id = i.member_id and m.team_id = i.team_id where i.code = c), '');
end $$;

-- قائمة الأشخاص مع حالة التفعيل والرمز (تُنشئ الرموز الناقصة تلقائيًا)
create or replace function public.rpc_push_roster() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); r record;
begin
  if t is null or not app.has_perm(t, 'settings') then return null; end if;
  for r in select id from public.players where team_id = t and status <> 'unregistered' and not exists (select 1 from public.push_invites where player_id = players.id) loop
    insert into public.push_invites(code, team_id, player_id) values (app.push_code(), t, r.id) on conflict do nothing;
  end loop;
  for r in select user_id from public.team_members where team_id = t and active and not exists (select 1 from public.push_invites where member_id = team_members.user_id) loop
    insert into public.push_invites(code, team_id, member_id) values (app.push_code(), t, r.user_id) on conflict do nothing;
  end loop;
  return jsonb_build_object('people', coalesce((select jsonb_agg(x order by x->>'kind' desc, x->>'name') from (
      select jsonb_build_object('kind', 'player', 'name', pl.name, 'code', i.code,
               'devices', (select count(*) from public.push_subscriptions s where s.player_id = pl.id)) x
        from public.players pl join public.push_invites i on i.player_id = pl.id where pl.team_id = t and pl.status <> 'unregistered'
      union all
      select jsonb_build_object('kind', 'member', 'name', m.display_name, 'code', i.code,
               'devices', (select count(*) from public.push_subscriptions s where s.member_id = m.user_id))
        from public.team_members m join public.push_invites i on i.member_id = m.user_id where m.team_id = t and m.active
    ) y), '[]'::jsonb));
end $$;

revoke all on function app.push_code(), public.rpc_push_code_name(text), public.rpc_push_roster() from public, anon, authenticated;
revoke all on function public.rpc_push_subscribe(jsonb) from public, anon, authenticated;
grant execute on function public.rpc_push_subscribe(jsonb), public.rpc_push_code_name(text) to anon, authenticated;
grant execute on function public.rpc_push_roster() to authenticated;
