-- REVIEW ONLY — DO NOT EXECUTE. Undo 0005. The bucket must be EMPTY first (delete objects via the Storage API, not SQL).
begin;
drop policy if exists player_photos_select on storage.objects;
drop policy if exists player_photos_insert on storage.objects;
drop policy if exists player_photos_delete on storage.objects;
delete from storage.buckets where id = 'player-photos';
commit;
