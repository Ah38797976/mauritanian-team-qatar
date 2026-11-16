-- 0028: شعار/علم لكل فريق منافس، يُرفع من لوحة التحكم ويظهر في المباريات بالموقع العام.
-- APPLIED على mauritanian-team-qatar-staging فقط (2026-11-17). لم يُطبَّق على الإنتاج بعد — يحتاج موافقة صريحة (ويحتاج 0026 و0027 قبله).
-- يعتمد على 0027. تغيير إضافي فقط: جدول جديد + 3 دوال RPC + مفتاح 'logo' واحد في مباريات rpc_public_site.
-- - الشعار مرتبط باسم الخصم (بعد توحيد المسافات والحروف الإنجليزية الصغيرة)، فيُرفع مرة واحدة ويظهر في كل مباريات ذلك الفريق.
-- - الجدول بلا وصول مباشر (RLS مفعّل بلا سياسات)؛ الإدارة بصلاحية 'settings' كما في المعرض (0018).
-- - الملفات في bucket player-photos بمسار <team>/<team>/<uuid>.<ext> — المسار نفسه الذي تغطيه سياسات dev_photo_insert/dev_photo_delete (0017)، فلا سياسات تخزين جديدة.
-- - النص مبني على تعريف 0027 لـ rpc_public_site؛ قارنه بالتعريف الحي قبل التطبيق.
begin;

create table public.opponent_logos (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  name_key     text not null check (char_length(name_key) between 1 and 80),
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  created_at   timestamptz not null default now(),
  unique (team_id, name_key)
);
alter table public.opponent_logos enable row level security;
revoke all on public.opponent_logos from anon, authenticated;
comment on table public.opponent_logos is 'Opponent team flags/logos. No direct access: rpc_get_opponent_logos / rpc_set_opponent_logo / rpc_delete_opponent_logo; exposed publicly only as matches[].logo in rpc_public_site.';

create or replace function public.rpc_get_opponent_logos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t uuid := app.my_team();
begin
  if t is null or not app.has_perm(t, 'settings') then return null; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('name', name, 'key', name_key, 'path', storage_path) order by name) from public.opponent_logos where team_id = t), '[]'::jsonb);
end $$;

create or replace function public.rpc_set_opponent_logo(p_name text, p_path text, p_type text, p_size integer) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); n text := btrim(coalesce(p_name, '')); k text;
begin
  if t is null or not app.has_perm(t, 'settings') then return app.deny(); end if;
  if n = '' or char_length(n) > 80 then return 'اسم الفريق غير صالح'; end if;
  k := lower(regexp_replace(n, '\s+', ' ', 'g'));
  if p_path is null or left(p_path, 74) <> t::text || '/' || t::text || '/' then return 'مسار الصورة غير صالح'; end if;
  if p_type not in ('image/jpeg', 'image/png', 'image/webp') or p_size is null or p_size not between 1 and 2097152 then return 'الصورة غير صالحة (النوع أو الحجم)'; end if;
  if not exists (select 1 from public.opponent_logos where team_id = t and name_key = k)
     and (select count(*) from public.opponent_logos where team_id = t) >= 100 then return 'وصلت إلى الحد الأقصى (100 فريق)'; end if;
  insert into public.opponent_logos(team_id, name, name_key, storage_path) values (t, n, k, p_path)
    on conflict (team_id, name_key) do update set name = excluded.name, storage_path = excluded.storage_path;
  perform app.log(t, 'تحديث شعار فريق منافس', n);
  return '';
exception when unique_violation then return 'الصورة مسجّلة مسبقًا'; when check_violation then return 'الصورة غير صالحة (النوع أو الحجم أو المسار)';
end $$;

create or replace function public.rpc_delete_opponent_logo(p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); k text := lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g')); n int;
begin
  if t is null or not app.has_perm(t, 'settings') then return app.deny(); end if;
  delete from public.opponent_logos where team_id = t and name_key = k;
  get diagnostics n = row_count;
  if n = 0 then return 'الشعار غير موجود'; end if;
  perform app.log(t, 'حذف شعار فريق منافس', btrim(p_name));
  return '';
end $$;

