-- REVIEW ONLY. Drops staff photo rows (storage objects must be removed separately) and restores rpc_public_site without staff photos.
begin;
drop policy if exists staff_photos_select on storage.objects;
drop policy if exists staff_photos_insert on storage.objects;
drop policy if exists staff_photos_delete on storage.objects;
drop function if exists public.rpc_set_staff_photo(uuid, text, text, integer);
drop function if exists public.rpc_delete_staff_photo(uuid);
drop table if exists public.staff_photos;
-- re-apply the rpc_public_site definition from 0009_public_photos.sql to remove the staff 'photo' key
commit;
