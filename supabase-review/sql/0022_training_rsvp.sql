-- 0022: next-training details (time, venue, map link) + player RSVP via personal code (needs 0020 push_invites) + admin view of responses.
-- Additive. NOT applied. Depends on 0020 (push_invites, app.push_code). Based on the LIVE rpc_save_session (permission 'attendance').
begin;

alter table public.training_sessions
  add column if not exists start_time time,
  add column if not exists venue text check (venue is null or char_length(venue) between 1 and 100),
  add column if not exists map_url text check (map_url is null or (char_length(map_url) <= 300 and map_url ~ '^https://[^[:space:]<>"'']+$'));

create table if not exists public.training_rsvp (
  session_id uuid not null,
  player_id  uuid not null references public.players(id) on delete cascade,
  team_id    uuid not null references public.teams(id) on delete cascade,
  status     text not null check (status in ('yes', 'no')),
  updated_at timestamptz not null default now(),
  primary key (session_id, player_id),
  foreign key (team_id, session_id) references public.training_sessions(team_id, id) on delete cascade
);
alter table public.training_rsvp enable row level security;
revoke all on public.training_rsvp from public, anon, authenticated;

-- حفظ/تعديل حصة: العنوان والتاريخ كما كانا + وقت/ملعب/رابط خريطة اختيارية (غياب المفتاح يُبقي القيمة، والفارغ يمسحها)
create or replace function public.rpc_save_session(s jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); v_title text; v_date date; v_id uuid; v_time time; v_venue text; v_map text; found_s boolean := false;
begin
  if t is null or not app.has_perm(t, 'attendance') then return app.deny(); end if;
  if s is null or jsonb_typeof(s) is distinct from 'object' then return 'بيانات غير صالحة'; end if;
  v_title := btrim(coalesce(s->>'title', ''));
  if char_length(v_title) not between 1 and 80 then return 'عنوان الحصة مطلوب (حتى 80 حرفًا)'; end if;
  if coalesce(s->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then return 'تاريخ غير صالح'; end if;
  begin v_date := (s->>'date')::date; exception when others then return 'تاريخ غير صالح'; end;
  if v_date < current_date - 1095 or v_date > current_date + 365 then return 'التاريخ خارج النطاق المسموح'; end if;
  if s ? 'time' then
    if btrim(coalesce(s->>'time', '')) = '' then v_time := null;
    elsif (s->>'time') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then v_time := (s->>'time')::time;
    else return 'وقت التدريب غير صالح'; end if;
  end if;
  if s ? 'venue' then
    v_venue := nullif(btrim(coalesce(s->>'venue', '')), '');
    if char_length(coalesce(v_venue, '')) > 100 then return 'اسم الملعب أطول من الحد المسموح'; end if;
  end if;
  if s ? 'map' then
    v_map := nullif(btrim(coalesce(s->>'map', '')), '');
    if v_map is not null and (char_length(v_map) > 300 or v_map !~ '^https://[^[:space:]<>"'']+$') then return 'رابط الخريطة يجب أن يبدأ بـ https://'; end if;
  end if;
  if s->>'id' is not null then
    v_id := app.try_uuid(s->>'id');
    select true into found_s from public.training_sessions x where x.id = v_id and x.team_id = t;
    if v_id is null or not coalesce(found_s, false) then return 'الحصة غير موجودة'; end if;
    update public.training_sessions set title = v_title, session_date = v_date,
      start_time = case when s ? 'time' then v_time else start_time end,
      venue = case when s ? 'venue' then v_venue else venue end,
      map_url = case when s ? 'map' then v_map else map_url end where id = v_id;
  else
    insert into public.training_sessions(team_id, title, session_date, start_time, venue, map_url) values (t, v_title, v_date, v_time, v_venue, v_map);
  end if;
  perform app.log(t, 'حفظ حصة تدريب', format('%s — %s', v_title, v_date));
  return '';
end $$;

-- الموقع العام (بدون تسجيل): التدريب القادم + أعداد الردود، وإن أُرسل رمز شخصي صحيح فرد صاحبه
create or replace function public.rpc_public_training(p_code text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.teams; x public.training_sessions; c text := upper(btrim(coalesce(p_code, ''))); pid uuid; pname text; me jsonb := null;
begin
  select * into t from public.teams order by created_at limit 1;
  if not found then return null; end if;
  select * into x from public.training_sessions s where s.team_id = t.id and s.session_date >= (now() at time zone 'Asia/Qatar')::date
    order by s.session_date, s.start_time nulls last limit 1;
  if not found then return null; end if;
  if c ~ '^[A-HJ-NP-Z2-9]{8}$' then
    select i.player_id, pl.name into pid, pname from public.push_invites i join public.players pl on pl.id = i.player_id
      where i.code = c and i.team_id = t.id and pl.status <> 'unregistered';
    if pid is not null then
      me := jsonb_build_object('name', pname, 'status', (select r.status from public.training_rsvp r where r.session_id = x.id and r.player_id = pid));
    end if;
  end if;
  return jsonb_build_object('id', x.id, 'title', x.title, 'date', x.session_date, 'time', to_char(x.start_time, 'HH24:MI'), 'venue', x.venue, 'map', x.map_url,
    'yes', (select count(*) from public.training_rsvp r where r.session_id = x.id and r.status = 'yes'),
    'no',  (select count(*) from public.training_rsvp r where r.session_id = x.id and r.status = 'no'),
    'total', (select count(*) from public.players pl where pl.team_id = t.id and pl.status <> 'unregistered'),
    'me', me);
end $$;

-- تأكيد/اعتذار اللاعب عن التدريب القادم برمزه الشخصي
create or replace function public.rpc_training_rsvp(p jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare c text; sid uuid; st text; pid uuid; tid uuid; x public.training_sessions;
begin
  if p is null or jsonb_typeof(p) is distinct from 'object' then return 'بيانات غير صالحة'; end if;
  c := upper(btrim(coalesce(p->>'code', ''))); st := p->>'status'; sid := app.try_uuid(p->>'session');
  if c !~ '^[A-HJ-NP-Z2-9]{8}$' or st not in ('yes', 'no') or sid is null then return 'بيانات غير صالحة'; end if;
  select i.player_id, i.team_id into pid, tid from public.push_invites i join public.players pl on pl.id = i.player_id
    where i.code = c and pl.status <> 'unregistered';
  if pid is null then return 'الرمز غير صحيح'; end if;
  select * into x from public.training_sessions s where s.id = sid and s.team_id = tid;
  if not found or x.session_date < (now() at time zone 'Asia/Qatar')::date then return 'التدريب غير متاح للرد'; end if;
  insert into public.training_rsvp(session_id, player_id, team_id, status) values (sid, pid, tid, st)
    on conflict (session_id, player_id) do update set status = excluded.status, updated_at = now();
  return '';
end $$;

-- للإدارة: ردود لاعبي حصة معيّنة (صلاحية الحضور)
create or replace function public.rpc_training_responses(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t uuid := app.my_team();
begin
  if t is null or not app.has_perm(t, 'attendance') then return null; end if;
  if not exists (select 1 from public.training_sessions where id = p_session and team_id = t) then return null; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', pl.id, 'name', pl.name, 'status', r.status) order by pl.name)
    from public.players pl left join public.training_rsvp r on r.player_id = pl.id and r.session_id = p_session
    where pl.team_id = t and pl.status <> 'unregistered'), '[]'::jsonb);
end $$;

revoke all on function public.rpc_save_session(jsonb), public.rpc_public_training(text), public.rpc_training_rsvp(jsonb), public.rpc_training_responses(uuid) from public, anon, authenticated;
grant execute on function public.rpc_save_session(jsonb), public.rpc_training_responses(uuid) to authenticated;
grant execute on function public.rpc_public_training(text), public.rpc_training_rsvp(jsonb) to anon, authenticated;

commit;
