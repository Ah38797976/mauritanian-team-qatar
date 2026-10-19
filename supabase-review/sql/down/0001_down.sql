-- REVIEW ONLY — DO NOT EXECUTE. Undo 0001 = DESTROYS ALL TEAM DATA. Staging only; take a pg_dump first.
begin;
alter table public.audit_log disable trigger audit_log_no_update;
drop table if exists public.audit_log, public.match_events, public.match_players, public.matches, public.attendance,
  public.training_sessions, public.lineup_starters, public.lineups, public.staff_contacts, public.staff_members,
  public.player_photos, public.player_contacts, public.players, public.role_permissions, public.permission_catalog,
  public.team_members, public.teams cascade;
drop function if exists app.audit_immutable();
drop type if exists public.event_type, public.staff_kind, public.player_status, public.player_position, public.app_role;
-- schema "app" is dropped last, only if empty:  drop schema if exists app;
commit;
