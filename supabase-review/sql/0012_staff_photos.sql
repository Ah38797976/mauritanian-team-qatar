-- 0012: staff photos (one photo per staff member), shown on the public site when the "photos" section switch is on.
-- Same bucket / path shape as player photos: <team>/<staff>/<uuid>.(jpg|png|webp). Managed with permission 'staff'.
begin;

create table public.staff_photos (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null,
  staff_id     uuid not null,
  storage_path text not null unique
               check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp')),
  size_bytes   integer not null check (size_bytes between 1 and 2097152),
  uploaded_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  foreign key (team_id, staff_id) references public.staff_members(team_id, id) on delete cascade
);
create unique index staff_photos_one on public.staff_photos(staff_id);
alter table public.staff_photos enable row level security;
create policy staff_photos_read on public.staff_photos for select to authenticated
  using (app.has_perm(team_id, 'staff') or app.has_perm(team_id, 'viewStaff'));
revoke all on public.staff_photos from anon, authenticated;
grant select on public.staff_photos to authenticated;

-- storage: staff managers upload/delete inside their team folder; staff viewers may read (signed URLs in the admin)
create policy staff_photos_select on storage.objects for select to authenticated
using (
  bucket_id = 'player-photos'
  and app.try_uuid((storage.foldername(name))[1]) is not null
  and (app.has_perm(app.try_uuid((storage.foldername(name))[1]), 'staff') or app.has_perm(app.try_uuid((storage.foldername(name))[1]), 'viewStaff'))
);
create policy staff_photos_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'player-photos'
  and app.try_uuid((storage.foldername(name))[1]) is not null
  and app.try_uuid((storage.foldername(name))[1]) = app.my_team()
  and app.has_perm(app.try_uuid((storage.foldername(name))[1]), 'staff')
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and exists (select 1 from public.staff_members sm where sm.id = app.try_uuid((storage.foldername(name))[2]) and sm.team_id = app.my_team())
);
create policy staff_photos_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'player-photos'
  and app.try_uuid((storage.foldername(name))[1]) = app.my_team()
  and app.has_perm(app.try_uuid((storage.foldername(name))[1]), 'staff')
);

-- register (replaces any previous photo row of that member; the client removes the old object afterwards)
create or replace function public.rpc_set_staff_photo(p_staff uuid, p_path text, p_type text, p_size integer) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); sm public.staff_members;
begin
  if t is null or not app.has_perm(t, 'staff') then return app.deny(); end if;
  select * into sm from public.staff_members x where x.id = p_staff and x.team_id = t;
  if not found then return 'عضو الطاقم غير موجود'; end if;
  if p_path is null or left(p_path, 74) <> t::text || '/' || p_staff::text || '/' then return 'مسار الصورة غير صالح'; end if;
  delete from public.staff_photos where staff_id = p_staff;
  insert into public.staff_photos(team_id, staff_id, storage_path, content_type, size_bytes, uploaded_by)
    values (t, p_staff, p_path, p_type, p_size, (select auth.uid()));
  perform app.log(t, 'تحديث صورة عضو طاقم', sm.name);
  return '';
exception when check_violation then return 'الصورة غير صالحة (النوع أو الحجم أو المسار)';
          when unique_violation then return 'الصورة مسجّلة مسبقًا';
end $$;

create or replace function public.rpc_delete_staff_photo(p_staff uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); n text;
begin
  if t is null or not app.has_perm(t, 'staff') then return app.deny(); end if;
  select name into n from public.staff_members x where x.id = p_staff and x.team_id = t;
  if not found then return 'عضو الطاقم غير موجود'; end if;
  delete from public.staff_photos where staff_id = p_staff and team_id = t;
  perform app.log(t, 'حذف صورة عضو طاقم', n);
  return '';
end $$;

revoke all on function public.rpc_set_staff_photo(uuid, text, text, integer), public.rpc_delete_staff_photo(uuid) from public, anon;
grant execute on function public.rpc_set_staff_photo(uuid, text, text, integer), public.rpc_delete_staff_photo(uuid) to authenticated;

create or replace function public.rpc_public_site() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.teams; st public.site_settings; sec jsonb; res jsonb; ph boolean;
begin
  select * into t from public.teams order by created_at limit 1;
  if not found then return null; end if;
  select * into st from public.site_settings where team_id = t.id;
  sec := coalesce(st.sections, '{"players":false,"staff":false,"matches":false,"stats":false}'::jsonb);
  ph := coalesce((sec->>'photos')::boolean, false);
  res := jsonb_build_object('team', jsonb_build_object('name', t.name, 'city', t.city, 'color', t.color),
    'about', coalesce(st.about, ''), 'announcement', coalesce(st.announcement, ''), 'sections', sec);
  if coalesce((sec->>'players')::boolean, false) then
    res := res || jsonb_build_object('players', coalesce((
      select jsonb_agg(jsonb_build_object('name', p.name, 'num', p.shirt_number,
        'pos', case p.position when 'gk' then 'حارس' when 'def' then 'مدافع' when 'mid' then 'وسط' else 'مهاجم' end,
        'photo', case when ph then (select ph2.storage_path from public.player_photos ph2 where ph2.player_id = p.id
                                    order by ph2.is_primary desc, ph2.created_at desc limit 1) end)
        order by p.shirt_number, p.name)
      from public.players p where p.team_id = t.id and p.status <> 'unregistered'), '[]'::jsonb));
  end if;
  if coalesce((sec->>'staff')::boolean, false) then
    res := res || jsonb_build_object('staff', coalesce((
      select jsonb_agg(jsonb_build_object('name', s.name, 'role', s.title,
        'kind', case s.kind when 'technical' then 'فني' else 'إداري' end,
        'photo', case when ph then (select sp.storage_path from public.staff_photos sp where sp.staff_id = s.id limit 1) end)
        order by s.name)
      from public.staff_members s where s.team_id = t.id), '[]'::jsonb));
  end if;
  if coalesce((sec->>'matches')::boolean, false) then
    res := res || jsonb_build_object('matches', coalesce((
      select jsonb_agg(jsonb_build_object('opp', m.opponent, 'date', m.match_date, 'home', m.is_home, 'played', m.played,
        'us', case when m.played then (select count(*) from public.match_events e where e.match_id = m.id and e.event_type = 'goal') end,
        'them', case when m.played then m.opp_goals end) order by m.match_date)
      from public.matches m where m.team_id = t.id), '[]'::jsonb));
  end if;
  if coalesce((sec->>'stats')::boolean, false) then
    res := res || jsonb_build_object('scorers', coalesce((
      select jsonb_agg(jsonb_build_object('name', p.name, 'goals', g.n,
        'apps', (select count(*) from public.match_players mp join public.matches m2 on m2.id = mp.match_id
                 where mp.player_id = p.id and m2.played)) order by g.n desc, p.name)
      from public.players p
      join (select e.player_id, count(*) n from public.match_events e join public.matches m on m.id = e.match_id
            where e.team_id = t.id and e.event_type = 'goal' and m.played group by e.player_id) g on g.player_id = p.id
      where p.team_id = t.id), '[]'::jsonb));
  end if;
  return res;
end $$;

commit;
