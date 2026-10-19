-- REVIEW ONLY — DO NOT EXECUTE. Undo 0006.
begin;
drop function if exists app.seed_team_defaults(uuid);
delete from public.permission_catalog;  -- fails if role_permissions still reference it (undo 0007 first)
commit;
