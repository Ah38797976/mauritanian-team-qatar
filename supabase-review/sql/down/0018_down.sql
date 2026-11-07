-- 0018 down: removes the gallery tables and RPCs. Uploaded image objects stay in the bucket until deleted from the dashboard.
begin;
drop function if exists public.rpc_public_gallery(), public.rpc_delete_gallery_photo(uuid), public.rpc_add_gallery_photo(text, text, integer, text), public.rpc_set_gallery_visible(boolean), public.rpc_get_gallery();
drop table if exists public.gallery_photos;
drop table if exists public.gallery_settings;
commit;
