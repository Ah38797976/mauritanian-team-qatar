-- REVIEW ONLY. Drops the finance ledger and ALL its data.
begin;
drop function if exists public.rpc_get_finance();
drop function if exists public.rpc_save_finance(jsonb);
drop function if exists public.rpc_delete_finance(uuid);
drop table if exists public.finance_entries;
commit;
