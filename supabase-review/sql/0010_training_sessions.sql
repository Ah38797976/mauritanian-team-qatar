-- APPLIED to staging (ddrbrskusreoktqabkvi) on 2026-11-05.   0010: create/delete training sessions.
-- Needed by admin/live "التشكيلة والحضور": without a session no attendance can be recorded.
-- Same contract as 0004: team from the session, permission 'lineup', SECURITY DEFINER, search_path='', returns '' or an Arabic error.
begin;

create function public.rpc_save_session(s jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); v_title text; v_date date;
begin
  if t is null or not app.has_perm(t, 'lineup') then return app.deny(); end if;
  if s is null or jsonb_typeof(s) is distinct from 'object' then return 'بيانات غير صالحة'; end if;
  v_title := btrim(coalesce(s->>'title', ''));
  if char_length(v_title) not between 1 and 80 then return 'عنوان الحصة مطلوب (حتى 80 حرفًا)'; end if;
  if coalesce(s->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then return 'تاريخ غير صالح'; end if;
  begin v_date := (s->>'date')::date; exception when others then return 'تاريخ غير صالح'; end;
  if v_date < current_date - 1095 or v_date > current_date + 365 then return 'التاريخ خارج النطاق المسموح'; end if;
  insert into public.training_sessions(team_id, title, session_date) values (t, v_title, v_date);
  perform app.log(t, 'إضافة حصة تدريب', format('%s — %s', v_title, v_date));
  return '';
end $$;

create function public.rpc_delete_session(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); x public.training_sessions;
begin
  if t is null or not app.has_perm(t, 'lineup') then return app.deny(); end if;
  select * into x from public.training_sessions where id = p_id and team_id = t;
  if not found then return 'الحصة غير موجودة'; end if;
  delete from public.training_sessions where id = x.id;      -- سجلات الحضور تُحذف معها (ON DELETE CASCADE)
  perform app.log(t, 'حذف حصة تدريب', format('%s — %s', x.title, x.session_date));
  return '';
end $$;

revoke all on function public.rpc_save_session(jsonb), public.rpc_delete_session(uuid) from public, anon;
grant execute on function public.rpc_save_session(jsonb), public.rpc_delete_session(uuid) to authenticated;

commit;
