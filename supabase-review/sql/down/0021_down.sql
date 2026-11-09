-- 0021 down: restores the previous rpc_save_match (0004) and rpc_public_site (0013), then drops the two columns (kick-off times and venues are deleted).
begin;
create or replace function public.rpc_save_match(m jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); v_id uuid; v_opp text; v_date date; v_home boolean; v_off uuid; found_m boolean := false;
begin
  if t is null or not app.has_perm(t, 'matches') then return app.deny(); end if;
  m := coalesce(m, '{}'::jsonb);
  v_opp := btrim(coalesce(m->>'opp', ''));
  if length(v_opp) > 80 then return 'اسم الخصم أطول من الحد المسموح'; end if;
  begin v_date := (m->>'date')::date; exception when others then v_date := null; end;
  if v_opp = '' or v_date is null or (m->>'date') !~ '^\d{4}-\d{2}-\d{2}$' then return 'الخصم والتاريخ مطلوبان'; end if;
  if jsonb_typeof(m->'home') is distinct from 'boolean' then return 'الملعب غير صالح'; end if;
  v_home := (m->>'home')::boolean;
  v_off := app.try_uuid(m->>'officer');
  if v_off is null or not exists (select 1 from public.team_members tm
        where tm.user_id = v_off and tm.team_id = t and tm.active and tm.role in ('officer', 'secretary')) then
    return 'مسؤول المباراة غير صالح'; end if;
  if m->>'id' is not null then
    v_id := app.try_uuid(m->>'id');
    select true into found_m from public.matches x where x.id = v_id and x.team_id = t;
    if v_id is null or not coalesce(found_m, false) then return 'المباراة غير موجودة'; end if;
    update public.matches set opponent = v_opp, match_date = v_date, is_home = v_home, officer_id = v_off where id = v_id;
  else
    insert into public.matches(team_id, opponent, match_date, is_home, officer_id) values (t, v_opp, v_date, v_home, v_off);
  end if;
  perform app.log(t, 'حفظ مباراة', v_opp);
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
alter table public.matches drop column if exists kickoff, drop column if exists venue;
commit;
