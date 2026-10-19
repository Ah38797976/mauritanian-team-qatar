-- ============================================================================
-- REVIEW ONLY — DO NOT EXECUTE.
-- Task 07 / 0002: private helper functions in schema "app" (never exposed by the Data API).
-- Permission logic mirrors Store.can() from Task 06, but is enforced in the database.
-- Role is read from team_members (a DB table only the owner-level code can change) —
-- NEVER from user_metadata / JWT claims that the user can edit.
-- ============================================================================
begin;

grant usage on schema app to authenticated;

create function app.deny() returns text language sql immutable set search_path = '' as $$ select 'غير مصرح بهذه العملية لدورك الحالي'::text $$;

create function app.try_uuid(p text) returns uuid language plpgsql immutable set search_path = '' as $$
begin return p::uuid; exception when others then return null; end $$;

-- the caller's single team (v1 = one team; multi-team later needs an explicit "active team" choice)
create function app.my_team() returns uuid
language sql stable security definer set search_path = '' as $$
  select tm.team_id from public.team_members tm
  where tm.user_id = (select auth.uid()) and tm.active
  order by tm.created_at limit 1
$$;

create function app.my_role(p_team uuid) returns public.app_role
language sql stable security definer set search_path = '' as $$
  select tm.role from public.team_members tm
  where tm.user_id = (select auth.uid()) and tm.team_id = p_team and tm.active
$$;

-- raw table lookup (no officer/match special cases)
create function app.role_has_perm(p_team uuid, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.my_role(p_team) = 'founder'
      or exists (select 1 from public.role_permissions rp
                 where rp.team_id = p_team and rp.role = app.my_role(p_team) and rp.permission = p_perm)
$$;

-- == Store.can(m, match) ==
create function app.has_perm(p_team uuid, p_perm text, p_match uuid default null) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare r public.app_role := app.my_role(p_team);
begin
  if r is null then return false; end if;
  if r = 'founder' then return true; end if;
  if p_perm = 'roles' then return false; end if;                                             -- founder only
  if r = 'officer' and p_perm in ('staff','viewStaff','contactStaff','contactStaffTeam') then return false; end if;
  if r = 'officer' and p_perm = 'stats' then                                                  -- only their own matches
    if p_match is null then return false; end if;
    if not exists (select 1 from public.matches m
                   where m.id = p_match and m.team_id = p_team and m.officer_id = (select auth.uid())) then
      return false;
    end if;
  end if;
  return exists (select 1 from public.role_permissions rp
                 where rp.team_id = p_team and rp.role = r and rp.permission = p_perm);
end $$;

-- == Store.canSeeRoster() ==
create function app.can_see_roster(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.has_perm(p_team, 'viewPlayers') or app.has_perm(p_team, 'lineup')
$$;

-- == Store.canViewMatches() ==
create function app.can_view_matches(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.can_see_roster(p_team) or app.has_perm(p_team, 'matches') or app.role_has_perm(p_team, 'stats')
$$;

-- who may read a given match (and its players/events)
create function app.can_read_match(p_match uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.matches m
    where m.id = p_match
      and ( app.can_see_roster(m.team_id) or app.has_perm(m.team_id, 'matches')
            or m.officer_id = (select auth.uid()) )
      and app.my_role(m.team_id) is not null)
$$;

-- append-only audit writer (callers pass NO contact values)
create function app.log(p_team uuid, p_action text, p_detail text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.app_role := app.my_role(p_team); n text;
begin
  select tm.display_name into n from public.team_members tm
   where tm.user_id = (select auth.uid()) and tm.team_id = p_team;
  insert into public.audit_log(team_id, actor_id, actor_name, actor_role, action, detail)
  values (p_team, (select auth.uid()), coalesce(n, '?'), r, left(p_action, 80), left(coalesce(p_detail, ''), 300));
end $$;

-- lineup guard: max 11 starters, only active players may be ADDED
create function app.lineup_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare st public.player_status;
begin
  select p.status into st from public.players p where p.id = new.player_id and p.team_id = new.team_id;
  if st is distinct from 'active' then raise exception 'لا يمكن إضافة لاعب غير نشط إلى التشكيلة'; end if;
  if (select count(*) from public.lineup_starters s where s.team_id = new.team_id) >= 11 then
    raise exception 'الحد الأقصى 11 لاعبًا';
  end if;
  return new;
end $$;
create trigger lineup_starters_guard before insert on public.lineup_starters
  for each row execute function app.lineup_guard();

create function app.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger players_touch before update on public.players
  for each row execute function app.touch_updated_at();

-- helpers are callable only by signed-in users (policies/RPCs); never by anon
-- [Phase 2A] explicit list instead of "all functions in schema" (see docs/07-security-review.md S-4)
revoke all on function app.audit_immutable(), app.deny(), app.try_uuid(text), app.my_team(), app.my_role(uuid),
  app.role_has_perm(uuid, text), app.has_perm(uuid, text, uuid), app.can_see_roster(uuid), app.can_view_matches(uuid),
  app.can_read_match(uuid), app.log(uuid, text, text), app.lineup_guard(), app.touch_updated_at()
  from public, anon, authenticated;
grant execute on function app.has_perm(uuid, text, uuid), app.role_has_perm(uuid, text),
  app.my_role(uuid), app.my_team(), app.can_see_roster(uuid), app.can_view_matches(uuid),
  app.can_read_match(uuid), app.try_uuid(text), app.deny() to authenticated;
-- app.log() is deliberately NOT granted: only SECURITY DEFINER RPCs (owner) call it.

commit;
