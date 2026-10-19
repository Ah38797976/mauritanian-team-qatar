-- REVIEW ONLY — DO NOT EXECUTE. Undo 0002.
begin;
drop trigger if exists lineup_starters_guard on public.lineup_starters;
drop trigger if exists players_touch on public.players;
drop function if exists app.lineup_guard(), app.touch_updated_at(), app.log(uuid, text, text),
  app.can_read_match(uuid), app.can_view_matches(uuid), app.can_see_roster(uuid), app.has_perm(uuid, text, uuid),
  app.role_has_perm(uuid, text), app.my_role(uuid), app.my_team(), app.try_uuid(text), app.deny();
commit;
