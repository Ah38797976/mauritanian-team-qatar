-- ============================================================================
-- REVIEW ONLY — DO NOT EXECUTE.  STAGING ONLY, after 0001–0006 (0007 not required).
-- Test group 00 — CATALOG / PRIVILEGE POSTURE (no fake data needed).
-- WHAT IT MUST PROVE: the database is closed by default and the only doors are the ones designed:
--   1. RLS is on for every public table and every table has exactly the intended SELECT policy.
--   2. anon has no table, sequence, function or schema access at all.
--   3. authenticated has SELECT only (no INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER, also at column level).
--   4. authenticated may EXECUTE exactly the 17 rpc_* functions in public (revoke is explicit, nothing else leaked).
--   5. every SECURITY DEFINER function pins search_path to ''.
--   6. helper schema "app" is not callable by anon, and sensitive helpers (log/seed/triggers) not by authenticated.
--   7. no views/materialized views/realtime publication leak tables around RLS.
-- Runs in a transaction that is rolled back.  Needs pgTAP:  create extension if not exists pgtap with schema extensions;
-- ============================================================================
begin;
set local search_path = public, extensions, pg_temp;
select * from no_plan();

-- 1) RLS -----------------------------------------------------------------------------------------
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity), 0,
          'RLS enabled on every public table');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r','p')
              and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname and p.cmd = 'SELECT')), 0,
          'every public table has a SELECT policy');
select is((select count(*)::int from pg_policies where schemaname = 'public' and cmd <> 'SELECT'), 0,
          'no INSERT/UPDATE/DELETE/ALL policies on public tables (all writes go through RPC)');
select is((select count(*)::int from pg_policies where schemaname = 'public' and roles <> array['authenticated']::name[]), 0,
          'every public policy targets role authenticated only');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r','p') and c.relforcerowsecurity), 0,
          'FORCE RLS not used (definer functions rely on owner bypass) — documented choice');

-- 2) anon -------------------------------------------------------------------------------------------
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r','p','v','m')
              and (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
                   or has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES'))), 0,
          'anon: no privilege on any public relation (table or column level)');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'S'
              and (has_sequence_privilege('anon', c.oid, 'USAGE,SELECT,UPDATE'))), 0,
          'anon: no privilege on public sequences');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public','app') and has_function_privilege('anon', p.oid, 'EXECUTE')), 0,
          'anon: cannot EXECUTE any function in public or app (also via PUBLIC)');
select ok(not has_schema_privilege('anon', 'app', 'USAGE'), 'anon: no USAGE on schema app');

-- 3) authenticated: SELECT only -------------------------------------------------------------------------
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r','p')
              and (has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
                   or has_any_column_privilege('authenticated', c.oid, 'INSERT,UPDATE,REFERENCES'))), 0,
          'authenticated: no write-type privilege on any public table (table or column level)');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r','p') and not has_table_privilege('authenticated', c.oid, 'SELECT')), 0,
          'authenticated: SELECT granted on all 17 tables (rows are filtered by RLS)');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'S' and has_sequence_privilege('authenticated', c.oid, 'USAGE,UPDATE')), 0,
          'authenticated: no USAGE/UPDATE on public sequences');

-- 4) function EXECUTE surface ---------------------------------------------------------------------------
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f' and p.proname like 'rpc\_%' and has_function_privilege('authenticated', p.oid, 'EXECUTE')), 17,
          'authenticated: EXECUTE on the 17 rpc_* functions');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f' and p.proname like 'rpc\_%'), 17, 'exactly 17 rpc_* functions exist');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f'
              and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
              and p.proname not like 'rpc\_%' and has_function_privilege('authenticated', p.oid, 'EXECUTE')), 0,
          'authenticated: EXECUTE on NO other (non-extension) function in public');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'rpc\_%' and not p.prosecdef), 0, 'all rpc_* are SECURITY DEFINER');

-- 5) SECURITY DEFINER hygiene ------------------------------------------------------------------------------
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public','app') and p.prosecdef
              and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c ~ '^search_path=(""|)$')), 0,
          'every SECURITY DEFINER function pins search_path = empty');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public','app') and p.prokind = 'f'
              and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
              and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c ~ '^search_path=')), 0,
          'no function of ours (definer or not) leaves search_path mutable');

-- 6) helper schema ----------------------------------------------------------------------------------------------
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and has_function_privilege('authenticated', p.oid, 'EXECUTE')), 9,
          'authenticated: EXECUTE on exactly the 9 app helpers used by policies');
select ok(not has_function_privilege('authenticated', 'app.log(uuid,text,text)', 'EXECUTE'), 'authenticated cannot call app.log directly (audit forgery)');
select ok(not has_function_privilege('authenticated', 'app.seed_team_defaults(uuid)', 'EXECUTE'), 'authenticated cannot call app.seed_team_defaults');
select ok(not has_function_privilege('authenticated', 'app.lineup_guard()', 'EXECUTE'), 'authenticated cannot call trigger function lineup_guard');

-- 7) bypass routes ----------------------------------------------------------------------------------------------
select is((select count(*)::int from pg_views where schemaname = 'public'), 0, 'no views in public (views run with owner rights and bypass RLS)');
select is((select count(*)::int from pg_matviews where schemaname = 'public'), 0, 'no materialized views in public');
select is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'), 0,
          'no public table is in the supabase_realtime publication');

-- 8) integrity guards present --------------------------------------------------------------------------------------
select has_trigger('public', 'audit_log', 'audit_log_no_update', 'audit_log append-only trigger exists');
select has_trigger('public', 'lineup_starters', 'lineup_starters_guard', 'lineup guard trigger exists');
select is((select count(*)::int from public.permission_catalog), 14, 'permission catalog has 14 entries');
select is((select count(*)::int from public.permission_catalog where code = 'roles'), 0, '"roles" is not a grantable permission');

-- INFORMATIONAL (cannot be asserted from SQL): the Data API exposed-schemas list must NOT contain "app".
select diag('MANUAL CHECK: Supabase Dashboard > Settings > API > Exposed schemas must be exactly: public. Also: sign-ups disabled, anonymous sign-ins disabled.');
select diag('exposed schemas per authenticator role: ' || coalesce((select array_to_string(s.setconfig, ' | ')
   from pg_db_role_setting s join pg_roles r on r.oid = s.setrole where r.rolname = 'authenticator' and s.setdatabase = 0), '(not readable here)'));

select * from finish();
rollback;
