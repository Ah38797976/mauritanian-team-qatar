-- ============================================================================
-- REVIEW ONLY — DO NOT EXECUTE.   STAGING ONLY, after 0001–0007 are applied there.
-- Server-side permission matrix (pgTAP). Mirrors the Task 06 role policy.
-- Run inside a transaction that is rolled back at the end (nothing persists).
-- Needs: create extension if not exists pgtap with schema extensions;
-- psql -v u_founder=… -v u_admin=… -v u_secretary=… -v u_coach=… -v u_officer1=… -v u_officer2=… -v u_treasurer=…
-- Fake team id and seeded ids are those of 0007.
-- ============================================================================
begin;
set local search_path = public, extensions, pg_temp;   -- [Phase 2A] pgTAP lives in the "extensions" schema on Supabase
select * from no_plan();

-- helper: act as a signed-in user (same mechanism PostgREST uses)
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- ---------- anon: nothing at all ----------
set local role anon;
select throws_ok($$select count(*) from public.players$$, '42501', null, 'anon: players closed');
select throws_ok($$select public.rpc_get_me()$$, '42501', null, 'anon: cannot call RPCs');
reset role;

-- ---------- coach (u_coach) ----------
select pg_temp.as_user(:'u_coach'::uuid);
select is((select count(*)::int from public.players), 12, 'coach: sees players');
select is((select count(*)::int from public.player_contacts), 0, 'coach: NO player phone/email');
select is((select count(*)::int from public.staff_contacts), 4, 'coach: staff phones of own team');
select is((select count(*)::int from public.audit_log), 0, 'coach: no audit log');
select is(public.rpc_save_player(jsonb_build_object('id','10000000-0000-4000-8000-000000000001','name','محمد الأمين','num',1,'pos','gk','status','active')), app.deny(), 'coach: cannot manage players');
select is(public.rpc_set_starters(array['10000000-0000-4000-8000-000000000001']::uuid[]), '', 'coach: can set lineup');
select throws_ok($$insert into public.players(team_id,name,shirt_number,position) values ('a0000000-0000-4000-8000-000000000001','x',50,'gk')$$, '42501', null, 'coach: direct INSERT is closed');
reset role;

-- ---------- match officer 1 (u_officer1): own matches only, no staff ----------
select pg_temp.as_user(:'u_officer1'::uuid);
select is((select count(*)::int from public.players), 0, 'officer: no direct player table access');
select is((select count(*)::int from public.staff_members), 0, 'officer: no staff');
select is((select count(*)::int from public.matches), 2, 'officer1: only m1 and m3');
select is((select count(*)::int from public.match_events where match_id = '40000000-0000-4000-8000-000000000002'), 0, 'officer1: m2 events invisible');
select is(public.rpc_add_event('40000000-0000-4000-8000-000000000002'::uuid, '{"pid":"10000000-0000-4000-8000-000000000010","type":"goal","min":5}'::jsonb), app.deny(), 'officer1: cannot write to others'' match');
select is(public.rpc_set_permission('officer','stats',true), app.deny(), 'officer: cannot edit roles');
select ok(jsonb_array_length(public.rpc_get_roster()) > 0, 'officer1: scoped roster returned');
select ok(not (public.rpc_get_roster()->0 ? 'city'), 'officer1: roster has no city');
reset role;

-- ---------- treasurer (u_treasurer): names only ----------
select pg_temp.as_user(:'u_treasurer'::uuid);
select is((select count(*)::int from public.players), 0, 'treasurer: no player table');
select is((select count(*)::int from public.matches), 0, 'treasurer: no matches');
select ok(public.rpc_get_roster()->0 ? 'name' and not (public.rpc_get_roster()->0 ? 'num'), 'treasurer: roster = names only');
select is(public.rpc_get_stat_rows(), '[]'::jsonb, 'treasurer: no stats');
reset role;

-- ---------- secretary (u_secretary): manages players, no contacts ----------
select pg_temp.as_user(:'u_secretary'::uuid);
select is((select count(*)::int from public.player_contacts), 0, 'secretary: no contacts');
select is(public.rpc_save_player(jsonb_build_object('id','10000000-0000-4000-8000-000000000002','name','سيدي أحمد','num',2,'pos','def','status','active','city','أطار','phone','+111')), app.deny(), 'secretary: cannot change phone');
select is(public.rpc_save_player(jsonb_build_object('id','10000000-0000-4000-8000-000000000002','name','سيدي أحمد','num',2,'pos','def','status','active','city','أطار')), '', 'secretary: can edit non-contact fields');
select is((select count(*)::int from public.staff_contacts), 0, 'secretary: no staff phones');
reset role;

-- ---------- admin (u_admin) ----------
select pg_temp.as_user(:'u_admin'::uuid);
select is((select count(*)::int from public.player_contacts), 12, 'admin: sees contacts');
select is((select count(*)::int from public.staff_contacts), 4, 'admin: sees staff phones');
select ok((select count(*) from public.audit_log) >= 1, 'admin: sees audit (incl. the secretary edit above)');
select is(public.rpc_set_permission('coach','players',true), app.deny(), 'admin: cannot edit roles');
select throws_ok($$update public.audit_log set detail = 'x'$$, '42501', null, 'admin: audit not writable');
reset role;

-- ---------- founder (u_founder) ----------
select pg_temp.as_user(:'u_founder'::uuid);
select is(public.rpc_set_permission('officer','staff',true), 'هذه الصلاحية غير متاحة لدور مسؤول المباراة', 'founder: officer staff-perms blocked even for founder');
select is(public.rpc_set_permission('coach','audit',true), '', 'founder: can grant');
select is(public.rpc_unregister_player('10000000-0000-4000-8000-000000000012'::uuid), '', 'founder: unregister keeps history');
select like(public.rpc_delete_player('10000000-0000-4000-8000-000000000001'::uuid), 'لا يمكن حذف لاعب مرتبط%', 'founder: hard delete refused with history');
reset role;

select * from finish();
rollback;  -- nothing persists
