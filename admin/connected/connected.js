// واجهة متصلة للقراءة فقط (C1): تسجيل دخول ثم عرض ما يعيده الخادم لدور المستخدم. تعتمد على طبقة البيانات
// supabase-adapter.v2.js (نسخة مطابقة بايتيًا لـ supabase-review/client/supabase-adapter.v2.review.js) ومكتبة supabase-js المثبّتة.
// لا تكتب بيانات ولا تستدعي أي دالة RPC كتابية. لا تعرض نصوص أخطاء الخادم. كل المحتوى يُدرج عبر textContent فقط.
(function () {
  'use strict';
  var doc = document;
  function $(id) { return doc.getElementById(id); }
  var ROLES = { founder: 'المؤسس', admin: 'الإدارة', secretary: 'الأمين الرياضي', coach: 'المدرب', officer: 'مسؤول المباراة', treasurer: 'الأمين المالي' };
  var PERMS = { viewPlayers: 'مشاهدة ملفات اللاعبين', players: 'إدارة اللاعبين', staff: 'إدارة الطاقم', lineup: 'التشكيلة والحضور', viewStaff: 'مشاهدة الطاقم', contactPlayers: 'هواتف اللاعبين', contactStaff: 'هواتف الطاقم', contactStaffTeam: 'هواتف الطاقم (الفريق)', matches: 'المباريات', stats: 'الإحصاءات', finance: 'المالية', viewNames: 'أسماء اللاعبين', settings: 'الإعدادات', audit: 'سجل العمليات', roles: 'إدارة الصلاحيات' };
  var TIMEOUT_MS = 20000;
  var busy = false;

  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = String(text); return e; }
  function setStatus(msg, kind) { var s = $('status'); s.textContent = msg || ''; s.className = 'status' + (kind ? ' ' + kind : ''); }
  function fatal(msg) { $('loginView').hidden = true; $('mainView').hidden = true; var f = $('fatal'); f.hidden = false; f.textContent = msg; }
  function withTimeout(p, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('timeout')); }, ms);
      p.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }
  function yn(v) { return v ? 'نعم' : 'لا'; }
  function has(v) { return v !== undefined && v !== null && v !== ''; }

  function table(cols, rows) {
    var used = cols.filter(function (c) { return rows.some(function (r) { return has(c.f(r)); }); });
    var wrap = el('div', 'tablewrap'), t = el('table'), head = el('tr');
    used.forEach(function (c) { head.appendChild(el('th', '', c.h)); });
    var th = el('thead'); th.appendChild(head); t.appendChild(th);
    var tb = el('tbody');
    rows.forEach(function (r) { var tr = el('tr'); used.forEach(function (c) { var v = c.f(r); tr.appendChild(el('td', '', has(v) ? v : '')); }); tb.appendChild(tr); });
    t.appendChild(tb); wrap.appendChild(t); return wrap;
  }
  function section(title, cols, rows) {
    var s = el('section', 'card'); s.appendChild(el('h2', '', title + ' (' + rows.length + ')'));
    if (!rows.length) s.appendChild(el('p', 'muted', 'لا بيانات متاحة لدورك أو لا توجد بيانات بعد.')); else s.appendChild(table(cols, rows));
    return s;
  }

  function render() {
    var d = window.TeamData ? window.TeamData.cache() : null, me = d && d.me;
    $('loginView').hidden = !!me; $('mainView').hidden = !me;
    var holder = $('sections'); clear(holder); clear($('perms'));
    if (!me) { $('teamName').textContent = ''; $('roleLabel').textContent = ''; $('displayName').textContent = ''; return; }
    $('teamName').textContent = (me.team && me.team.name) || '';
    $('roleLabel').textContent = ROLES[me.role] || String(me.role || '');
    $('displayName').textContent = me.display_name || '';
    (Array.isArray(me.perms) ? me.perms : []).forEach(function (p) { $('perms').appendChild(el('li', '', PERMS[p] || p)); });
    var roster = window.TeamData.roster();
    holder.appendChild(section('أسماء اللاعبين', [{ h: 'الاسم', f: function (r) { return r.name; } }, { h: 'القميص', f: function (r) { return r.num; } }, { h: 'المركز', f: function (r) { return r.pos; } }, { h: 'الحالة', f: function (r) { return r.status; } }], roster));
    holder.appendChild(section('ملفات اللاعبين', [{ h: 'الاسم', f: function (r) { return r.name; } }, { h: 'القميص', f: function (r) { return r.num; } }, { h: 'المركز', f: function (r) { return r.pos; } }, { h: 'الحالة', f: function (r) { return r.status; } }, { h: 'المدينة', f: function (r) { return r.city; } }, { h: 'الهاتف', f: function (r) { return r.phone; } }, { h: 'البريد', f: function (r) { return r.email; } }], d.players));
    holder.appendChild(section('الطاقم', [{ h: 'الاسم', f: function (r) { return r.name; } }, { h: 'الوظيفة', f: function (r) { return r.role; } }, { h: 'النوع', f: function (r) { return r.kind; } }, { h: 'الهاتف', f: function (r) { return r.phone; } }], d.staff));
    holder.appendChild(section('المباريات', [{ h: 'الخصم', f: function (r) { return r.opp; } }, { h: 'التاريخ', f: function (r) { return r.date; } }, { h: 'الملعب', f: function (r) { return r.home ? 'على أرضنا' : 'خارج'; } }, { h: 'لُعبت', f: function (r) { return yn(r.played); } }, { h: 'أهداف الخصم', f: function (r) { return r.played ? r.them : ''; } }, { h: 'الأحداث', f: function (r) { return r.events.length; } }], d.matches));
    holder.appendChild(section('الإحصاءات', [{ h: 'الاسم', f: function (r) { return r.name; } }, { h: 'المركز', f: function (r) { return r.pos; } }, { h: 'مباريات', f: function (r) { return r.apps; } }, { h: 'أهداف', f: function (r) { return r.goals; } }, { h: 'إنذارات', f: function (r) { return r.yellow; } }, { h: 'طرد', f: function (r) { return r.red; } }], d.stats));
    holder.appendChild(section('التدريبات', [{ h: 'العنوان', f: function (r) { return r.title; } }, { h: 'التاريخ', f: function (r) { return r.date; } }, { h: 'الحضور', f: function (r) { var a = d.att[r.id] || {}; return Object.keys(a).filter(function (k) { return a[k]; }).length; } }], d.sessions));
    holder.appendChild(section('سجل العمليات (آخر 20)', [{ h: 'الوقت', f: function (r) { return r.t; } }, { h: 'المنفِّذ', f: function (r) { return r.who; } }, { h: 'الدور', f: function (r) { return r.role; } }, { h: 'العملية', f: function (r) { return r.a; } }], d.logs.slice(0, 20)));
  }

  function setBusy(v) { busy = v; $('loginBtn').disabled = v; $('refreshBtn').disabled = v; $('signOutBtn').disabled = v; }

  async function onLogin(ev) {
    ev.preventDefault();
    if (busy) return;
    var email = $('email').value.trim(), password = $('password').value;
    $('password').value = '';                          // مسح فوري قبل أي طلب
    setBusy(true); setStatus('جارٍ تسجيل الدخول…', '');
    try {
      var err = await withTimeout(window.TeamData.signIn(email, password), TIMEOUT_MS);
      if (err) { setStatus(err, 'err'); return; }
      setStatus('تم الدخول، جارٍ تحميل البيانات…', '');
      await withTimeout(window.TeamData.refresh(), TIMEOUT_MS);
      if (!window.TeamData.cache().me) {
        await window.TeamData.signOut();
        setStatus('تم تسجيل الدخول لكن لا توجد عضوية فعّالة لهذا الحساب أو تعذّر تحميل البيانات. أُغلقت الجلسة.', 'err');
        render(); return;
      }
      setStatus('تم تحميل البيانات (للقراءة فقط).', 'ok');
    } catch (_) {
      setStatus('تعذّر الاتصال بالخادم أو انتهت المهلة. الإلغاء لا يمحو ما قد يكون أُرسل.', 'err');
    } finally { setBusy(false); render(); }
  }
  async function onRefresh() {
    if (busy) return; setBusy(true); setStatus('جارٍ التحديث…', '');
    try { await withTimeout(window.TeamData.refresh(), TIMEOUT_MS); setStatus('تم التحديث.', 'ok'); }
    catch (_) { setStatus('تعذّر التحديث.', 'err'); } finally { setBusy(false); render(); }
  }
  async function onSignOut() {
    if (busy) return; setBusy(true);
    try { await withTimeout(window.TeamData.signOut(), TIMEOUT_MS); setStatus('تم تسجيل الخروج.', 'ok'); }
    catch (_) { setStatus('تعذّر إتمام تسجيل الخروج من الخادم؛ أُغلقت الجلسة محليًا.', 'err'); } finally { setBusy(false); render(); }
  }

  function hasStoredSession() {
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i) || ''; if (k.indexOf('sb-') === 0 && /-auth-token$/.test(k)) return true; } } catch (_) {}
    return false;
  }

  function boot() {
    var cfg = window.APP_CONFIG;
    if (!cfg) return fatal('إعدادات الاتصال غير موجودة (config.public.js).');
    if (!window.supabase || typeof window.supabase.createClient !== 'function') return fatal('مكتبة supabase-js غير موجودة في الخادم (انظر vendor/README.txt)؛ لا يمكن تسجيل الدخول.');
    if (!window.TeamData) return fatal('طبقة البيانات غير محمّلة.');
    try { window.TeamData.init(cfg); } catch (e) { return fatal('إعدادات الاتصال مرفوضة: ' + (e && e.message ? e.message : 'غير صالحة')); }
    $('loginForm').addEventListener('submit', onLogin);
    $('refreshBtn').addEventListener('click', onRefresh);
    $('signOutBtn').addEventListener('click', onSignOut);
    window.TeamData.on(render);
    render();
    if (hasStoredSession()) { setStatus('جلسة محفوظة: جارٍ التحقق…', ''); withTimeout(window.TeamData.refresh(), TIMEOUT_MS).then(function () { setStatus('', ''); render(); }, function () { setStatus('', ''); }); }
  }
  boot();
})();
