-- ============================================================================
-- APPLIED to staging (ddrbrskusreoktqabkvi) on 2026-11-04 with the revoke below.   Task 08 / 0008: user management RPCs (founder only).
-- Needed by admin/live "المستخدمون". Same contract as 0004: return '' on success or an
-- Arabic error text; team derived from the session; SECURITY DEFINER, search_path=''.
-- Rules: founder only (permission 'roles'); the founder row can never be changed or
-- deactivated; nobody edits their own role; roles allowed: admin, secretary, coach,
-- officer, treasurer (never 'founder'). Linking by email reads auth.users inside the
-- definer function only — no service key in the browser. The auth account itself is
-- created by the founder in Supabase → Authentication.
-- ============================================================================
begin;

create function public.rpc_set_member_role(p_user uuid, p_role text) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); cur public.app_role;
begin
  if t is null or not app.has_perm(t, 'roles') then return app.deny(); end if;
  if p_role is null or p_role not in ('admin','secretary','coach','officer','treasurer') then return 'دور غير صالح'; end if;
  if p_user = (select auth.uid()) then return 'لا يمكنك تغيير دورك بنفسك'; end if;
  select role into cur from public.team_members where team_id = t and user_id = p_user;
  if cur is null then return 'مستخدم غير موجود'; end if;
  if cur = 'founder' then return 'لا يمكن تغيير دور المؤسس'; end if;
  update public.team_members set role = p_role::public.app_role where team_id = t and user_id = p_user;
  perform app.log(t, 'تغيير دور مستخدم', format('%s → %s', cur, p_role));
  return '';
end $$;

create function public.rpc_set_member_active(p_user uuid, p_active boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); cur public.app_role;
begin
  if t is null or not app.has_perm(t, 'roles') then return app.deny(); end if;
  if p_active is null then return 'قيمة غير صالحة'; end if;
  if p_user = (select auth.uid()) then return 'لا يمكنك إيقاف حسابك'; end if;
  select role into cur from public.team_members where team_id = t and user_id = p_user;
  if cur is null then return 'مستخدم غير موجود'; end if;
  if cur = 'founder' then return 'لا يمكن إيقاف المؤسس'; end if;
  update public.team_members set active = p_active where team_id = t and user_id = p_user;
  perform app.log(t, case when p_active then 'تفعيل مستخدم' else 'إيقاف مستخدم' end, cur::text);
  return '';
end $$;

create function public.rpc_add_member_by_email(p_email text, p_name text, p_role text) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); u uuid; n text := btrim(coalesce(p_name, ''));
begin
  if t is null or not app.has_perm(t, 'roles') then return app.deny(); end if;
  if p_role is null or p_role not in ('admin','secretary','coach','officer','treasurer') then return 'دور غير صالح'; end if;
  if char_length(n) not between 1 and 60 then return 'الاسم مطلوب (حتى 60 حرفًا)'; end if;
  select id into u from auth.users where lower(email) = lower(btrim(coalesce(p_email, ''))) limit 1;
  if u is null then return 'لا يوجد حساب بهذا البريد. أنشئه أولًا من Supabase → Authentication'; end if;
  if exists (select 1 from public.team_members where user_id = u) then return 'هذا الحساب مرتبط بفريق بالفعل'; end if;  -- فريق نشط واحد لكل مستخدم (قرار G3)
  insert into public.team_members(user_id, team_id, role, display_name) values (u, t, p_role::public.app_role, n);
  perform app.log(t, 'إضافة مستخدم', format('%s (%s)', n, p_role));
  return '';
end $$;

revoke all on function
  public.rpc_set_member_role(uuid, text), public.rpc_set_member_active(uuid, boolean),
  public.rpc_add_member_by_email(text, text, text)
  from public, anon;
grant execute on function
  public.rpc_set_member_role(uuid, text), public.rpc_set_member_active(uuid, boolean),
  public.rpc_add_member_by_email(text, text, text)
  to authenticated;

commit;
