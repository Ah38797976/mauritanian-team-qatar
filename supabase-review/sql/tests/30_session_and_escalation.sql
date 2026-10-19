-- ============================================================================
-- REVIEW ONLY — DO NOT EXECUTE.  STAGING ONLY, after 0001–0007.
-- Test group 30 — IDENTITY FROM THE SESSION + PRIVILEGE-ESCALATION ATTEMPTS (fake data only).
-- WHAT IT MUST PROVE:
--   1. The role/team come ONLY from team_members keyed by the JWT "sub": forged user_metadata/app_metadata claims,
--      an unknown subject, a deactivated member and a role change all behave as the table says, immediately.
--   2. Nobody (not even the founder) can write tables directly; only founder may change permissions via RPC.
--   3. The hard rules hold at the data level: officer never gets staff permissions, no second active founder.
--   4. Officer scope: only own matches; removing 'stats' removes the write; out-of-scope players are refused.
--   5. audit_log cannot be altered even by a privileged role.
-- ============================================================================
begin;
set local search_path = public, extensions, pg_temp;
select * from no_plan();

create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function pg_temp.as_claims(c jsonb) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', c::text, true);
  execute 'set local role authenticated';
end $$;

-- ---------- 1) identity ----------
select pg_temp.as_claims(jsonb_build_object('sub', :'u_coach'::text, 'role', 'authenticated',
        'user_metadata', jsonb_build_object('role', 'founder', 'team_role', 'founder'),
        'app_metadata',  jsonb_build_object('role', 'founder', 'team_id', 'a0000000-0000-4000-8000-000000000001')));
select is(public.rpc_get_me()->>'role', 'coach', 'forged user_metadata/app_metadata role claims are ignored');
select is(public.rpc_set_permission('coach', 'players', true), app.deny(), 'forged founder claims do not allow role management');
select is((select count(*)::int from public.audit_log), 0, 'forged claims do not unlock the audit log');
reset role;

select pg_temp.as_user('99999999-9999-4999-8999-999999999999'::uuid);   -- authenticated, but in no team
select is(public.rpc_get_me(), null::jsonb, 'stranger: rpc_get_me is null');
select is(public.rpc_get_roster(), '[]'::jsonb, 'stranger: empty roster');
select is(public.rpc_get_stat_rows(), '[]'::jsonb, 'stranger: no stat rows');
select is((select count(*)::int from public.players), 0, 'stranger: no players');
select is((select count(*)::int from public.teams), 0, 'stranger: no team');
select is((select count(*)::int from public.permission_catalog) > 0, true, 'stranger may read the (non-sensitive) permission labels');
select is(public.rpc_save_player(jsonb_build_object('name','x','num',50,'pos','gk','status','active')), app.deny(), 'stranger: cannot create players');
reset role;

update public.team_members set active = false where user_id = :'u_coach'::uuid;
select pg_temp.as_user(:'u_coach'::uuid);
select is(public.rpc_get_me(), null::jsonb, 'deactivated member: no identity');
select is((select count(*)::int from public.players), 0, 'deactivated member: sees nothing at once (JWT still valid)');
reset role;
update public.team_members set active = true where user_id = :'u_coach'::uuid;

update public.team_members set role = 'treasurer' where user_id = :'u_coach'::uuid;
select pg_temp.as_user(:'u_coach'::uuid);
select is((select count(*)::int from public.players), 0, 'role changed to treasurer: no player table access at once');
select ok(not (public.rpc_get_roster()->0 ? 'num'), 'role changed to treasurer: roster is names only');
reset role;
update public.team_members set role = 'coach' where user_id = :'u_coach'::uuid;

