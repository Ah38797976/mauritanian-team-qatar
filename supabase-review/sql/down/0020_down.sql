drop function if exists public.rpc_push_roster();
drop function if exists public.rpc_push_code_name(text);
drop function if exists app.push_code();
alter table public.push_subscriptions drop column if exists player_id, drop column if exists member_id;
drop table if exists public.push_invites;
-- ملاحظة: rpc_push_subscribe تبقى بنسخة 0020؛ لإرجاعها أعد تنفيذ تعريفها من 0019_push.sql.
