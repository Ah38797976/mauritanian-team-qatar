-- APPLIED to staging (ddrbrskusreoktqabkvi) on 2026-11-04.   0009: public player photos (opt-in per team).
-- - Bucket player-photos becomes publicly readable by URL. Object names are random UUID paths and are only
--   disclosed by rpc_public_site when site_settings.sections.photos = true (default false).
-- - rpc_save_site accepts the optional boolean sections.photos; rpc_public_site adds "photo" (storage path of the
--   player's primary photo) to each public player only when that switch is on.
-- - Upload/delete policies (authenticated, 'players' permission) are unchanged.
begin;

update storage.buckets set public = true where id = 'player-photos';

create or replace function public.rpc_save_site(s jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); v_about text; v_ann text; v_sec jsonb := '{}'::jsonb; k text;
begin
  if t is null or not app.has_perm(t, 'settings') then return app.deny(); end if;
  s := coalesce(s, '{}'::jsonb);
  if jsonb_typeof(s) is distinct from 'object' then return 'بيانات غير صالحة'; end if;
  v_about := btrim(coalesce(s->>'about', '')); v_ann := btrim(coalesce(s->>'announcement', ''));
  if char_length(v_about) > 500 or char_length(v_ann) > 200 then return 'أحد الحقول أطول من الحد المسموح'; end if;
  foreach k in array array['players', 'staff', 'matches', 'stats'] loop
    if jsonb_typeof(s->'sections'->k) is distinct from 'boolean' then return 'إعداد القسم غير صالح'; end if;
    v_sec := v_sec || jsonb_build_object(k, (s->'sections'->>k)::boolean);
  end loop;
  if s->'sections' ? 'photos' then
    if jsonb_typeof(s->'sections'->'photos') is distinct from 'boolean' then return 'إعداد القسم غير صالح'; end if;
    v_sec := v_sec || jsonb_build_object('photos', (s->'sections'->>'photos')::boolean);
  else
    v_sec := v_sec || jsonb_build_object('photos', false);
  end if;
  insert into public.site_settings(team_id, about, announcement, sections, updated_at)
    values (t, v_about, v_ann, v_sec, now())
    on conflict (team_id) do update set about = excluded.about, announcement = excluded.announcement, sections = excluded.sections, updated_at = now();
  perform app.log(t, 'تحديث إعدادات الموقع العام', '');
  return '';
end $$;

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
    res := res || jsonb_build_object('players', coalesce((
      select jsonb_agg(jsonb_build_object('name', p.name, 'num', p.shirt_number,
        'pos', case p.position when 'gk' then 'حارس' when 'def' then 'مدافع' when 'mid' then 'وسط' else 'مهاجم' end,
        'photo', case when ph then (select ph2.storage_path from public.player_photos ph2 where ph2.player_id = p.id
                                    order by ph2.is_primary desc, ph2.created_at desc limit 1) end)
        order by p.shirt_number, p.name)
      from public.players p where p.team_id = t.id and p.status <> 'unregistered'), '[]'::jsonb));
  end if;
  if coalesce((sec->>'staff')::boolean, false) then
    res := res || jsonb_build_object('staff', coalesce((
      select jsonb_agg(jsonb_build_object('name', s.name, 'role', s.title,
        'kind', case s.kind when 'technical' then 'فني' else 'إداري' end) order by s.name)
      from public.staff_members s where s.team_id = t.id), '[]'::jsonb));
  end if;
  if coalesce((sec->>'matches')::boolean, false) then
    res := res || jsonb_build_object('matches', coalesce((
      select jsonb_agg(jsonb_build_object('opp', m.opponent, 'date', m.match_date, 'home', m.is_home, 'played', m.played,
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