-- ---------- 2) no direct writes for anybody ----------
select pg_temp.as_user(:'u_coach'::uuid);
select throws_ok(format($$update public.team_members set role = 'founder' where user_id = %L$$, :'u_coach'), '42501', null, 'coach: cannot promote self by UPDATE');
select throws_ok($$insert into public.role_permissions(team_id, role, permission) values ('a0000000-0000-4000-8000-000000000001','coach','players')$$, '42501', null, 'coach: cannot insert permissions');
select throws_ok($$delete from public.role_permissions$$, '42501', null, 'coach: cannot delete permissions');
select throws_ok($$insert into public.audit_log(team_id, actor_name, action) values ('a0000000-0000-4000-8000-000000000001','x','forged')$$, '42501', null, 'coach: cannot forge audit rows');
reset role;
select pg_temp.as_user(:'u_admin'::uuid);
select throws_ok($$update public.role_permissions set permission = 'players'$$, '42501', null, 'admin: cannot UPDATE permissions');
select throws_ok($$insert into public.team_members(user_id, team_id, role, display_name) values (gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', 'founder', 'x')$$, '42501', null, 'admin: cannot add a founder');
reset role;
select pg_temp.as_user(:'u_founder'::uuid);
select throws_ok($$update public.players set name = 'x'$$, '42501', null, 'founder: no direct table writes either (RPC only)');
reset role;

-- every non-founder is refused by rpc_set_permission
select pg_temp.as_user(:'u_admin'::uuid);     select is(public.rpc_set_permission('coach','players',true), app.deny(), 'admin cannot manage roles');     reset role;
select pg_temp.as_user(:'u_secretary'::uuid); select is(public.rpc_set_permission('coach','players',true), app.deny(), 'secretary cannot manage roles'); reset role;
select pg_temp.as_user(:'u_coach'::uuid);     select is(public.rpc_set_permission('coach','players',true), app.deny(), 'coach cannot manage roles');     reset role;
select pg_temp.as_user(:'u_officer1'::uuid);  select is(public.rpc_set_permission('officer','stats',true), app.deny(), 'officer cannot manage roles');  reset role;
select pg_temp.as_user(:'u_treasurer'::uuid); select is(public.rpc_set_permission('treasurer','audit',true), app.deny(), 'treasurer cannot manage roles'); reset role;

select pg_temp.as_user(:'u_founder'::uuid);
select isnt(public.rpc_set_permission('founder', 'audit', true), '', 'founder role is not editable');
select isnt(public.rpc_set_permission('coach', 'roles', true), '', '"roles" cannot be granted to anyone');
select isnt(public.rpc_set_permission('coach', 'no_such_perm', true), '', 'unknown permission rejected');
reset role;

-- ---------- 3) hard rules in the data ----------
select throws_ok($$insert into public.role_permissions(team_id, role, permission) values ('a0000000-0000-4000-8000-000000000001','officer','viewStaff')$$,
                 '23514', null, 'CHECK: officer can never hold staff permissions (even for the table owner)');
select throws_ok($$insert into public.role_permissions(team_id, role, permission) values ('a0000000-0000-4000-8000-000000000001','founder','players')$$,
                 '23514', null, 'CHECK: founder is not a table-driven role');
select throws_ok(format($$update public.team_members set role = 'founder' where user_id = %L and team_id = 'a0000000-0000-4000-8000-000000000001'$$, :'u_admin'),
                 '23505', null, 'only one active founder per team');

-- ---------- 4) officer scope ----------
select pg_temp.as_user(:'u_officer1'::uuid);
select is(public.rpc_add_event('40000000-0000-4000-8000-000000000003'::uuid, '{"pid":"10000000-0000-4000-8000-000000000001","type":"goal","min":5}'::jsonb), '',
          'officer1: event on OWN upcoming match for a current starter (control)');
select isnt(public.rpc_add_event('40000000-0000-4000-8000-000000000003'::uuid, '{"pid":"10000000-0000-4000-8000-000000000005","type":"goal","min":6}'::jsonb), '',
          'officer1: player outside the match scope refused');
select is(public.rpc_add_event('40000000-0000-4000-8000-000000000002'::uuid, '{"pid":"10000000-0000-4000-8000-000000000001","type":"goal","min":7}'::jsonb), app.deny(),
          'officer1: other officer''s match denied');
select is(public.rpc_set_result('40000000-0000-4000-8000-000000000002'::uuid, 0, true), app.deny(), 'officer1: cannot set result of another match');
select is(public.rpc_save_match('{}'::jsonb), app.deny(), 'officer1: cannot create/edit matches');
select is(public.rpc_set_starters(array['10000000-0000-4000-8000-000000000001']::uuid[]), app.deny(), 'officer1: cannot change the lineup');
reset role;

select pg_temp.as_user(:'u_founder'::uuid);
select is(public.rpc_set_permission('officer', 'stats', false), '', 'founder removes stats from officers');
reset role;
select pg_temp.as_user(:'u_officer1'::uuid);
select is(public.rpc_add_event('40000000-0000-4000-8000-000000000003'::uuid, '{"pid":"10000000-0000-4000-8000-000000000001","type":"goal","min":8}'::jsonb), app.deny(),
          'officer1 without stats: own match write denied');
reset role;
select pg_temp.as_user(:'u_founder'::uuid);
select is(public.rpc_set_permission('officer', 'stats', true), '', 'founder restores stats');
select is(public.rpc_unregister_player('10000000-0000-4000-8000-000000000012'::uuid), '', 'founder unregisters player 12');
select isnt(public.rpc_add_event('40000000-0000-4000-8000-000000000002'::uuid, '{"pid":"10000000-0000-4000-8000-000000000012","type":"yellow","min":9}'::jsonb), '',
            'events for an unregistered player are refused');
reset role;

-- ---------- 5) audit immutability (superuser too: it is a trigger) ----------
select ok((select count(*) from public.audit_log) >= 1, 'audit has rows to attack');
select throws_ok($$update public.audit_log set detail = 'tampered'$$, 'P0001', 'audit_log is append-only', 'audit_log UPDATE refused');
select throws_ok($$delete from public.audit_log$$, 'P0001', 'audit_log is append-only', 'audit_log DELETE refused');

select * from finish();
rollback;
