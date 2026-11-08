-- 0019 down: removes the Web Push tables and RPCs (all subscriptions and the sent-message log are deleted).
begin;
drop function if exists public.rpc_push_stats(), public.rpc_push_authorize(jsonb), public.rpc_push_unsubscribe(text), public.rpc_push_subscribe(jsonb);
drop table if exists public.push_messages;
drop table if exists public.push_subscriptions;
commit;
