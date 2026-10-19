-- ============================================================================
-- REVIEW ONLY — DO NOT EXECUTE.
-- Task 07 / 0005: private bucket for player photos + Storage RLS on storage.objects.
-- Object path convention (enforced by policies AND by player_photos CHECK):
--   <team_uuid>/<player_uuid>/<photo_uuid>.<jpg|png|webp>
-- Bucket is PRIVATE; the app shows photos through short-lived signed URLs (e.g. 5–10 min).
-- Objects are immutable: no UPDATE policy, so no overwrite/upsert; replace = delete + new upload.
-- ============================================================================
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('player-photos', 'player-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- read: whoever may read player profiles of that team
create policy player_photos_select on storage.objects for select to authenticated
using (
  bucket_id = 'player-photos'
  and app.try_uuid((storage.foldername(name))[1]) is not null
  and app.has_perm(app.try_uuid((storage.foldername(name))[1]), 'viewPlayers')
);

-- upload: whoever manages players, only inside their own team folder
create policy player_photos_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'player-photos'
  and app.try_uuid((storage.foldername(name))[1]) is not null
  and app.try_uuid((storage.foldername(name))[1]) = app.my_team()
  and app.has_perm(app.try_uuid((storage.foldername(name))[1]), 'players')
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'   -- [Phase 2A] S-6: same shape as player_photos CHECK
);

-- delete: same as upload
create policy player_photos_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'player-photos'
  and app.try_uuid((storage.foldername(name))[1]) = app.my_team()
  and app.has_perm(app.try_uuid((storage.foldername(name))[1]), 'players')
);

-- (no UPDATE policy on purpose; anon has no policy at all)
commit;
