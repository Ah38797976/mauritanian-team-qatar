-- ============================================================================
-- REVIEW ONLY — DO NOT EXECUTE.  STAGING ONLY, after 0001–0007.
-- Test group 20 — PHONE / EMAIL CONFIDENTIALITY BETWEEN ROLES (fake data only).
-- WHAT IT MUST PROVE:
--   1. Roles without 'contactPlayers' (secretary, coach, officers, treasurer) can read NO phone/email value through
--      any table, any RPC output, or embedded joins.            (detector is validated by positive controls)
--   2. Permission changes by the founder take effect immediately (grant => visible, revoke => hidden).
--   3. There is no ORACLE: a caller who cannot read a contact cannot learn it by "guess and see if saving is accepted"
--      (player + staff).  Review finding S-1; the check passes only with the Phase 2A change to 0004.
--   4. The audit log never stores contact values, even when a contact is changed.
-- Run:  psql -v ON_ERROR_STOP=1 -v u_founder=… -v u_admin=… -v u_secretary=… -v u_coach=… -v u_officer1=… -v u_officer2=… -v u_treasurer=… -f 20_contact_leak.sql
-- ============================================================================
begin;
set local search_path = public, extensions, pg_temp;
select * from no_plan();

create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- counts every place a contact-looking value (or a phone/email KEY) is visible to the CURRENT role.
-- player_contacts / staff_contacts are deliberately excluded here: they are the protected tables themselves.
create or replace function pg_temp.leak_count() returns int language plpgsql as $$
declare n int := 0; c int; t text; pat text := '(\+000|\+999|example\.invalid|"phone"|"email")';
begin
  foreach t in array array['teams','team_members','role_permissions','players','player_photos','staff_members','lineups',
                           'lineup_starters','training_sessions','attendance','matches','match_players','match_events','audit_log'] loop
    execute format('select count(*) from public.%I x where to_jsonb(x)::text ~ %L', t, pat) into c;
    n := n + c;
  end loop;
  n := n + (public.rpc_get_roster()::text ~ pat)::int + (public.rpc_get_stat_rows()::text ~ pat)::int
         + (coalesce(public.rpc_get_me()::text, '') ~ pat)::int;
  return n;
end $$;

-- ---------- detector sanity (superuser): the pattern DOES match the seeded contact rows ----------
select is((select count(*)::int from public.player_contacts c where to_jsonb(c)::text ~ '(\+000|example\.invalid|"phone"|"email")'), 12,
          'detector: pattern matches all 12 seeded player contact rows');

-- ---------- 1) roles without contact permission ----------
select pg_temp.as_user(:'u_secretary'::uuid);
select is((select count(*)::int from public.player_contacts), 0, 'secretary: player_contacts empty');
select is((select count(*)::int from public.staff_contacts), 0, 'secretary: staff_contacts empty');
select is(pg_temp.leak_count(), 0, 'secretary: no contact value anywhere (tables + RPC outputs)');
select is((select count(*)::int from public.players p left join public.player_contacts c on c.player_id = p.id where c.phone is not null), 0,
          'secretary: join to player_contacts yields no phone');
reset role;

select pg_temp.as_user(:'u_coach'::uuid);
select is((select count(*)::int from public.player_contacts), 0, 'coach: player_contacts empty');
select is(pg_temp.leak_count(), 0, 'coach: no player phone/email anywhere');
reset role;

select pg_temp.as_user(:'u_officer1'::uuid);
select is((select count(*)::int from public.player_contacts), 0, 'officer1: player_contacts empty');
select is((select count(*)::int from public.staff_contacts), 0, 'officer1: staff_contacts empty');
select is(pg_temp.leak_count(), 0, 'officer1: no contact value anywhere');
reset role;

select pg_temp.as_user(:'u_officer2'::uuid);
select is(pg_temp.leak_count(), 0, 'officer2: no contact value anywhere');
reset role;

select pg_temp.as_user(:'u_treasurer'::uuid);
select is((select count(*)::int from public.player_contacts), 0, 'treasurer: player_contacts empty');
select is((select count(*)::int from public.staff_contacts), 0, 'treasurer: staff_contacts empty');
select is(pg_temp.leak_count(), 0, 'treasurer: no contact value anywhere');
reset role;

-- positive control: the people who SHOULD see contacts do
select pg_temp.as_user(:'u_admin'::uuid);
select is((select count(*)::int from public.player_contacts), 12, 'admin: sees 12 player contacts (control)');
select is((select count(*)::int from public.staff_contacts), 4, 'admin: sees 4 staff phones (control)');
reset role;

