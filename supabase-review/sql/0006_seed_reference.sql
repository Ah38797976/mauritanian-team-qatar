-- ============================================================================
-- REVIEW ONLY — DO NOT EXECUTE.
-- Task 07 / 0006: reference data (permission catalog) + default-permission helper.
-- Safe for any environment (contains no personal data).
-- ============================================================================
begin;

insert into public.permission_catalog(code, label_ar) values
  ('viewPlayers',      'مشاهدة ملفات اللاعبين'),
  ('players',          'إدارة اللاعبين'),
  ('staff',            'إدارة الطاقم'),
  ('lineup',           'التشكيلة والحضور'),
  ('viewStaff',        'مشاهدة الطاقم (بلا هواتف)'),
  ('contactPlayers',   'عرض هاتف وبريد اللاعبين'),
  ('contactStaff',     'عرض هواتف الطاقم'),
  ('contactStaffTeam', 'هواتف طاقم الفريق فقط (بلا بريد)'),
  ('finance',          'البيانات المالية (محدودة)'),
  ('viewNames',        'مشاهدة أسماء اللاعبين فقط'),
  ('matches',          'إدارة المباريات'),
  ('stats',            'إدخال الإحصائيات'),
  ('settings',         'إعدادات الفريق'),
  ('audit',            'سجل العمليات')
on conflict (code) do nothing;
-- note: 'roles' is NOT a catalog entry — managing roles is hard-wired to the founder in app.has_perm().

-- default matrix = exactly the Task 06 prototype (data.js `perms`)
create function app.seed_team_defaults(p_team uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.role_permissions(team_id, role, permission)
  select p_team, r::public.app_role, perm from (values
    ('admin','viewPlayers'),('admin','players'),('admin','staff'),('admin','matches'),('admin','stats'),
    ('admin','settings'),('admin','audit'),('admin','viewStaff'),('admin','contactPlayers'),('admin','contactStaff'),
    ('secretary','viewPlayers'),('secretary','players'),('secretary','stats'),('secretary','matches'),('secretary','viewStaff'),
    ('coach','viewPlayers'),('coach','lineup'),('coach','viewStaff'),('coach','contactStaffTeam'),
    ('officer','stats'),
    ('treasurer','finance'),('treasurer','viewNames')
  ) v(r, perm)
  on conflict do nothing;
  insert into public.lineups(team_id) values (p_team) on conflict do nothing;
$$;
revoke all on function app.seed_team_defaults(uuid) from public, anon, authenticated;  -- migrations/owner only

commit;
