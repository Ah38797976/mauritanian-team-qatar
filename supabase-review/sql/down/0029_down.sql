-- يتراجع عن 0029 (للمراجعة فقط، غير منفّذ): يحذف دالة قراءة التنبيهات العامة. لا يمسّ جدول push_messages.
begin;
drop function if exists public.rpc_public_notices();
commit;
