-- REVIEW ONLY — DO NOT EXECUTE. Undo 0007 (staging fake data). Cascades remove everything under the fake team.
begin;
delete from public.teams where id = 'a0000000-0000-4000-8000-000000000001';  -- audit_log rows cascade-delete only if the trigger is disabled first:
-- alter table public.audit_log disable trigger audit_log_no_update;  (staging only, re-enable afterwards)
commit;
