-- ============================================================================
-- REVIEW ONLY — DO NOT EXECUTE.  STAGING ONLY, after 0001–0007 (0005 creates the bucket and policies).
-- Test group 50 — PLAYER PHOTOS BUCKET (private) + storage.objects policies.
-- WHAT IT MUST PROVE:
--   1. The bucket is private, 2 MB, jpg/png/webp only.
--   2. Read follows 'viewPlayers'; upload/delete follow 'players' and only inside the caller's own team folder.
--   3. Path shape is enforced (<team>/<player>/<uuid>.<ext>); objects cannot be updated/overwritten.
--   4. anon sees and does nothing.
-- NOT provable in SQL (covered by the manual list in docs/08): real MIME sniffing, the 2 MB limit on a live upload,
-- signed-URL expiry, and EXIF stripping (client side).
-- ============================================================================
begin;
set local search_path = public, extensions, pg_temp;
select * from no_plan();

create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- 1) bucket configuration
select is((select public from storage.buckets where id = 'player-photos'), false, 'bucket is private');
select is((select file_size_limit from storage.buckets where id = 'player-photos'), 2097152::bigint, 'bucket limit = 2 MB');
select is((select allowed_mime_types from storage.buckets where id = 'player-photos'), array['image/jpeg','image/png','image/webp']::text[], 'bucket allows only jpg/png/webp');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'player\_photos\_%' and cmd = 'UPDATE'), 0,
          'no UPDATE policy on photos (immutable objects)');

-- fixture: one object in team A for player 1 (inserted by the table owner)
insert into storage.objects(bucket_id, name)
  values ('player-photos', 'a0000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000001.jpg');

-- 2) reads
select pg_temp.as_user(:'u_coach'::uuid);     select is((select count(*)::int from storage.objects where bucket_id = 'player-photos'), 1, 'coach (viewPlayers) can list the photo'); reset role;
select pg_temp.as_user(:'u_admin'::uuid);     select is((select count(*)::int from storage.objects where bucket_id = 'player-photos'), 1, 'admin can list the photo'); reset role;
select pg_temp.as_user(:'u_officer1'::uuid);  select is((select count(*)::int from storage.objects where bucket_id = 'player-photos'), 0, 'officer cannot see photos'); reset role;
select pg_temp.as_user(:'u_treasurer'::uuid); select is((select count(*)::int from storage.objects where bucket_id = 'player-photos'), 0, 'treasurer cannot see photos'); reset role;
set local role anon;                          select is((select count(*)::int from storage.objects where bucket_id = 'player-photos'), 0, 'anon cannot see photos'); reset role;

-- 3) writes
select pg_temp.as_user(:'u_coach'::uuid);
select throws_ok($$insert into storage.objects(bucket_id, name) values ('player-photos','a0000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000002/c0000000-0000-4000-8000-000000000002.jpg')$$,
                 '42501', null, 'coach (no players perm) cannot upload');
reset role;

select pg_temp.as_user(:'u_admin'::uuid);
select lives_ok($$insert into storage.objects(bucket_id, name) values ('player-photos','a0000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000002/c0000000-0000-4000-8000-000000000002.jpg')$$,
                'admin can upload inside the own team folder (control)');
select throws_ok($$insert into storage.objects(bucket_id, name) values ('player-photos','b0000000-0000-4000-8000-000000000002/b1000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000003.jpg')$$,
                 '42501', null, 'admin cannot upload into another team folder');
select throws_ok($$insert into storage.objects(bucket_id, name) values ('player-photos','a0000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000002/evil.exe')$$,
                 '42501', null, 'wrong file name/extension refused by the path-shape policy');
select throws_ok($$insert into storage.objects(bucket_id, name) values ('player-photos','a0000000-0000-4000-8000-000000000001/loose.jpg')$$,
                 '42501', null, 'path without the player folder refused');
select throws_ok($$insert into storage.objects(bucket_id, name) values ('player-photos','not-a-uuid/10000000-0000-4000-8000-000000000002/c0000000-0000-4000-8000-000000000004.jpg')$$,
                 '42501', null, 'non-uuid team folder refused');
select is((with u as (update storage.objects set name = name || 'x' where bucket_id = 'player-photos' returning 1) select count(*)::int from u), 0,
          'UPDATE affects 0 rows (no UPDATE policy => no overwrite/rename)');
select is((with d as (delete from storage.objects where bucket_id = 'player-photos'
                        and name = 'a0000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000002/c0000000-0000-4000-8000-000000000002.jpg' returning 1)
           select count(*)::int from d), 1, 'admin can delete a photo of the own team');
reset role;

select pg_temp.as_user(:'u_coach'::uuid);
select is((with d as (delete from storage.objects where bucket_id = 'player-photos' returning 1) select count(*)::int from d), 0, 'coach cannot delete photos');
reset role;

set local role anon;
select throws_ok($$insert into storage.objects(bucket_id, name) values ('player-photos','a0000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000002/c0000000-0000-4000-8000-000000000009.jpg')$$,
                 '42501', null, 'anon cannot upload');
reset role;

select * from finish();
rollback;
