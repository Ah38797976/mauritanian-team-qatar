-- 0017: "عن مطوّر التطبيق" — اسم وصفة ونبذة وصورة المطوّر، تُدار من لوحة التحكم وتظهر في الموقع العام عند التفعيل.
-- NOT APPLIED. يُطبَّق على staging فقط بعد موافقة صريحة. لا يغيّر أي دالة أو جدول موجود (إضافة فقط).
-- - جدول developer_profile (صف واحد لكل فريق) بلا وصول مباشر: كل القراءة/الكتابة عبر RPC فقط (كما site_settings).
-- - الإدارة بصلاحية 'settings' (المؤسس/المدير افتراضيًا). القراءة العامة عبر rpc_public_developer (anon) وتُرجِع بيانات فقط عند visible=true.
-- - الصورة في bucket player-photos (عام أصلًا) بمسار <team>/<team>/<uuid>.<ext>؛ لا يُسجَّل في الجدول إلا هذا المسار (يفرضه rpc_set_developer_photo).
begin;

create table public.developer_profile (
  team_id      uuid primary key references public.teams(id) on delete cascade,
  name         text not null default '' check (char_length(name) <= 60),
  title        text not null default '' check (char_length(title) <= 60),
  bio          text not null default '' check (char_length(bio) <= 300),
  storage_path text check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  visible      boolean not null default false,
  updated_at   timestamptz not null default now()
);
alter table public.developer_profile enable row level security;
revoke all on public.developer_profile from anon, authenticated;
comment on table public.developer_profile is 'Developer card for the public site. No direct access: rpc_get_developer / rpc_save_developer / rpc_set_developer_photo / rpc_delete_developer_photo / rpc_public_developer.';

-- storage: only holders of 'settings' may upload/delete, only at <my team>/<my team>/<uuid>.<ext>
create policy dev_photo_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'player-photos'
  and app.try_uuid((storage.foldername(name))[1]) is not null
  and app.try_uuid((storage.foldername(name))[1]) = app.my_team()
  and (storage.foldername(name))[2] = (storage.foldername(name))[1]
  and app.has_perm(app.my_team(), 'settings')
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
);
create policy dev_photo_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'player-photos'
  and app.try_uuid((storage.foldername(name))[1]) = app.my_team()
  and (storage.foldername(name))[2] = (storage.foldername(name))[1]
  and app.has_perm(app.my_team(), 'settings')
);

create or replace function public.rpc_get_developer() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t uuid := app.my_team(); d public.developer_profile;
begin
  if t is null or not app.has_perm(t, 'settings') then return null; end if;
  select * into d from public.developer_profile where team_id = t;
  if not found then return jsonb_build_object('name', '', 'title', '', 'bio', '', 'photo', null, 'visible', false); end if;
  return jsonb_build_object('name', d.name, 'title', d.title, 'bio', d.bio, 'photo', d.storage_path, 'visible', d.visible);
end $$;

create or replace function public.rpc_save_developer(s jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); v_name text; v_title text; v_bio text; v_vis boolean;
begin
  if t is null or not app.has_perm(t, 'settings') then return app.deny(); end if;
  if jsonb_typeof(s) is distinct from 'object' then return 'بيانات غير صالحة'; end if;
  if jsonb_typeof(s->'visible') is distinct from 'boolean' then return 'بيانات غير صالحة'; end if;
  v_name := btrim(coalesce(s->>'name', '')); v_title := btrim(coalesce(s->>'title', '')); v_bio := btrim(coalesce(s->>'bio', '')); v_vis := (s->>'visible')::boolean;
  if char_length(v_name) > 60 or char_length(v_title) > 60 or char_length(v_bio) > 300 then return 'أحد الحقول أطول من الحد المسموح'; end if;
  if v_vis and v_name = '' then return 'اكتب الاسم قبل إظهار القسم في الموقع'; end if;
  insert into public.developer_profile(team_id, name, title, bio, visible, updated_at) values (t, v_name, v_title, v_bio, v_vis, now())
    on conflict (team_id) do update set name = excluded.name, title = excluded.title, bio = excluded.bio, visible = excluded.visible, updated_at = now();
  perform app.log(t, 'تحديث بطاقة المطوّر', '');
  return '';
end $$;

create or replace function public.rpc_set_developer_photo(p_path text, p_type text, p_size integer) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team();
begin
  if t is null or not app.has_perm(t, 'settings') then return app.deny(); end if;
  if p_path is null or left(p_path, 74) <> t::text || '/' || t::text || '/' then return 'مسار الصورة غير صالح'; end if;
  if p_type not in ('image/jpeg', 'image/png', 'image/webp') or p_size is null or p_size not between 1 and 2097152 then return 'الصورة غير صالحة (النوع أو الحجم)'; end if;
  insert into public.developer_profile(team_id, storage_path, updated_at) values (t, p_path, now())
    on conflict (team_id) do update set storage_path = excluded.storage_path, updated_at = now();
  perform app.log(t, 'تحديث صورة المطوّر', '');
  return '';
exception when check_violation then return 'مسار الصورة غير صالح';
end $$;

create or replace function public.rpc_delete_developer_photo() returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team();
begin
  if t is null or not app.has_perm(t, 'settings') then return app.deny(); end if;
  update public.developer_profile set storage_path = null, updated_at = now() where team_id = t;
  perform app.log(t, 'حذف صورة المطوّر', '');
  return '';
end $$;

create or replace function public.rpc_public_developer() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.teams; d public.developer_profile;
begin
  select * into t from public.teams order by created_at limit 1;
  if not found then return null; end if;
  select * into d from public.developer_profile where team_id = t.id;
  if not found or not d.visible or d.name = '' then return null; end if;
  return jsonb_build_object('name', d.name, 'title', d.title, 'bio', d.bio, 'photo', d.storage_path);
end $$;

revoke all on function public.rpc_get_developer(), public.rpc_save_developer(jsonb), public.rpc_set_developer_photo(text, text, integer),
  public.rpc_delete_developer_photo(), public.rpc_public_developer() from public, anon, authenticated;
grant execute on function public.rpc_get_developer(), public.rpc_save_developer(jsonb), public.rpc_set_developer_photo(text, text, integer),
  public.rpc_delete_developer_photo() to authenticated;
grant execute on function public.rpc_public_developer() to anon, authenticated;

commit;
