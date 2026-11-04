-- REVIEW ONLY — DO NOT EXECUTE.
begin;
drop function if exists public.rpc_set_member_role(uuid, text);
drop function if exists public.rpc_set_member_active(uuid, boolean);
drop function if exists public.rpc_add_member_by_email(text, text, text);
commit;
