-- REVIEW ONLY.
begin;
drop function if exists public.rpc_delete_match(uuid);
drop function if exists public.rpc_delete_event(bigint);
commit;
