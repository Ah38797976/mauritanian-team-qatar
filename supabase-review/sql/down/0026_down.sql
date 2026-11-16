-- يتراجع عن 0026 (للمراجعة فقط، غير منفّذ): يعيد rpc_save_match إلى نصه السابق ثم يحذف العمود.
begin;

create or replace function public.rpc_save_match(m jsonb)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare t uuid := app.my_team(); v_id uuid; v_opp text; v_date date; v_home boolean; v_off uuid; found_m boolean := false; v_time time; v_venue text;
begin
  if t is null or not app.has_perm(t, 'matches') then return app.deny(); end if;
  m := coalesce(m, '{}'::jsonb);
  v_opp := btrim(coalesce(m->>'opp', ''));
  if length(v_opp) > 80 then return 'اسم الخصم أطول من الحد المسموح'; end if;
  begin v_date := (m->>'date')::date; exception when others then v_date := null; end;
  if v_opp = '' or v_date is null or (m->>'date') !~ '^\d{4}-\d{2}-\d{2}$' then return 'الخصم والتاريخ مطلوبان'; end if;
  if jsonb_typeof(m->'home') is distinct from 'boolean' then return 'الملعب غير صالح'; end if;
  v_home := (m->>'home')::boolean;
  if m ? 'time' then
    if btrim(coalesce(m->>'time', '')) = '' then v_time := null;
    elsif (m->>'time') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then v_time := (m->>'time')::time;
    else return 'وقت المباراة غير صالح'; end if;
  end if;
  if m ? 'venue' then
    v_venue := nullif(btrim(coalesce(m->>'venue', '')), '');
    if length(coalesce(v_venue, '')) > 100 then return 'اسم الملعب أطول من الحد المسموح'; end if;
  end if;
  v_off := app.try_uuid(m->>'officer');
  if v_off is null or not exists (select 1 from public.team_members tm
        where tm.user_id = v_off and tm.team_id = t and tm.active and tm.role in ('officer', 'secretary')) then
    return 'مسؤول المباراة غير صالح'; end if;
  if m->>'id' is not null then
    v_id := app.try_uuid(m->>'id');
    select true into found_m from public.matches x where x.id = v_id and x.team_id = t;
    if v_id is null or not coalesce(found_m, false) then return 'المباراة غير موجودة'; end if;
    update public.matches set opponent = v_opp, match_date = v_date, is_home = v_home, officer_id = v_off,
      kickoff = case when m ? 'time' then v_time else kickoff end, venue = case when m ? 'venue' then v_venue else venue end where id = v_id;
  else
    insert into public.matches(team_id, opponent, match_date, is_home, officer_id, kickoff, venue) values (t, v_opp, v_date, v_home, v_off, v_time, v_venue);
  end if;
  perform app.log(t, 'حفظ مباراة', v_opp);
  return '';
end $function$;

alter table public.matches drop constraint if exists matches_map_url_chk;
alter table public.matches drop column if exists map_url;

commit;