-- ---------- 2) permission changes are live ----------
select pg_temp.as_user(:'u_founder'::uuid);
select is(public.rpc_set_permission('coach', 'contactPlayers', true), '', 'founder grants contactPlayers to coach');
reset role;
select pg_temp.as_user(:'u_coach'::uuid);
select is((select count(*)::int from public.player_contacts), 12, 'coach (granted): now sees contacts');
reset role;
select pg_temp.as_user(:'u_founder'::uuid);
select is(public.rpc_set_permission('coach', 'contactPlayers', false), '', 'founder revokes contactPlayers from coach');
reset role;
select pg_temp.as_user(:'u_coach'::uuid);
select is((select count(*)::int from public.player_contacts), 0, 'coach (revoked): contacts hidden again');
reset role;

-- ---------- 3) no oracle ----------
-- seeded: player 2 phone '+000 00 00 11 00', email 'player2@example.invalid'
select pg_temp.as_user(:'u_secretary'::uuid);
select is(public.rpc_save_player(jsonb_build_object('id','10000000-0000-4000-8000-000000000002','name','x','num',2,'pos','def','status','active','city','',
                                                    'phone','+000 00 00 11 00')), app.deny(), 'oracle: secretary sends the CORRECT phone  => denied');
select is(public.rpc_save_player(jsonb_build_object('id','10000000-0000-4000-8000-000000000002','name','x','num',2,'pos','def','status','active','city','',
                                                    'phone','+123')), app.deny(), 'oracle: secretary sends a WRONG phone    => denied (identical answer)');
select is(public.rpc_save_player(jsonb_build_object('id','10000000-0000-4000-8000-000000000002','name','x','num',2,'pos','def','status','active','city','',
                                                    'email','player2@example.invalid')), app.deny(), 'oracle: correct email => denied');
select is(public.rpc_save_player(jsonb_build_object('id','10000000-0000-4000-8000-000000000002','name','x','num',2,'pos','def','status','active','city','',
                                                    'phone','')), app.deny(), 'oracle: empty-string phone key => denied');
select is(public.rpc_save_player(jsonb_build_object('name','New One','num',77,'pos','mid','status','active','city','','phone','+1')), app.deny(),
          'secretary cannot create a player WITH a phone');
select is(public.rpc_save_player(jsonb_build_object('id','10000000-0000-4000-8000-000000000002','name','x','num',2,'pos','def','status','active','city','',
                                                    'phone', null)), '', 'JSON null contact key is treated as absent (allowed edit)');
reset role;

-- staff oracle needs a role that has 'staff' but not 'contactStaff'
select pg_temp.as_user(:'u_founder'::uuid);
select is(public.rpc_set_permission('secretary', 'staff', true), '', 'founder grants staff management to secretary (setup)');
reset role;
select pg_temp.as_user(:'u_secretary'::uuid);
select is(public.rpc_save_staff(jsonb_build_object('id','20000000-0000-4000-8000-000000000001','name','x','role','r','kind','technical','phone','+000 00 11 00 01')),
          app.deny(), 'staff oracle: correct phone => denied');
select is(public.rpc_save_staff(jsonb_build_object('id','20000000-0000-4000-8000-000000000001','name','x','role','r','kind','technical','phone','+1')),
          app.deny(), 'staff oracle: wrong phone   => denied (identical)');
select is(public.rpc_save_staff(jsonb_build_object('id','20000000-0000-4000-8000-000000000001','name','x','role','r','kind','technical')),
          '', 'staff edit without phone key is allowed (control)');
select is((select count(*)::int from public.staff_contacts), 0, 'secretary with staff perm still reads no staff phones');
reset role;
select is((select phone from public.staff_contacts where staff_id = '20000000-0000-4000-8000-000000000001'), '+000 00 11 00 01',
          'staff phone unchanged after the secretary edit');
select is((select phone from public.player_contacts where player_id = '10000000-0000-4000-8000-000000000002'), '+000 00 00 11 00',
          'player phone unchanged after the secretary edits');

-- ---------- 4) audit never stores contact values ----------
select pg_temp.as_user(:'u_admin'::uuid);
select is(public.rpc_save_player(jsonb_build_object('id','10000000-0000-4000-8000-000000000003','name','عبد الله ولد سالم','num',3,'pos','def','status','active',
                                                    'city','روصو','phone','+999 TEST PHONE','email','new@example.invalid')), '', 'admin changes a player contact');
select ok((select count(*) from public.audit_log) >= 1, 'audit has rows');
select is((select count(*)::int from public.audit_log where detail ~ '(\+999|\+000|example\.invalid)'), 0, 'audit detail contains no phone/email value');
reset role;

select * from finish();
rollback;
