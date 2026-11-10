// تشكيلات إضافية: تطابق خانات الواجهة مع 0023 SQL وتطابق إحداثيات الإدارة والموقع العام.
'use strict';
const fs = require('fs'), path = require('path'), root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'supabase-review/sql/0023_more_formations.sql'), 'utf8'), coach = fs.readFileSync(path.join(root, 'admin/live/live-coach.js'), 'utf8'), site = fs.readFileSync(path.join(root, 'site/js/site.js'), 'utf8');
let pass = 0, fail = 0; const ok = (n, c, i) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (!c && i ? ' | ' + i : '')); };
const sf = {}; for (const m of sql.matchAll(/when '([0-9-]+)'\s+then array\[([^\]]+)\]/g)) sf[m[1]] = m[2].replace(/'/g, '').split(',').map(s => s.trim());
const win = {}, UI = new Function('window', coach + ';return window.CoachUI;')(win) || win.CoachUI;
ok('12 خطة في SQL', Object.keys(sf).length === 12, Object.keys(sf).length);
const ORDER = coach.match(/const ORDER = (\[[^\]]*\])/)[1], ord = new Function('return ' + ORDER)();
ok('كل خطة في SQL ظاهرة في الأزرار وبالعكس', JSON.stringify([...ord].sort()) === JSON.stringify(Object.keys(sf).sort()));
for (const f of Object.keys(sf)) {
  const n = f.split('-').map(Number), c = k => sf[f].filter(x => x === k).length, sum = n.reduce((a, b) => a + b, 0);
  ok(`${f}: مجموع الأرقام 10 و11 خانة والحارس واحد`, sum === 10 && sf[f].length === 11 && sf[f][0] === 'gk' && c('gk') === 1);
  ok(`${f}: خانات الواجهة = SQL`, JSON.stringify(UI.FORMS[f]) === JSON.stringify(sf[f]));
  ok(`${f}: 11 إحداثيًا داخل الملعب وبلا تداخل`, UI.XY[f].length === 11 && UI.XY[f].every(([x, y]) => x >= 5 && x <= 95 && y >= 8 && y <= 95) && new Set(UI.XY[f].map(p => p.join())).size === 11);
  ok(`${f}: الدفاع أسفل الوسط أسفل الهجوم`, (() => { const ys = k => UI.XY[f].filter((_, i) => sf[f][i] === k).map(p => p[1]); return Math.min(...ys('def')) > Math.max(...ys('fwd')) && Math.min(...ys('def')) >= Math.max(...ys('mid')); })());
}
const xyOf = src => { const m = src.match(/const (?:XY|XYS) = \{([\s\S]*?)\n  \};/); return m ? JSON.stringify(new Function('return {' + m[1] + '}')()) : null; };
ok('إحداثيات الإدارة = الموقع العام', xyOf(coach) && xyOf(coach) === xyOf(site));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
