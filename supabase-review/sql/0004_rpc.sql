-- ============================================================================
-- REVIEW ONLY — DO NOT EXECUTE.
-- Task 07 / 0004: RPC functions = the ONLY write path + scoped/computed reads.
-- Contract kept from Store.*: write RPCs return '' on success or an Arabic error text
-- on rejection (no change made). The team is ALWAYS derived from the session
-- (app.my_team()); the client can never choose or spoof team_id / role / actor.
-- All are SECURITY DEFINER with search_path = '' and granted to "authenticated" only.
-- ============================================================================
begin;

-- ======================= READS =======================
create function public.rpc_get_me() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t uuid := app.my_team(); r public.app_role;
begin
  if t is null then return null; end if;
  r := app.my_role(t);
  return jsonb_build_object(
    'team', (select to_jsonb(x) from (select id, name, city, color from public.teams where id = t) x),
    'role', r,
    'display_name', (select tm.display_name from public.team_members tm where tm.user_id = (select auth.uid()) and tm.team_id = t),
    'perms', case when r = 'founder'
                  then (select coalesce(jsonb_agg(c.code order by c.code), '[]'::jsonb) from public.permission_catalog c) || '["roles"]'::jsonb
                  else (select coalesce(jsonb_agg(rp.permission order by rp.permission), '[]'::jsonb)
                        from public.role_permissions rp where rp.team_id = t and rp.role = r) end);
end $$;

-- == Store.roster()/player() scope: full | names-only (treasurer) | own-matches (officer) ==
create function public.rpc_get_roster() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t uuid := app.my_team(); uid uuid := (select auth.uid()); city_ok boolean;
begin
  if t is null then return '[]'::jsonb; end if;
  city_ok := app.has_perm(t, 'viewPlayers');
  if app.can_see_roster(t) then
    return coalesce((select jsonb_agg(
             jsonb_build_object('id', p.id, 'name', p.name, 'num', p.shirt_number, 'pos', p.position, 'status', p.status)
             || case when city_ok then jsonb_build_object('city', p.city) else '{}'::jsonb end
             order by p.shirt_number)
           from public.players p where p.team_id = t and p.status <> 'unregistered'), '[]'::jsonb);
  elsif app.role_has_perm(t, 'viewNames') then
    return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name)
           from public.players p where p.team_id = t and p.status <> 'unregistered'), '[]'::jsonb);
  else  -- match officer: only players of their own matches (+ current starters for their upcoming ones)
    return coalesce((select jsonb_agg(
             jsonb_build_object('id', p.id, 'name', p.name, 'num', p.shirt_number, 'pos', p.position, 'status', p.status)
             order by p.shirt_number)
           from public.players p
           where p.team_id = t and (
             exists (select 1 from public.match_players mp join public.matches m on m.id = mp.match_id
                     where mp.player_id = p.id and m.officer_id = uid)
             or exists (select 1 from public.matches m
                        where m.officer_id = uid and not m.played and m.team_id = t
                          and exists (select 1 from public.lineup_starters s where s.team_id = t and s.player_id = p.id)))), '[]'::jsonb);
  end if;
end $$;

-- == Store.statRows(): scope-limited, ordered goals ↓, apps ↓, name ==
create function public.rpc_get_stat_rows() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t uuid := app.my_team(); uid uuid := (select auth.uid()); v_full boolean;
begin
  if t is null or not app.can_view_matches(t) then return '[]'::jsonb; end if;
  v_full := app.can_see_roster(t);
  return coalesce((
    select jsonb_agg(to_jsonb(r) order by r.goals desc, r.apps desc, r.name)
    from (
      select p.id, p.name, p.shirt_number as num, p.position as pos, p.status,
        (select count(*) from public.match_players mp join public.matches m on m.id = mp.match_id
          where mp.player_id = p.id and m.played and (v_full or m.officer_id = uid)) as apps,
        (select count(*) from public.match_events e join public.matches m on m.id = e.match_id
          where e.player_id = p.id and e.event_type = 'goal'   and m.played and (v_full or m.officer_id = uid)) as goals,
        (select count(*) from public.match_events e join public.matches m on m.id = e.match_id
          where e.player_id = p.id and e.event_type = 'yellow' and m.played and (v_full or m.officer_id = uid)) as yellow,
        (select count(*) from public.match_events e join public.matches m on m.id = e.match_id
          where e.player_id = p.id and e.event_type = 'red'    and m.played and (v_full or m.officer_id = uid)) as red
      from public.players p
      where p.team_id = t
        and (v_full or p.id in (select mp.player_id from public.match_players mp join public.matches m on m.id = mp.match_id
                              where m.officer_id = uid))
    ) r
    where r.status <> 'unregistered' or r.apps + r.goals + r.yellow + r.red > 0), '[]'::jsonb);
