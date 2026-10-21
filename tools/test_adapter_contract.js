#!/usr/bin/env node
// Local, offline test of the review-only data adapter against (a) the RPC signatures in 0004_rpc.sql and
// (b) a MOCK supabase client. No network, no Supabase. Usage: node tools/test_adapter_contract.js <package-root>
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(process.argv[2] || '.');
const sqlDir = path.join(root, 'supabase-review/sql'), cliDir = path.join(root, 'supabase-review/client');
let pass = 0, fail = 0; const knownDefects = [];
const ok = (name, cond, info) => { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (info ? ' | ' + info : '')); } };

// ---------- (a) contract: adapter calls vs SQL signatures ----------
const sql = fs.readFileSync(path.join(sqlDir, '0004_rpc.sql'), 'utf8');
const sig = {};
for (const m of sql.matchAll(/create function public\.(rpc_\w+)\(([^)]*)\)/g)) sig[m[1]] = m[2].split(',').map(s => s.trim()).filter(Boolean).map(s => s.split(/\s+/)[0]);
ok('SQL defines 17 rpc_* functions', Object.keys(sig).length === 17, Object.keys(sig).length);

function calls(src) {
  const out = [];
  for (const m of src.matchAll(/(?:write|rpc)\(\s*'(rpc_\w+)'\s*/g)) {
    let i = m.index + m[0].length, keys = [];
    if (src[i] === ',') { i++; while (/\s/.test(src[i])) i++; }
    if (src[i] === '{') {                                   // top-level object literal: split on commas at depth 1
      let depth = 0, seg = '', j = i;
      for (; j < src.length; j++) {
        const ch = src[j];
        if ('{[('.includes(ch)) { depth++; if (depth === 1) continue; }
        else if ('}])'.includes(ch)) { depth--; if (depth === 0) break; }
        if (ch === ',' && depth === 1) { keys.push(seg); seg = ''; continue; }
        seg += ch;
      }
      keys.push(seg);
      keys = keys.map(k => k.trim()).filter(Boolean).map(k => k.split(':')[0].trim());
    }
    out.push([m[1], keys]);
  }
  return out;
}
for (const file of ['supabase-adapter.js', 'supabase-adapter.v2.review.js']) {
  const src = fs.readFileSync(path.join(cliDir, file), 'utf8'), cs = calls(src);
  const used = new Set();
  for (const [name, keys] of cs) {
    used.add(name);
    ok(`${file}: ${name} exists in SQL`, name in sig);
    if (name in sig) ok(`${file}: ${name} argument names match SQL parameters`, JSON.stringify([...keys].sort()) === JSON.stringify([...sig[name]].sort()), `adapter=${keys} sql=${sig[name]}`);
  }
  const unused = Object.keys(sig).filter(n => !used.has(n));
  ok(`${file}: every SQL write RPC is reachable from the adapter`, unused.length === 0, 'unused: ' + unused);
  ok(`${file}: no service_role / sb_secret literal outside the refusal check`, !/sb_secret_[A-Za-z0-9]{10}/.test(src));
}

// ---------- (b) behaviour with a mock client ----------
function load(file, tables) {
  const calls = [], storage = [];
  const authCbs = [];
  const mkQ = t => { const q = { select: () => q, order: () => q, limit: () => q, then: r => r({ data: (tables[t] || []) }) }; return q; };
  const client = {
    rpc: async (name, args) => { calls.push([name, args]); const h = tables.__rpc[name]; return h ? h(args) : { data: '' }; },
    from: t => mkQ(t),
    auth: { onAuthStateChange: cb => authCbs.push(cb), signInWithPassword: async () => ({}), signOut: async () => ({}) },
    storage: { from: () => ({ upload: async (p) => { storage.push(['upload', p]); return {}; }, remove: async p => { storage.push(['remove', p]); return {}; }, createSignedUrl: async () => ({ data: { signedUrl: 'x' } }) }) }
  };
  const sandbox = { window: { supabase: { createClient: () => client } }, atob: s => Buffer.from(s, 'base64').toString('binary'), crypto: { randomUUID: () => 'c0000000-0000-4000-8000-000000000001' }, console };
  vm.createContext(sandbox); vm.runInContext(fs.readFileSync(path.join(cliDir, file), 'utf8'), sandbox);
  return { AD: sandbox.window.TeamData, calls, storage, authCbs };
}
const A = 'a0000000-0000-4000-8000-000000000001';
const base = role => ({
  __rpc: {
    rpc_get_me: () => ({ data: { team: { id: A, name: 't' }, role, perms: [] } }),
    rpc_get_roster: () => ({ data: role === 'treasurer' ? [{ id: 'p1', name: 'n' }] : [{ id: 'p1', name: 'n', num: 1, pos: 'gk', status: 'active' }] }),
    rpc_get_stat_rows: () => ({ data: [] })
  },
  players: [{ id: 'p1', name: 'n', shirt_number: 1, position: 'gk', city: 'c', status: 'active' }],
  player_contacts: role === 'admin' ? [{ player_id: 'p1', phone: '+000', email: 'e@example.invalid' }] : [],
  staff_members: [{ id: 's1', name: 's', title: 't', kind: 'technical', staff_contacts: role === 'admin' ? [{ phone: '+000' }] : [] }],
  team_members: role === 'admin' || role === 'founder' ? [{ user_id: 'u5', display_name: 'o1', role: 'officer', active: true }, { user_id: 'u9', display_name: 'gone', role: 'officer', active: false }] : [],
  matches: [], lineup_starters: [], training_sessions: [{ id: 'x1', title: 'T', session_date: '2026-10-13' }], attendance: [], audit_log: [], player_photos: [{ id: 'ph1', player_id: 'p1', storage_path: A + '/p1/c.jpg', is_primary: true }]
});
const CFG = { SUPABASE_URL: 'https://abcdefgh.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_' + 'x'.repeat(30) };

(async () => {
  // v2 behaviour
  { const { AD } = load('supabase-adapter.v2.review.js', base('admin')); AD.init(CFG); await AD.refresh(); const c = AD.cache();
    ok('v2 F-2: sessions expose `date`', c.sessions[0] && c.sessions[0].date === '2026-10-13' && !('session_date' in c.sessions[0]));
    ok('v2 F-3: players carry teamId', c.players[0].teamId === A);
    ok('v2 F-3: staff carry teamId', c.staff[0].teamId === A);
    ok('v2 F-3: contacts merged for a role that received them', c.players[0].phone === '+000' && c.players[0].email === 'e@example.invalid');
    ok('v2 F-3: staff phone present when server returned it', c.staff[0].phone === '+000');
    ok('v2 F-4: only ACTIVE members, officers listed', AD.officers().length === 1 && AD.officers()[0].id === 'u5');
    ok('v2 F-5: roster() is the server result mapped to Arabic labels', AD.roster()[0].pos === 'حارس' && AD.roster()[0].status === 'نشط'); }
  { const { AD } = load('supabase-adapter.v2.review.js', base('secretary')); AD.init(CFG); await AD.refresh(); const c = AD.cache();
    ok('v2: no phone/email property invented when the server returned none', !('phone' in c.players[0]) && !('email' in c.players[0]) && !('phone' in c.staff[0]));
    ok('v2 F-4: no members for a role that cannot read them', AD.officers().length === 0); }
  { const { AD } = load('supabase-adapter.v2.review.js', base('treasurer')); AD.init(CFG); await AD.refresh();
    ok('v2 F-5: names-only roster stays names-only (no undefined pos/status)', JSON.stringify(AD.roster()[0]) === JSON.stringify({ id: 'p1', name: 'n' }), JSON.stringify(AD.roster()[0])); }
  // F-5 contract (docs-only fix): the adapter's roster() is the SERVER-SCOPED list, which for a match officer is NOT Store.roster() ([]).
  { const t = base('officer'); t.players = [];                                  // RLS: an officer has no direct read of `players`
    t.__rpc.rpc_get_roster = () => ({ data: [{ id: 'p1', name: 'n', num: 1, pos: 'gk', status: 'active' }] });   // own-match players only
    const { AD } = load('supabase-adapter.v2.review.js', t); AD.init(CFG); await AD.refresh();
    ok('v2 F-5 officer: roster() is the server own-match list, labels mapped, no city', AD.roster().length === 1 && AD.roster()[0].pos === 'حارس' && AD.roster()[0].status === 'نشط' && !('city' in AD.roster()[0]), JSON.stringify(AD.roster()));
    ok('v2 F-5 officer: cache.players is empty (only the server roster carries the officer\'s player names)', AD.cache().players.length === 0 && AD.roster()[0].name === 'n');
    t.__rpc.rpc_get_roster = () => ({ data: [] });
    const r2 = load('supabase-adapter.v2.review.js', t); r2.AD.init(CFG); await r2.AD.refresh();
    ok('v2 F-5 officer: an empty server list stays empty (the adapter never re-derives scope)', Array.isArray(r2.AD.roster()) && r2.AD.roster().length === 0); }
  // F-5 contract: static cross-checks of the three sources that define it (text only; does NOT prove PostgreSQL/RLS behaviour)
  { const rd = f => fs.readFileSync(path.join(root, f), 'utf8'), has = (f, re) => re.test(rd(f));
    ok('F-5 static: SQL officer branch of rpc_get_roster exists (own-match players)', /match officer: only players of their own matches/.test(sql));
    ok('F-5 static: rls_matrix expects a non-empty scoped roster for officer1', has('supabase-review/sql/tests/rls_matrix.sql', /officer1: scoped roster returned/));
    ok('F-5 static: rls_matrix expects NO direct players read for an officer', has('supabase-review/sql/tests/rls_matrix.sql', /officer: no direct player table access/));
    ok('F-5 static: prototype privacy test expects Store.roster() == [] for an officer', has('mauritanian-team-prototype/tests/run_tests_privacy.py', /ro'\] == \[\]/));
    ok('F-5 static: Store.roster() returns [] without viewPlayers/lineup/viewNames', /roster\(\) \{\s*\n\s*if \(St\.canSeeRoster\(\)\)[^\n]*\n\s*return St\.can\('viewNames'\)[^\n]*: \[\];/.test(rd('admin/js/store.js')));
    ok('F-5 docs: docs/06 documents the F-5 contract', has('supabase-review/docs/06-appjs-async-refactor-plan.md', /عقد F-5/)); }
  { const t = base('secretary'); const { AD, calls } = load('supabase-adapter.v2.review.js', t); AD.init(CFG); await AD.refresh(); calls.length = 0;
    await AD.savePlayer({ id: 'p1', name: 'n', num: 1, pos: 'حارس', status: 'نشط', city: 'c' });
    const sent = calls.find(x => x[0] === 'rpc_save_player')[1].p;
    ok('v2: contact keys NOT sent when the caller did not supply them', !('phone' in sent) && !('email' in sent), JSON.stringify(sent));
    ok('v2: labels converted to DB codes', sent.pos === 'gk' && sent.status === 'active');
    calls.length = 0; await AD.savePlayer({ id: 'p1', name: 'n', num: 1, pos: 'حارس', status: 'نشط', city: 'c', phone: '+1' });
    ok('v2: contact keys sent only when supplied', 'phone' in calls.find(x => x[0] === 'rpc_save_player')[1].p); }
  { const t = base('admin'); t.__rpc.rpc_save_player = () => ({ data: 'غير مصرح بهذه العملية لدورك الحالي' });
    const { AD } = load('supabase-adapter.v2.review.js', t); AD.init(CFG); await AD.refresh();
    ok('v2: server text denial is passed through unchanged', (await AD.savePlayer({ name: 'x', num: 1, pos: 'حارس', status: 'نشط' })) === 'غير مصرح بهذه العملية لدورك الحالي'); }
  { const t = base('admin'); t.__rpc.rpc_save_player = () => ({ error: { code: '42501' } });
    const { AD } = load('supabase-adapter.v2.review.js', t); AD.init(CFG); await AD.refresh();
    ok('v2: Postgres 42501 maps to the Arabic deny text', (await AD.savePlayer({ name: 'x', num: 1, pos: 'حارس', status: 'نشط' })) === 'غير مصرح بهذه العملية لدورك الحالي');
    t.__rpc.rpc_save_player = () => ({ error: { code: '08006' } });
    ok('v2: other errors map to the network text', (await AD.savePlayer({ name: 'x', num: 1, pos: 'حارس', status: 'نشط' })).startsWith('تعذّر')); }
  { const t = base('admin'); const { AD, storage } = load('supabase-adapter.v2.review.js', t); AD.init(CFG); await AD.refresh();
    await AD.uploadPhoto('p1', { type: 'image/jpeg', size: 1000 }, true);
    const up = storage.find(s => s[0] === 'upload');
    ok('v2: upload path starts with the SERVER team id and the player id', up && up[1].startsWith(A + '/p1/') && up[1].endsWith('.jpg'), up && up[1]);
    ok('v2: wrong type refused client-side', (await AD.uploadPhoto('p1', { type: 'image/gif', size: 10 })) !== '');
    ok('v2: oversize refused client-side', (await AD.uploadPhoto('p1', { type: 'image/png', size: 3000000 })) !== '');
    storage.length = 0; await AD.deletePhoto('ph1');
    ok('v2: delete removes the path taken from server rows', storage.some(s => s[0] === 'remove' && s[1][0] === A + '/p1/c.jpg'));
    ok('v2: deleting an unknown photo id does nothing', (await AD.deletePhoto('nope')) !== ''); }
  { const t = base('admin'); const { AD, authCbs } = load('supabase-adapter.v2.review.js', t); AD.init(CFG); await AD.refresh();
    let n = 0; AD.on(() => n++); authCbs[0]('SIGNED_OUT', null);
    ok('v2: auth sign-out event clears the cache and notifies the UI', AD.cache().me === null && AD.cache().players.length === 0 && n >= 1); }
  // keys / url
  { const { AD } = load('supabase-adapter.v2.review.js', base('admin')); const bad = k => { try { AD.init({ ...CFG, SUPABASE_PUBLISHABLE_KEY: k }); return false; } catch (e) { return true; } };
    const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=/g, '');
    ok('keys: sb_secret_ refused', bad('sb_secret_' + 'a'.repeat(30)));
    ok('keys: JWT with role service_role refused', bad('h.' + b64({ role: 'service_role' }) + '.s'));
    ok('keys: placeholder refused', bad('__SET_AFTER_APPROVAL__'));
    ok('keys: JWT with role anon accepted', !bad('h.' + b64({ role: 'anon' }) + '.s'));
    let urlBad = false; try { AD.init({ ...CFG, SUPABASE_URL: 'http://evil.example' }); } catch (_) { urlBad = true; }
    ok('url: non-https / non-supabase.co refused', urlBad); }

  // v1: confirm the review findings really exist (these are DEFECT CONFIRMATIONS, reported separately, not failures)
  { const { AD } = load('supabase-adapter.js', base('admin')); AD.init(CFG); await AD.refresh(); const c = AD.cache();
    const d = (id, cond, txt) => { knownDefects.push([id, cond, txt]); };
    d('F-2', c.sessions[0] && c.sessions[0].session_date === '2026-10-13' && !('date' in c.sessions[0]), 'v1 sessions use session_date, UI reads date');
    d('F-3a', c.players[0].teamId === undefined, 'v1 players have no teamId');
    d('F-3b', c.players[0].phone === undefined && c.contacts.p1 && c.contacts.p1.phone === '+000', 'v1 keeps contacts in a separate map, not on the player');
    d('F-4', !('members' in c) && !('users' in c), 'v1 never reads team_members');
    d('F-5', true, 'v1 roster() semantics undefined (no accessor); officer scope differs from Store.roster()'); }
  console.log('\nV1 DEFECT CONFIRMATIONS (expected true = finding is real):');
  for (const [id, cond, txt] of knownDefects) console.log(`${cond ? 'CONFIRMED' : 'NOT-REPRODUCED'} ${id}: ${txt}`);
  console.log(`\nالإجمالي: ${pass}/${pass + fail} نجح`);
  process.exit(fail ? 1 : 0);
})();
