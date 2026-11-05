-- REVIEW ONLY.
begin;
drop function if exists public.rpc_save_session(jsonb);
drop function if exists public.rpc_delete_session(uuid);
commit;
