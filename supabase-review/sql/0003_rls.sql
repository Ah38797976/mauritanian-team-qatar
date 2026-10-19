-- ============================================================================
-- REVIEW ONLY — DO NOT EXECUTE.
-- Task 07 / 0003: Row Level Security.
-- Model: READS go through RLS SELECT policies (or scoped SECURITY DEFINER RPCs);
--        WRITES have NO policies and NO grants — they happen only inside RPCs (0004).
-- anon gets nothing. authenticated gets SELECT only.
-- ============================================================================
begin;

-- 1) enable RLS everywhere (default-deny)
alter table public.teams             enable row level security;
alter table public.team_members      enable row level security;
alter table public.permission_catalog enable row level security;
alter table public.role_permissions  enable row level security;
alter table public.players           enable row level security;
alter table public.player_contacts   enable row level security;
alter table public.player_photos     enable row level security;
alter table public.staff_members     enable row level security;
alter table public.staff_contacts    enable row level security;
alter table public.lineups           enable row level security;
alter table public.lineup_starters   enable row level security;
alter table public.training_sessions enable row level security;
alter table public.attendance        enable row level security;
alter table public.matches           enable row level security;
alter table public.match_players     enable row level security;
alter table public.match_events      enable row level security;
alter table public.audit_log         enable row level security;

-- 2) privileges: nothing for anon, SELECT only for authenticated, no direct writes at all
revoke all on all tables in schema public from anon, authenticated;
grant select on public.teams, public.team_members, public.permission_catalog, public.role_permissions,
  public.players, public.player_contacts, public.player_photos, public.staff_members, public.staff_contacts,
  public.lineups, public.lineup_starters, public.training_sessions, public.attendance,
  public.matches, public.match_players, public.match_events, public.audit_log
  to authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;  -- future tables start closed
-- [Phase 2A] sequences too (Supabase default privileges grant them to anon/authenticated) — S-5
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- 3) SELECT policies  (note: (select …) wrappers let Postgres cache per statement)
create policy teams_read on public.teams for select to authenticated
  using (app.my_role(id) is not null);

create policy members_read on public.team_members for select to authenticated
  using (user_id = (select auth.uid())
         or app.has_perm(team_id, 'matches')      -- needed to pick a match officer
         or app.has_perm(team_id, 'settings')
         or app.has_perm(team_id, 'roles'));

create policy catalog_read on public.permission_catalog for select to authenticated using (true);

create policy role_perms_read on public.role_permissions for select to authenticated
  using (app.has_perm(team_id, 'roles') or role = app.my_role(team_id));

-- players: city lives here → 'viewPlayers'. Roster-only roles use rpc_get_roster() (scoped columns).
create policy players_read on public.players for select to authenticated
  using (app.has_perm(team_id, 'viewPlayers'));

create policy player_contacts_read on public.player_contacts for select to authenticated
  using (app.has_perm(team_id, 'contactPlayers'));

create policy player_photos_read on public.player_photos for select to authenticated
  using (app.has_perm(team_id, 'viewPlayers'));

create policy staff_read on public.staff_members for select to authenticated
  using (app.has_perm(team_id, 'staff') or app.has_perm(team_id, 'viewStaff'));

create policy staff_contacts_read on public.staff_contacts for select to authenticated
  using (app.has_perm(team_id, 'contactStaff')
         or (app.has_perm(team_id, 'contactStaffTeam') and team_id = app.my_team()));

create policy lineups_read on public.lineups for select to authenticated
  using (app.can_see_roster(team_id));
create policy starters_read on public.lineup_starters for select to authenticated
  using (app.can_see_roster(team_id));
create policy sessions_read on public.training_sessions for select to authenticated
  using (app.can_see_roster(team_id));
create policy attendance_read on public.attendance for select to authenticated
  using (app.can_see_roster(team_id));

create policy matches_read on public.matches for select to authenticated
  using (app.can_read_match(id));
create policy match_players_read on public.match_players for select to authenticated
  using (app.can_read_match(match_id));
create policy match_events_read on public.match_events for select to authenticated
  using (app.can_read_match(match_id));

create policy audit_read on public.audit_log for select to authenticated
  using (app.has_perm(team_id, 'audit'));

commit;
