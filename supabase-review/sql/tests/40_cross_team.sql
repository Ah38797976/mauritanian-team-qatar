-- ============================================================================
-- REVIEW ONLY — DO NOT EXECUTE.  STAGING ONLY, after 0001–0007.
-- Test group 40 — TEAM ISOLATION (the schema is "ready for several teams"; this proves a second team's data is untouchable).
-- A second fake team B is inserted by the test itself (superuser, rolled back at the end).
-- WHAT IT MUST PROVE:
--   1. Members of team A cannot read B rows (players, contacts, staff, matches, sessions) — even admin/founder.
--   2. Every write RPC addressed to a B id is refused and leaves B untouched (no IDOR).
--   3. A user who belongs to BOTH teams is resolved deterministically to the OLDEST membership (app.my_team()).
--      Known v1 limitation made visible: RLS reads follow membership (so B's match is readable by that user) while
--      RPC writes follow my_team() only.  Decision needed before any real multi-team use (risk R10).
-- ============================================================================
begin;
set local search_path = public, extensions, pg_temp;
select * from no_plan();

create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- ---------- fixture: team B (fake) ----------
insert into public.teams(id, name) values ('b0000000-0000-4000-8000-000000000002', 'Team B (fake)');
insert into public.team_members(user_id, team_id, role, display_name, created_at)
  values (:'u_officer1'::uuid, 'b0000000-0000-4000-8000-000000000002', 'officer', 'officer1 in B (fake)', '2100-01-01');
insert into public.players(id, team_id, name, shirt_number, position)
  values ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'B Player', 1, 'gk');
insert into public.player_contacts(player_id, team_id, phone, email)
  values ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', '+999 00 00 00 01', 'b@example.invalid');
insert into public.staff_members(id, team_id, name, kind)
  values ('b2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'B Staff', 'technical');
insert into public.staff_contacts(staff_id, team_id, phone)
  values ('b2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', '+999 00 11 00 01');
insert into public.training_sessions(id, team_id, title, session_date)
  values ('b3000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'B session', '2026-10-20');
insert into public.matches(id, team_id, opponent, match_date, is_home, officer_id)
  values ('b4000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'B opponent', '2026-10-30', true, :'u_officer1'::uuid);

-- ---------- 1) reads ----------
select pg_temp.as_user(:'u_admin'::uuid);
select is((select count(*)::int from public.players), 12, 'admin(A): sees only the 12 A players');
select is((select count(*)::int from public.player_contacts where team_id = 'b0000000-0000-4000-8000-000000000002'), 0, 'admin(A): no B player contacts');
select is((select count(*)::int from public.staff_members where team_id = 'b0000000-0000-4000-8000-000000000002'), 0, 'admin(A): no B staff');
select is((select count(*)::int from public.staff_contacts where team_id = 'b0000000-0000-4000-8000-000000000002'), 0, 'admin(A): no B staff phones');
select is((select count(*)::int from public.matches where team_id = 'b0000000-0000-4000-8000-000000000002'), 0, 'admin(A): no B matches');
select is((select count(*)::int from public.training_sessions where team_id = 'b0000000-0000-4000-8000-000000000002'), 0, 'admin(A): no B sessions');
select is((select count(*)::int from public.teams), 1, 'admin(A): sees only team A');
select ok(not (public.rpc_get_roster()::text like '%B Player%'), 'admin(A): roster RPC does not include B');
reset role;
select pg_temp.as_user(:'u_founder'::uuid);
select is((select count(*)::int from public.players where team_id = 'b0000000-0000-4000-8000-000000000002'), 0, 'founder(A): no B players');
reset role;

-- ---------- 2) writes addressed to B ids ----------
select pg_temp.as_user(:'u_founder'::uuid);
select isnt(public.rpc_save_player(jsonb_build_object('id','b1000000-0000-4000-8000-000000000001','name','hacked','num',1,'pos','gk','status','active','phone','+0')), '', 'save B player refused');
select isnt(public.rpc_delete_player('b1000000-0000-4000-8000-000000000001'::uuid), '', 'delete B player refused');
select isnt(public.rpc_unregister_player('b1000000-0000-4000-8000-000000000001'::uuid), '', 'unregister B player refused');
select isnt(public.rpc_save_staff(jsonb_build_object('id','b2000000-0000-4000-8000-000000000001','name','hacked','role','','kind','technical')), '', 'save B staff refused');
select isnt(public.rpc_delete_staff('b2000000-0000-4000-8000-000000000001'::uuid), '', 'delete B staff refused');
select isnt(public.rpc_add_event('b4000000-0000-4000-8000-000000000001'::uuid, '{"pid":"b1000000-0000-4000-8000-000000000001","type":"goal","min":1}'::jsonb), '', 'event in B match refused');
select isnt(public.rpc_set_result('b4000000-0000-4000-8000-000000000001'::uuid, 9, true), '', 'result of B match refused');
select isnt(public.rpc_set_attendance('b3000000-0000-4000-8000-000000000001'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, true), '', 'attendance in B session refused');
select isnt(public.rpc_set_attendance('30000000-0000-4000-8000-000000000001'::uuid, 'b1000000-0000-4000-8000-000000000001'::uuid, true), '', 'attendance for a B player refused');
select isnt(public.rpc_set_starters(array['b1000000-0000-4000-8000-000000000001']::uuid[]), '', 'B player cannot be a starter of A');
select isnt(public.rpc_register_photo('b1000000-0000-4000-8000-000000000001'::uuid,
            'b0000000-0000-4000-8000-000000000002/b1000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000001.jpg', 'image/jpeg', 1000, true), '', 'photo for a B player refused');
select is(public.rpc_save_match(jsonb_build_object('opp','x','date','2026-11-01','home',true,'officer',:'u_officer1'::text)), '', 'control: a valid save in team A still works');
reset role;

select is((select name from public.players where id = 'b1000000-0000-4000-8000-000000000001'), 'B Player', 'B player untouched');
select is((select phone from public.player_contacts where player_id = 'b1000000-0000-4000-8000-000000000001'), '+999 00 00 00 01', 'B contact untouched');
select is((select count(*)::int from public.staff_members where id = 'b2000000-0000-4000-8000-000000000001'), 1, 'B staff still exists');
select is((select count(*)::int from public.match_events where match_id = 'b4000000-0000-4000-8000-000000000001'), 0, 'no event written to B match');
select is((select count(*)::int from public.attendance where team_id = 'b0000000-0000-4000-8000-000000000002'), 0, 'no attendance written to B');

-- ---------- 3) user in two teams ----------
select pg_temp.as_user(:'u_officer1'::uuid);
select is(public.rpc_get_me()->'team'->>'id', 'a0000000-0000-4000-8000-000000000001', 'two-team user resolves to the OLDEST membership (A)');
select is(public.rpc_get_me()->>'role', 'officer', 'role is the one of the resolved team');
select is((select count(*)::int from public.matches where id = 'b4000000-0000-4000-8000-000000000001'), 1,
          'KNOWN LIMITATION: RLS read follows membership, so officer1 can read the B match he is officer of');
select isnt(public.rpc_add_event('b4000000-0000-4000-8000-000000000001'::uuid, '{"pid":"b1000000-0000-4000-8000-000000000001","type":"goal","min":2}'::jsonb), '',
            'but RPC writes follow my_team() only, so the B match cannot be written');
reset role;

select * from finish();
rollback;
