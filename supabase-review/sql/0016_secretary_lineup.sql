-- 0016: يمنح دور secretary صلاحية lineup (تعديل التشكيلة) في كل فريق. admin والمدرب يملكانها أصلاً.
-- لا يغيّر أي دالة أو سياسة. idempotent. التراجع: down/0016_down.sql
begin;
insert into public.role_permissions(team_id, role, permission)
select t.id, 'secretary'::public.app_role, 'lineup' from public.teams t
on conflict do nothing;
commit;
