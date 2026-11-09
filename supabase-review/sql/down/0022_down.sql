-- 0022 down: removes RSVP + training details; restores the previous rpc_save_session (insert-only, permission 'attendance').
begin;
drop function if exists public.rpc_training_responses(uuid), public.rpc_training_rsvp(jsonb), public.rpc_public_training(text);
drop table if exists public.training_rsvp;
create or replace function public.rpc_save_session(s jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); v_title text; v_date date;
begin
  if t is null or not app.has_perm(t, 'attendance') then return app.deny(); end if;
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
alter table public.training_sessions drop column if exists start_time, drop column if exists venue, drop column if exists map_url;
commit;
