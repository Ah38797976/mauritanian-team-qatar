-- يسحب lineup من secretary (لم تكن ممنوحة قبل 0016 حسب فحص staging بتاريخ 2026-11-07).
begin;
delete from public.role_permissions where role = 'secretary' and permission = 'lineup';
commit;
