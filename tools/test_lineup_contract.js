#!/usr/bin/env node
// عقد مركز المدرب: يقارن (أ) أسماء دوال RPC ومعاملاتها في admin/live/live-adapter.js بملف SQL 0014 حرفيًا، (ب) الخطط الأربع وترتيب خانات المراكز
// في live-coach.js بـ app.formation_slots في SQL، (ج) تطابق إحداثيات الملعب بين لوحة الإدارة والموقع العام، (د) مفاتيح JSON التي يقبلها rpc_set_lineup.
// الاستعمال:  node tools/test_lineup_contract.js <مسار 0014_lineup_advanced.sql>      (دون شبكة ودون Supabase)
'use strict';
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const sqlPath = process.argv[2]; if (!sqlPath) { console.error('مسار ملف 0014 مطلوب'); process.exit(2); }
const sql = fs.readFileSync(sqlPath, 'utf8'), ad = fs.readFileSync(path.join(root, 'admin/live/live-adapter.js'), 'utf8');
const coach = fs.readFileSync(path.join(root, 'admin/live/live-coach.js'), 'utf8'), site = fs.readFileSync(path.join(root, 'site/js/site.js'), 'utf8');
let pass = 0, fail = 0; const ok = (n, c, i) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (!c && i ? ' | ' + i : '')); };

// (أ) التواقيع
const sig = {};
for (const m of sql.matchAll(/create (?:or replace )?function public\.(rpc_\w+)\(([^)]*)\)/g)) sig[m[1]] = m[2].split(',').map(s => s.trim()).filter(Boolean).map(s => s.split(/\s+/)[0]);
const wanted = { rpc_set_formation: ['p_formation'], rpc_set_lineup: ['p'], rpc_set_captain: ['p_player'], rpc_set_goalkeeper: ['p_player'], rpc_set_starters: ['p_ids'] };
for (const [fn, args] of Object.entries(wanted)) ok(`SQL: ${fn}(${args.join(',')})`, JSON.stringify(sig[fn]) === JSON.stringify(args), JSON.stringify(sig[fn]));
for (const m of ad.matchAll(/write\('(rpc_(?:set_formation|set_lineup|set_captain|set_goalkeeper|set_starters))',\s*\{\s*([^}]*)\}\)/g)) {
  const keys = m[2].split(',').map(s => s.trim().split(':')[0].trim()).filter(Boolean);
  ok(`المحوّل: ${m[1]} يرسل ${keys.join(',')} كما في SQL`, JSON.stringify(keys) === JSON.stringify(sig[m[1]]), JSON.stringify(sig[m[1]]));
}
const used = new Set([...ad.matchAll(/write\('(rpc_set_\w+)'/g)].map(m => m[1]));
for (const fn of ['rpc_set_formation', 'rpc_set_lineup', 'rpc_set_captain', 'rpc_set_goalkeeper']) ok(`المحوّل يستدعي ${fn}`, used.has(fn));

// (ب) الخطط
const sqlForms = {};
for (const m of sql.matchAll(/when '([0-9-]+)'\s+then array\[([^\]]+)\]/g)) sqlForms[m[1]] = m[2].replace(/'/g, '').split(',').map(s => s.trim());
const js = new Function('window', coach + ';return window.CoachUI;'); const win = {}; const UI = js(win) || win.CoachUI;
ok('أربع خطط في SQL', Object.keys(sqlForms).length === 4, Object.keys(sqlForms));
for (const f of Object.keys(sqlForms)) {
  ok(`الخطة ${f}: ترتيب الخانات في الواجهة = SQL`, JSON.stringify(UI.FORMS[f]) === JSON.stringify(sqlForms[f]));
  ok(`الخطة ${f}: 11 خانة والأولى للحارس ووحيدة`, sqlForms[f].length === 11 && sqlForms[f][0] === 'gk' && sqlForms[f].filter(x => x === 'gk').length === 1);
  ok(`الخطة ${f}: 11 إحداثيًا داخل الملعب`, UI.XY[f].length === 11 && UI.XY[f].every(([x, y]) => x >= 5 && x <= 95 && y >= 8 && y <= 95));
}
// مرآة slot_ok (جدول الحقيقة من SQL)
const T = [['gk', 'gk', true], ['gk', 'def', false], ['def', 'gk', false], ['def', 'def', true], ['def', 'mid', true], ['mid', 'def', true], ['mid', 'fwd', true], ['fwd', 'mid', true], ['def', 'fwd', false], ['fwd', 'def', false], ['mid', 'mid', true], ['fwd', 'fwd', true], ['mid', 'gk', false], ['gk', 'mid', false]];
ok('slotOk في الواجهة = جدول slot_ok في SQL (14 حالة)', T.every(([s, p, e]) => UI.slotOk(s, p) === e));
ok('SQL يحوي منطق slot_ok المتوقع', /when p_slot = 'gk' or p_pos = 'gk' then p_slot = p_pos/.test(sql) && /p_slot = p_pos or p_slot = 'mid' or p_pos = 'mid'/.test(sql));
// (د) مفاتيح JSON
ok("rpc_set_lineup يقبل المفاتيح formation/slots/captain/goalkeeper فقط والواجهة ترسل formation وslots فقط", /k not in \('formation', 'slots', 'captain', 'goalkeeper'\)/.test(sql) && /\{ formation: m\.form, slots:/.test(coach));
ok("عنصر الخانة: slot وplayer فقط", /k not in \('slot', 'player'\)/.test(sql) && /\{ slot: \+slot, player \}/.test(coach));
// (ج) الإحداثيات
const xyOf = src => { const m = src.match(/const (?:XY|XYS) = \{([\s\S]*?)\n  \};/); return m ? JSON.stringify(new Function('return {' + m[1] + '}')()) : null; };
ok('إحداثيات الملعب في الإدارة = الموقع العام', xyOf(coach) && xyOf(coach) === xyOf(site));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
