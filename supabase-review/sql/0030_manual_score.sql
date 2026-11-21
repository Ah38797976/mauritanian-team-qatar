-- 0030: إدخال النتيجة النهائية يدويًا (أهدافنا وأهداف الخصم) لكل مباراة.
-- APPLIED على mauritanian-team-qatar-staging (2026-11-21) — وهو المشروع الذي يعمل عليه الموقع. يحتاج 0028 قبله.
-- - عمود matches.us_goals (اختياري): إن كان null تبقى نتيجتنا تُحسب من عدد أحداث «هدف» كما كانت، وإن حُدّد يُعتمد هو.
--   هذا يسمح بتسجيل النتيجة دون معرفة الهدّافين، ولا يغيّر جدول الهدّافين (يبقى من الأحداث).
-- - دالة rpc_set_score جديدة (rpc_set_result القديمة لا تُمسّ).
-- - rpc_public_site: سطر 'us' فقط يتغيّر (coalesce)؛ باقي النص مطابق لتعريف 0028 — قارنه بالتعريف الحي قبل التطبيق.
begin;

alter table public.matches add column us_goals smallint check (us_goals between 0 and 99);

create or replace function public.rpc_set_score(p_match uuid, p_us int, p_them int, p_played boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); mt public.matches;
begin
  if t is null then return app.deny(); end if;
  select * into mt from public.matches x where x.id = p_match and x.team_id = t;
  if not found then return 'المباراة غير موجودة'; end if;
  if not app.has_perm(t, 'stats', mt.id) then return app.deny(); end if;
  if p_us is not null and (p_us < 0 or p_us > 99) then return 'أهدافنا بين 0 و99'; end if;
  if p_them is null or p_them < 0 or p_them > 99 then return 'أهداف الخصم بين 0 و99'; end if;
  if p_played is null then return 'حالة المباراة غير صالحة'; end if;
  update public.matches set us_goals = p_us, opp_goals = p_them, played = p_played where id = mt.id;
  perform app.log(t, 'تحديث نتيجة', format('%s: %s، نحن %s — الخصم %s', mt.opponent, case when p_played then 'انتهت' else 'لم تُلعب' end, coalesce(p_us::text, 'من الأحداث'), p_them));
  return '';
end $$;

revoke all on function public.rpc_set_score(uuid, int, int, boolean) from public, anon, authenticated;
grant execute on function public.rpc_set_score(uuid, int, int, boolean) to authenticated;

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
        'us', case when m.played then coalesce(m.us_goals::bigint, (select count(*) from public.match_events e where e.match_id = m.id and e.event_type = 'goal')) end,
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
