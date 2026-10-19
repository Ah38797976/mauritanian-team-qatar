-- REVIEW ONLY — DO NOT EXECUTE. Undo 0004.
begin;
drop function if exists public.rpc_get_me(), public.rpc_get_roster(), public.rpc_get_stat_rows(),
  public.rpc_save_player(jsonb), public.rpc_delete_player(uuid), public.rpc_unregister_player(uuid),
  public.rpc_save_staff(jsonb), public.rpc_delete_staff(uuid),
  public.rpc_save_match(jsonb), public.rpc_add_event(uuid, jsonb), public.rpc_set_result(uuid, int, boolean),
  public.rpc_set_starters(uuid[]), public.rpc_set_attendance(uuid, uuid, boolean),
  public.rpc_set_permission(text, text, boolean), public.rpc_save_team(jsonb),
  public.rpc_register_photo(uuid, text, text, int, boolean), public.rpc_delete_photo(uuid);
commit;
