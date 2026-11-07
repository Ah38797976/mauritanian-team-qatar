-- 0017 down: removes the developer card (table, RPCs, storage policies). Uploaded photo objects, if any, stay in the bucket until deleted from the dashboard.
begin;
drop function if exists public.rpc_public_developer(), public.rpc_delete_developer_photo(), public.rpc_set_developer_photo(text, text, integer), public.rpc_save_developer(jsonb), public.rpc_get_developer();
drop policy if exists dev_photo_insert on storage.objects;
drop policy if exists dev_photo_delete on storage.objects;
drop table if exists public.developer_profile;
commit;