revoke all on function public.rpc_get_opponent_logos(), public.rpc_set_opponent_logo(text, text, text, integer), public.rpc_delete_opponent_logo(text) from public, anon, authenticated;
grant execute on function public.rpc_get_opponent_logos(), public.rpc_set_opponent_logo(text, text, text, integer), public.rpc_delete_opponent_logo(text) to authenticated;

create or replace function public.rpc_public_site() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.teams; st public.site_settings; sec jsonb; res jsonb; ph boolean;
begin
  select * into t from public.teams order by created_at limit 1;
  if not found then return null; end if;
  select * into st from public.site_settings where team_id = t.id;
  sec := coalesce(st.sections, '{"players":false,"staff":false,"matches":false,"stats":false}'::jsonb);
  ph := coalesce((sec->>'photos')::boolean, false);
  res := jsonb_build_object('team', jsonb_build_object('name', t.name, 'city', t.city, 'color', t.color),
    'about', coalesce(st.about, ''), 'announcement', coalesce(st.announcement, ''), 'sections', sec);
  if coalesce((sec->>'players')::boolean, false) then
    res := res || jsonb_build_object(
      'players', coalesce((
        select jsonb_agg(jsonb_build_object('name', p.name, 'num', p.shirt_number,
          'pos', case p.position when 'gk' then 'حارس' when 'def' then 'مدافع' when 'mid' then 'وسط' else 'مهاجم' end,
          'photo', case when ph then (select ph2.storage_path from public.player_photos ph2 where ph2.player_id = p.id
                                      order by ph2.is_primary desc, ph2.created_at desc limit 1) end,
          'st',   exists (select 1 from public.lineup_starters ls where ls.player_id = p.id and ls.team_id = t.id),
          'cap',  coalesce((select ls.is_captain from public.lineup_starters ls where ls.player_id = p.id and ls.team_id = t.id), false),
          'slot', (select ls.slot from public.lineup_starters ls where ls.player_id = p.id and ls.team_id = t.id))
          order by p.shirt_number, p.name)
        from public.players p where p.team_id = t.id and p.status <> 'unregistered'), '[]'::jsonb),
      'formation', (select l.formation from public.lineups l where l.team_id = t.id));
  end if;
  if coalesce((sec->>'staff')::boolean, false) then
    res := res || jsonb_build_object('staff', coalesce((
      select jsonb_agg(jsonb_build_object('name', s.name, 'role', s.title,
        'kind', case s.kind when 'technical' then 'فني' else 'إداري' end,
        'photo', case when ph then (select sp.storage_path from public.staff_photos sp where sp.staff_id = s.id limit 1) end)
        order by s.name)
      from public.staff_members s where s.team_id = t.id), '[]'::jsonb));
  end if;
  if coalesce((sec->>'matches')::boolean, false) then
    res := res || jsonb_build_object('matches', coalesce((
      select jsonb_agg(jsonb_build_object('opp', m.opponent, 'date', m.match_date, 'home', m.is_home, 'played', m.played,
        'time', to_char(m.kickoff, 'HH24:MI'), 'venue', m.venue, 'map', m.map_url,
        'logo', (select ol.storage_path from public.opponent_logos ol where ol.team_id = t.id and ol.name_key = lower(regexp_replace(btrim(m.opponent), '\s+', ' ', 'g'))),
        'us', case when m.played then (select count(*) from public.match_events e where e.match_id = m.id and e.event_type = 'goal') end,
        'them', case when m.played then m.opp_goals end) order by m.match_date)
      from public.matches m where m.team_id = t.id), '[]'::jsonb));
  end if;
  if coalesce((sec->>'stats')::boolean, false) then
    res := res || jsonb_build_object('scorers', coalesce((
      select jsonb_agg(jsonb_build_object('name', p.name, 'goals', g.n,
        'apps', (select count(*) from public.match_players mp join public.matches m2 on m2.id = mp.match_id
                 where mp.player_id = p.id and m2.played)) order by g.n desc, p.name)
      from public.players p
      join (select e.player_id, count(*) n from public.match_events e join public.matches m on m.id = e.match_id
            where e.team_id = t.id and e.event_type = 'goal' and m.played group by e.player_id) g on g.player_id = p.id
      where p.team_id = t.id), '[]'::jsonb));
  end if;
  return res;
end $$;
commit;