end $$;

-- ======================= WRITES: players =======================
create function public.rpc_save_player(p jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  t uuid := app.my_team(); v_id uuid; cur public.players; cur_c public.player_contacts;
  v_name text; v_city text; v_phone text; v_email text; v_num int;
  v_pos public.player_position; v_status public.player_status; canc boolean; cc text := '';
begin
  if t is null or not app.has_perm(t, 'players') then return app.deny(); end if;
  p := coalesce(p, '{}'::jsonb);
  v_name := btrim(coalesce(p->>'name', '')); v_city := btrim(coalesce(p->>'city', ''));
  v_phone := btrim(coalesce(p->>'phone', '')); v_email := btrim(coalesce(p->>'email', ''));
  if length(v_name) > 60 or length(v_city) > 60 or length(v_phone) > 30 or length(v_email) > 80 then
    return 'أحد الحقول أطول من الحد المسموح'; end if;
  if v_name = '' then return 'الاسم مطلوب'; end if;
  begin v_num := (p->>'num')::int; exception when others then v_num := null; end;
  if v_num is null or v_num < 1 or v_num > 99 then return 'رقم القميص بين 1 و99'; end if;
  begin v_pos := (p->>'pos')::public.player_position; exception when others then v_pos := null; end;
  if v_pos is null then return 'المركز غير صالح'; end if;
  begin v_status := (p->>'status')::public.player_status; exception when others then v_status := null; end;
  if v_status is null then return 'الحالة غير صالحة'; end if;
  if p->>'id' is not null then
    v_id := app.try_uuid(p->>'id');
    select * into cur from public.players x where x.id = v_id and x.team_id = t;
    if v_id is null or not found then return 'اللاعب غير موجود'; end if;
    select * into cur_c from public.player_contacts c where c.player_id = v_id;
  end if;
  canc := app.has_perm(t, 'contactPlayers');
  -- phone/email may only be changed by someone allowed to see them
  -- [Phase 2A] S-1: reject the mere PRESENCE of phone/email keys. Comparing to the stored value would let a caller
  -- who may not read contacts brute-force them (same value => accepted, different => denied).
  if not canc and ((p->>'phone') is not null or (p->>'email') is not null) then
    return app.deny(); end if;
  if v_status <> 'unregistered' and exists (
       select 1 from public.players x where x.team_id = t and x.shirt_number = v_num
          and x.status <> 'unregistered' and x.id is distinct from v_id) then
    return 'رقم القميص مستخدم'; end if;

  if v_id is not null then
    update public.players set name = v_name, shirt_number = v_num, position = v_pos, city = v_city, status = v_status
     where id = v_id and team_id = t;
    if v_status = 'unregistered' then delete from public.lineup_starters where team_id = t and player_id = v_id; end if;
    if canc then
      if cur_c.player_id is not null and (cur_c.phone is distinct from v_phone or cur_c.email is distinct from v_email) then
        cc := ' (تغيير بيانات التواصل)'; end if;               -- the VALUES are never logged
      insert into public.player_contacts(player_id, team_id, phone, email) values (v_id, t, v_phone, v_email)
        on conflict (player_id) do update set phone = excluded.phone, email = excluded.email;
    end if;
    perform app.log(t, 'تعديل لاعب', v_name || cc);
  else
    insert into public.players(team_id, name, shirt_number, position, city, status)
      values (t, v_name, v_num, v_pos, v_city, v_status) returning id into v_id;
    insert into public.player_contacts(player_id, team_id, phone, email)
      values (v_id, t, case when canc then v_phone else '' end, case when canc then v_email else '' end);
    perform app.log(t, 'إضافة لاعب', v_name);
  end if;
  return '';
exception when unique_violation then return 'رقم القميص مستخدم';
end $$;

-- hard delete only for a player with no events and no match participations
create function public.rpc_delete_player(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); pl public.players; n_ev int; n_m int; n_att int;
begin
  if t is null or not app.has_perm(t, 'players') then return app.deny(); end if;
  select * into pl from public.players x where x.id = p_id and x.team_id = t;
  if not found then return 'اللاعب غير موجود'; end if;
  select count(*) into n_ev  from public.match_events  e where e.player_id = p_id;
  select count(*) into n_m   from public.match_players mp where mp.player_id = p_id;
  select count(*) into n_att from public.attendance    a where a.player_id = p_id;
  if n_ev > 0 or n_m > 0 then
    return format('لا يمكن حذف لاعب مرتبط بسجلات مباريات (%s حدث، %s مشاركة). استخدم «إلغاء التسجيل» للحفاظ على التاريخ.', n_ev, n_m);
  end if;
  delete from public.players where id = p_id and team_id = t;  -- cascades contacts, attendance, starters, photo rows
  perform app.log(t, 'حذف لاعب', case when n_att > 0 then format('%s (وأُزيلت %s سجلات حضور)', pl.name, n_att) else pl.name end);
  return '';
end $$;

create function public.rpc_unregister_player(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); pl public.players;
begin
  if t is null or not app.has_perm(t, 'players') then return app.deny(); end if;
  select * into pl from public.players x where x.id = p_id and x.team_id = t;
  if not found then return 'اللاعب غير موجود'; end if;
  if pl.status = 'unregistered' then return 'اللاعب غير مسجّل أصلًا'; end if;
  update public.players set status = 'unregistered' where id = p_id;
  delete from public.lineup_starters where team_id = t and player_id = p_id;
  perform app.log(t, 'إلغاء تسجيل لاعب', pl.name || ' (السجل التاريخي محفوظ)');
  return '';
end $$;

-- ======================= WRITES: staff =======================
create function public.rpc_save_staff(s jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  t uuid := app.my_team(); v_id uuid; cur public.staff_members; cur_c public.staff_contacts;
  v_name text; v_title text; v_phone text; v_kind public.staff_kind; canc boolean; cc text := '';
begin
  if t is null or not app.has_perm(t, 'staff') then return app.deny(); end if;
  s := coalesce(s, '{}'::jsonb);
  v_name := btrim(coalesce(s->>'name', '')); v_title := btrim(coalesce(s->>'role', '')); v_phone := btrim(coalesce(s->>'phone', ''));
  if length(v_name) > 60 or length(v_title) > 40 or length(v_phone) > 30 then return 'أحد الحقول أطول من الحد المسموح'; end if;
  if v_name = '' then return 'الاسم مطلوب'; end if;
  begin v_kind := (s->>'kind')::public.staff_kind; exception when others then v_kind := null; end;
  if v_kind is null then return 'النوع غير صالح'; end if;
  if s->>'id' is not null then
    v_id := app.try_uuid(s->>'id');
    select * into cur from public.staff_members x where x.id = v_id and x.team_id = t;
    if v_id is null or not found then return 'عضو الطاقم غير موجود'; end if;
    select * into cur_c from public.staff_contacts c where c.staff_id = v_id;
  end if;
  canc := app.has_perm(t, 'contactStaff');
  -- [Phase 2A] S-1: presence-based rejection (no value comparison => no oracle)
  if not canc and (s->>'phone') is not null then return app.deny(); end if;
  if v_id is not null then
    update public.staff_members set name = v_name, title = v_title, kind = v_kind where id = v_id and team_id = t;
    if canc then
      if cur_c.staff_id is not null and cur_c.phone is distinct from v_phone then cc := ' (تغيير الهاتف)'; end if;
      insert into public.staff_contacts(staff_id, team_id, phone) values (v_id, t, v_phone)
        on conflict (staff_id) do update set phone = excluded.phone;
    end if;
    perform app.log(t, 'تعديل عضو طاقم', v_name || cc);
  else
    insert into public.staff_members(team_id, name, title, kind) values (t, v_name, v_title, v_kind) returning id into v_id;
    insert into public.staff_contacts(staff_id, team_id, phone) values (v_id, t, case when canc then v_phone else '' end);
    perform app.log(t, 'إضافة عضو طاقم', v_name);
  end if;
  return '';
end $$;

create function public.rpc_delete_staff(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); n text;
begin
  if t is null or not app.has_perm(t, 'staff') then return app.deny(); end if;
  select name into n from public.staff_members x where x.id = p_id and x.team_id = t;
  if not found then return 'عضو الطاقم غير موجود'; end if;
  delete from public.staff_members where id = p_id and team_id = t;
  perform app.log(t, 'حذف عضو طاقم', n);
  return '';
end $$;

-- ======================= WRITES: matches =======================
create function public.rpc_save_match(m jsonb) returns text
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

create function public.rpc_add_event(p_match uuid, ev jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); mt public.matches; pl public.players; v_type public.event_type; v_min int; ok boolean;
begin
  if t is null then return app.deny(); end if;
  select * into mt from public.matches x where x.id = p_match and x.team_id = t;
  if not found then return 'المباراة غير موجودة'; end if;
  if not app.has_perm(t, 'stats', mt.id) then return app.deny(); end if;
  ev := coalesce(ev, '{}'::jsonb);
  select * into pl from public.players x where x.id = app.try_uuid(ev->>'pid') and x.team_id = t;
  if not found then return 'اللاعب غير موجود'; end if;
  begin v_type := (ev->>'type')::public.event_type; exception when others then v_type := null; end;
  if v_type is null then return 'نوع الحدث غير صالح'; end if;
  begin v_min := (ev->>'min')::int; exception when others then v_min := null; end;
  if v_min is null or v_min < 1 or v_min > 130 then return 'الدقيقة بين 1 و130'; end if;
  if pl.status = 'unregistered' then return 'لا يمكن تسجيل حدث للاعب غير مسجّل'; end if;
  if app.can_see_roster(t) then ok := true;
  else ok := exists (select 1 from public.match_players mp where mp.match_id = mt.id and mp.player_id = pl.id)
          or (not mt.played and exists (select 1 from public.lineup_starters s where s.team_id = t and s.player_id = pl.id));
  end if;
  if not ok then return 'اللاعب خارج نطاق هذه المباراة'; end if;
  insert into public.match_players(team_id, match_id, player_id) values (t, mt.id, pl.id) on conflict do nothing;
  insert into public.match_events(team_id, match_id, player_id, event_type, minute, created_by)
    values (t, mt.id, pl.id, v_type, v_min, (select auth.uid()));
  perform app.log(t, 'إدخال حدث مباراة',
    format('%s — %s (د %s) ضد %s', case v_type when 'goal' then 'هدف' when 'yellow' then 'بطاقة صفراء' else 'بطاقة حمراء' end, pl.name, v_min, mt.opponent));
  return '';
end $$;

create function public.rpc_set_result(p_match uuid, p_them int, p_played boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); mt public.matches;
begin
  if t is null then return app.deny(); end if;
  select * into mt from public.matches x where x.id = p_match and x.team_id = t;
  if not found then return 'المباراة غير موجودة'; end if;
  if not app.has_perm(t, 'stats', mt.id) then return app.deny(); end if;
  if p_them is null or p_them < 0 or p_them > 99 then return 'أهداف الخصم بين 0 و99'; end if;
  if p_played is null then return 'حالة المباراة غير صالحة'; end if;
  update public.matches set opp_goals = p_them, played = p_played where id = mt.id;
  perform app.log(t, 'تحديث نتيجة', format('%s: %s، أهداف الخصم %s', mt.opponent, case when p_played then 'انتهت' else 'لم تُلعب' end, p_them));
  return '';
end $$;

-- ======================= WRITES: lineup & attendance =======================
create function public.rpc_set_starters(p_ids uuid[]) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); i uuid; pl public.players; f text;
begin
  if t is null or not app.has_perm(t, 'lineup') then return app.deny(); end if;
  if p_ids is null or (select count(distinct x) from unnest(p_ids) x) <> coalesce(array_length(p_ids, 1), 0) then
    return 'قائمة التشكيلة غير صالحة'; end if;
  if coalesce(array_length(p_ids, 1), 0) > 11 then return 'الحد الأقصى 11 لاعبًا'; end if;
  foreach i in array p_ids loop
    select * into pl from public.players x where x.id = i and x.team_id = t;
    if not found then return 'لاعب غير موجود في التشكيلة'; end if;
    if pl.status <> 'active' and not exists (select 1 from public.lineup_starters s where s.team_id = t and s.player_id = i) then
      return 'لا يمكن إضافة لاعب غير نشط إلى التشكيلة'; end if;
  end loop;
  insert into public.lineups(team_id) values (t) on conflict do nothing;
  delete from public.lineup_starters where team_id = t and not (player_id = any (p_ids));
  insert into public.lineup_starters(team_id, player_id)
    select t, x from unnest(p_ids) x on conflict do nothing;      -- trigger enforces active-only for NEW rows and the 11 cap
  select formation into f from public.lineups where team_id = t;
  perform app.log(t, 'تحديث التشكيلة', format('%s لاعبًا — %s', coalesce(array_length(p_ids, 1), 0), f));
  return '';
end $$;

create function public.rpc_set_attendance(p_session uuid, p_player uuid, p_present boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); s public.training_sessions; pl public.players;
begin
  if t is null or not app.has_perm(t, 'lineup') then return app.deny(); end if;
  select * into s  from public.training_sessions x where x.id = p_session and x.team_id = t;
  if not found then return 'الحصة غير موجودة'; end if;
  select * into pl from public.players x where x.id = p_player and x.team_id = t;
  if not found then return 'اللاعب غير موجود'; end if;
  if pl.status = 'unregistered' then return 'لا يُسجّل حضور للاعب غير مسجّل'; end if;
  insert into public.attendance(team_id, session_id, player_id, present, recorded_by)
    values (t, s.id, pl.id, p_present is true, (select auth.uid()))
    on conflict (session_id, player_id) do update set present = excluded.present, recorded_by = excluded.recorded_by, recorded_at = now();
  perform app.log(t, 'تسجيل حضور', format('%s — %s: %s', pl.name, s.title, case when p_present is true then 'حاضر' else 'غائب' end));
  return '';
end $$;

-- ======================= WRITES: roles, team settings =======================
create function public.rpc_set_permission(p_role text, p_perm text, p_value boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); r public.app_role;
begin
  if t is null or not app.has_perm(t, 'roles') then return app.deny(); end if;               -- founder only
  if p_role not in ('admin', 'secretary', 'coach', 'officer', 'treasurer') then return 'دور غير صالح'; end if;
  r := p_role::public.app_role;
  if r = 'officer' and p_perm in ('staff', 'viewStaff', 'contactStaff', 'contactStaffTeam') then
    return 'هذه الصلاحية غير متاحة لدور مسؤول المباراة'; end if;
  if not exists (select 1 from public.permission_catalog c where c.code = p_perm) then return 'صلاحية غير صالحة'; end if;
  if p_value is null then return 'قيمة غير صالحة'; end if;
  if p_value then
    insert into public.role_permissions(team_id, role, permission) values (t, r, p_perm) on conflict do nothing;
  else
    delete from public.role_permissions where team_id = t and role = r and permission = p_perm;
  end if;
  perform app.log(t, 'تغيير صلاحية', format('%s / %s: %s', p_role, p_perm, case when p_value then 'منح' else 'سحب' end));
  return '';
end $$;

create function public.rpc_save_team(tm jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); v_name text; v_city text;
begin
  if t is null or not app.has_perm(t, 'settings') then return app.deny(); end if;
  tm := coalesce(tm, '{}'::jsonb);
  v_name := btrim(coalesce(tm->>'name', '')); v_city := btrim(coalesce(tm->>'city', ''));
  if length(v_name) > 80 or length(v_city) > 80 then return 'أحد الحقول أطول من الحد المسموح'; end if;
  if v_name = '' then return 'الاسم مطلوب'; end if;
  if coalesce(tm->>'color', '') !~ '^#[0-9a-fA-F]{6}$' then return 'اللون غير صالح'; end if;
  update public.teams set name = v_name, city = v_city, color = tm->>'color' where id = t;
  perform app.log(t, 'تحديث إعدادات الفريق', v_name);
  return '';
end $$;

-- ======================= WRITES: photo metadata (file itself goes via Storage, see 0005) =======================
create function public.rpc_register_photo(p_player uuid, p_path text, p_type text, p_size int, p_primary boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); pl public.players;
begin
  if t is null or not app.has_perm(t, 'players') then return app.deny(); end if;
  select * into pl from public.players x where x.id = p_player and x.team_id = t;
  if not found then return 'اللاعب غير موجود'; end if;
  if p_path is null or left(p_path, 74) <> t::text || '/' || p_player::text || '/' then return 'مسار الصورة غير صالح'; end if;
  if p_primary is true then update public.player_photos set is_primary = false where player_id = p_player; end if;
  insert into public.player_photos(team_id, player_id, storage_path, content_type, size_bytes, is_primary, uploaded_by)
    values (t, p_player, p_path, p_type, p_size, p_primary is true, (select auth.uid()));
  perform app.log(t, 'إضافة صورة لاعب', pl.name);
  return '';
exception when check_violation then return 'الصورة غير صالحة (النوع أو الحجم أو المسار)';
          when unique_violation then return 'الصورة مسجّلة مسبقًا';
end $$;

create function public.rpc_delete_photo(p_photo uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); ph public.player_photos; n text;
begin
  if t is null or not app.has_perm(t, 'players') then return app.deny(); end if;
  select * into ph from public.player_photos x where x.id = p_photo and x.team_id = t;
  if not found then return 'الصورة غير موجودة'; end if;
  select name into n from public.players where id = ph.player_id;
  delete from public.player_photos where id = ph.id;       -- client then removes the object from Storage (policy allows 'players')
  perform app.log(t, 'حذف صورة لاعب', n);
  return '';
end $$;

-- ======================= grants: authenticated only =======================
-- [Phase 2A] S-4: explicit signatures instead of "all functions in schema public"
revoke all on function
  public.rpc_get_me(), public.rpc_get_roster(), public.rpc_get_stat_rows(),
  public.rpc_save_player(jsonb), public.rpc_delete_player(uuid), public.rpc_unregister_player(uuid),
  public.rpc_save_staff(jsonb), public.rpc_delete_staff(uuid),
  public.rpc_save_match(jsonb), public.rpc_add_event(uuid, jsonb), public.rpc_set_result(uuid, int, boolean),
  public.rpc_set_starters(uuid[]), public.rpc_set_attendance(uuid, uuid, boolean),
  public.rpc_set_permission(text, text, boolean), public.rpc_save_team(jsonb),
  public.rpc_register_photo(uuid, text, text, int, boolean), public.rpc_delete_photo(uuid)
  from public, anon;
grant execute on function
  public.rpc_get_me(), public.rpc_get_roster(), public.rpc_get_stat_rows(),
  public.rpc_save_player(jsonb), public.rpc_delete_player(uuid), public.rpc_unregister_player(uuid),
  public.rpc_save_staff(jsonb), public.rpc_delete_staff(uuid),
  public.rpc_save_match(jsonb), public.rpc_add_event(uuid, jsonb), public.rpc_set_result(uuid, int, boolean),
  public.rpc_set_starters(uuid[]), public.rpc_set_attendance(uuid, uuid, boolean),
  public.rpc_set_permission(text, text, boolean), public.rpc_save_team(jsonb),
  public.rpc_register_photo(uuid, text, text, int, boolean), public.rpc_delete_photo(uuid)
  to authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;  -- future functions need an explicit grant

commit;
