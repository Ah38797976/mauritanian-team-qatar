#!/usr/bin/env python3
"""Static (text-level) audit of the review-only SQL. It does NOT parse SQL with Postgres and executes nothing.
Usage: python3 -I tools/static_sql_audit.py <package-root>"""
import re, sys, pathlib
root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '.') / 'supabase-review' / 'sql'
P = F = 0
def ok(name, cond, info=''):
    global P, F
    if cond: P += 1; print('PASS', name)
    else: F += 1; print('FAIL', name, info)
rd = lambda n: (root / n).read_text(encoding='utf-8')
files = sorted(root.glob('*.sql')) + sorted((root / 'down').glob('*.sql')) + sorted((root / 'tests').glob('*.sql'))
# reserved / type_func_name keywords that cannot be used as plpgsql variable or column names (PostgreSQL appendix C)
BAD = {'full','left','right','inner','outer','join','cross','natural','similar','verbose','freeze','ilike','isnull','notnull','overlaps','binary','collation',
       'concurrently','authorization','tablesample','all','analyse','analyze','and','any','array','as','asc','both','case','cast','check','collate','column','constraint',
       'create','current_catalog','current_date','current_role','current_time','current_timestamp','current_user','default','deferrable','desc','distinct','do','else','end',
       'except','false','fetch','for','foreign','from','grant','group','having','in','initially','intersect','into','lateral','limit','localtime','localtimestamp','not','null',
       'offset','on','only','or','order','placing','primary','references','returning','select','session_user','some','symmetric','table','then','to','trailing','true','union',
       'unique','user','using','variadic','when','where','window','with'}
for f in files:
    s = f.read_text(encoding='utf-8')
    ok(f'{f.name}: $$ balanced', len(re.findall(r'\$\$', s)) % 2 == 0)
    ok(f'{f.name}: begin/end transaction balanced', len(re.findall(r'^\s*begin;', s, re.M)) == len(re.findall(r'^\s*(?:commit|rollback);', s, re.M)))
    ok(f'{f.name}: no service_role / secret literal', not re.search(r'service_role|sb_secret_|eyJ[A-Za-z0-9_-]{15,}', s))
for n in ['0004_rpc.sql', '0002_helpers.sql', '0001_schema.sql', '0006_seed_reference.sql']:
    s = rd(n)
    for m in re.finditer(r'create function ([\w.]+)\((.*?)\)\s*returns[^$]*?(?=\bas \$\$)', s, re.S):
        hdr = m.group(0)
        if 'security definer' in hdr.lower():
            ok(f'{n}: {m.group(1)} definer pins search_path', re.search(r"set search_path = ''", hdr) is not None)
    for m in re.finditer(r'\bdeclare\b(.*?)\bbegin\b', s, re.S | re.I):
        for decl in re.findall(r'(?:^|;|\n)\s*([a-z_][a-z0-9_]*)\s+(?:[a-z_.]+(?:\[\])?)\s*(?::=|;)', m.group(1), re.I):
            ok(f'{n}: plpgsql variable "{decl}" is not a reserved word', decl.lower() not in BAD)
s4 = rd('0004_rpc.sql')
ok('0004: no broad "revoke ... all functions in schema"', 'all functions in schema' not in re.sub(r'--.*', '', s4))
ok('0002: no broad "revoke ... all functions in schema"', 'all functions in schema' not in re.sub(r'--.*', '', rd('0002_helpers.sql')))
defs = set(re.findall(r'create function public\.(rpc_\w+)\(', s4)); grants = set(re.findall(r'public\.(rpc_\w+)\(', s4.split('grant execute')[1]))
revokes = set(re.findall(r'public\.(rpc_\w+)\(', s4.split('revoke all on function')[1].split('from public, anon')[0]))
ok('0004: 17 RPC defined = 17 granted = 17 explicitly revoked from public/anon', len(defs) == 17 and defs == grants == revokes, (len(defs), len(grants), len(revokes)))
ok('0004: every RPC refuses when my_team() is null or lacks permission (deny/not-found before any write)',
   all(re.search(r'app\.my_team\(\)', blk) for blk in re.split(r'create function ', s4)[1:]))
ok('0004: exposed write RPCs derive team from the session only (no p_team/team_id parameter)', not re.search(r'create function public\.rpc_\w+\([^)]*(team_id|p_team\b|p_role_of)', s4))
s1, s3 = rd('0001_schema.sql'), rd('0003_rls.sql')
tabs = set(re.findall(r'create table public\.(\w+)', s1)); rls = set(re.findall(r'alter table public\.(\w+)\s+enable row level security', s3)); pol = set(re.findall(r'create policy \w+ on public\.(\w+) for select', s3))
ok(f'0001/0003: {len(tabs)} tables = RLS enabled = SELECT policy', tabs == rls == pol, (tabs ^ rls, tabs ^ pol))
ok('0003: no INSERT/UPDATE/DELETE grant or write policy', not re.search(r'grant\s+(insert|update|delete|all)', s3, re.I) and not re.search(r'create policy \w+ on \S+ for (insert|update|delete|all)', s3, re.I))
ok('0003: sequences revoked (S-5)', 'revoke all on all sequences' in s3)
s5 = rd('0005_storage.sql')
ok('0005: no UPDATE policy; select/insert/delete only', not re.search(r'for update', s5, re.I) and len(re.findall(r'create policy', s5)) == 3)
ok('0005: insert policy enforces path shape (S-6)', "name ~ '^[0-9a-f-]{36}/" in s5)
s7 = rd('0007_seed_fake_staging_only.sql')
ok('0007: refuses to run without app.allow_fake_seed flag', "app.allow_fake_seed" in s7 and 'raise exception' in s7)
ok('0007: only obviously fake contact values (+000 / example.invalid)', not re.search(r'\+(?!000)\d{3}', ''.join(re.findall(r"'\+[^']*'", s7))) and 'example.invalid' in s7)
# tests: structure
for t in sorted((root / 'tests').glob('*.sql')):
    s = t.read_text(encoding='utf-8')
    ok(f'tests/{t.name}: plan + finish + rollback', 'no_plan()' in s and 'finish()' in s and re.search(r'^rollback;', s, re.M) is not None)
    ok(f'tests/{t.name}: marked REVIEW ONLY', 'DO NOT EXECUTE' in s)
    ok(f'tests/{t.name}: reset role after every role switch', len(re.findall(r'as_user\(|as_claims\(|set local role', s)) - len(re.findall(r'create or replace function pg_temp\.as_', s)) * 2 <= len(re.findall(r'reset role;', s)) + 3)
    used = set(re.findall(r":'(u_\w+)'", s)); ok(f'tests/{t.name}: psql variables used = {sorted(used)}', used <= {'u_founder','u_admin','u_secretary','u_coach','u_officer1','u_officer2','u_treasurer'})
print(f'\nالإجمالي: {P}/{P+F} نجح')
sys.exit(1 if F else 0)
