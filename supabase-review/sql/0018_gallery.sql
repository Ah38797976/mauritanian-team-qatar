-- 0018: معرض صور الفريق — تُدار الصور من لوحة التحكم وتظهر في الموقع العام عند التفعيل فقط (مطفأ افتراضيًا).
-- APPLIED to staging (ddrbrskusreoktqabkvi) on 2026-11-08 (migration name 0018_gallery). إضافة فقط: لا يغيّر أي جدول أو دالة موجودة.
-- - جدولان بلا وصول مباشر (RLS مفعّل بلا سياسات): gallery_settings (visible) وgallery_photos. كل القراءة/الكتابة عبر RPC.
-- - الإدارة بصلاحية 'settings'. القراءة العامة عبر rpc_public_gallery (anon) وتُرجِع صورًا فقط عند visible=true.
-- - ملفات الصور في bucket player-photos بمسار <team>/<team>/<uuid>.<ext> — وهو المسار نفسه الذي تغطيه سياسات dev_photo_insert/dev_photo_delete من 0017 (صلاحية settings)، فلا سياسات تخزين جديدة.
-- - حد أقصى 40 صورة لكل فريق.
begin;

create table public.gallery_settings (
  team_id uuid primary key references public.teams(id) on delete cascade,
  visible boolean not null default false
);
create table public.gallery_photos (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams(id) on delete cascade,
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  caption      text not null default '' check (char_length(caption) <= 80),
  created_at   timestamptz not null default now()
);
create index gallery_photos_team_idx on public.gallery_photos(team_id, created_at desc);
alter table public.gallery_settings enable row level security;
alter table public.gallery_photos enable row level security;
revoke all on public.gallery_settings, public.gallery_photos from anon, authenticated;
comment on table public.gallery_photos is 'Team photo gallery. No direct access: rpc_get_gallery / rpc_set_gallery_visible / rpc_add_gallery_photo / rpc_delete_gallery_photo / rpc_public_gallery.';

create or replace function public.rpc_get_gallery() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t uuid := app.my_team();
begin
  if t is null or not app.has_perm(t, 'settings') then return null; end if;
  return jsonb_build_object(
    'visible', coalesce((select visible from public.gallery_settings where team_id = t), false),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'path', storage_path, 'caption', caption) order by created_at desc, id) from public.gallery_photos where team_id = t), '[]'::jsonb));
end $$;

create or replace function public.rpc_set_gallery_visible(p_visible boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team();
begin
  if t is null or not app.has_perm(t, 'settings') then return app.deny(); end if;
  if p_visible is null then return 'بيانات غير صالحة'; end if;
  insert into public.gallery_settings(team_id, visible) values (t, p_visible) on conflict (team_id) do update set visible = excluded.visible;
  perform app.log(t, case when p_visible then 'إظهار معرض الصور' else 'إخفاء معرض الصور' end, '');
  return '';
end $$;

create or replace function public.rpc_add_gallery_photo(p_path text, p_type text, p_size integer, p_caption text) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); c text := btrim(coalesce(p_caption, ''));
begin
  if t is null or not app.has_perm(t, 'settings') then return app.deny(); end if;
  if p_path is null or left(p_path, 74) <> t::text || '/' || t::text || '/' then return 'مسار الصورة غير صالح'; end if;
  if p_type not in ('image/jpeg', 'image/png', 'image/webp') or p_size is null or p_size not between 1 and 2097152 then return 'الصورة غير صالحة (النوع أو الحجم)'; end if;
  if char_length(c) > 80 then return 'التعليق أطول من 80 حرفًا'; end if;
  if (select count(*) from public.gallery_photos where team_id = t) >= 40 then return 'وصلت إلى الحد الأقصى (40 صورة). احذف صورة قبل إضافة أخرى'; end if;
  insert into public.gallery_photos(team_id, storage_path, caption) values (t, p_path, c);
  perform app.log(t, 'إضافة صورة للمعرض', '');
  return '';
exception when unique_violation then return 'الصورة مسجّلة مسبقًا'; when check_violation then return 'مسار الصورة غير صالح';
end $$;

create or replace function public.rpc_delete_gallery_photo(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); n int;
begin
  if t is null or not app.has_perm(t, 'settings') then return app.deny(); end if;
  delete from public.gallery_photos where id = p_id and team_id = t;
  get diagnostics n = row_count;
  if n = 0 then return 'الصورة غير موجودة'; end if;
  perform app.log(t, 'حذف صورة من المعرض', '');
  return '';
end $$;

create or replace function public.rpc_public_gallery() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.teams;
begin
  select * into t from public.teams order by created_at limit 1;
  if not found then return null; end if;
  if not coalesce((select visible from public.gallery_settings where team_id = t.id), false) then return null; end if;
  return (select jsonb_agg(jsonb_build_object('path', storage_path, 'caption', caption) order by created_at desc, id)
            from (select * from public.gallery_photos where team_id = t.id order by created_at desc, id limit 40) x);
end $$;

revoke all on function public.rpc_get_gallery(), public.rpc_set_gallery_visible(boolean), public.rpc_add_gallery_photo(text, text, integer, text),
  public.rpc_delete_gallery_photo(uuid), public.rpc_public_gallery() from public, anon, authenticated;
grant execute on function public.rpc_get_gallery(), public.rpc_set_gallery_visible(boolean), public.rpc_add_gallery_photo(text, text, integer, text),
  public.rpc_delete_gallery_photo(uuid) to authenticated;
grant execute on function public.rpc_public_gallery() to anon, authenticated;

commit;
