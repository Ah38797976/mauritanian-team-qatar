// طبقة بيانات اللوحة المتصلة: تحافظ على واجهة Store نفسها التي تقرأ منها app.js، لكن القراءة من ذاكرة TeamData (ما أعاده الخادم لدور المستخدم)
// والكتابة عبر دوال RPC في Supabase. الحماية الفعلية في الخادم (RLS/RPC)؛ ما هنا للعرض وتجنّب أخطاء واضحة فقط. كل دوال الكتابة تُرجع Promise بنص خطأ ('' = نجاح).
(function () {
  'use strict';
  const TD = window.TeamData;
  const ROLES = { founder: 'المؤسس', admin: 'الإدارة', secretary: 'الأمين الرياضي', coach: 'المدرب', officer: 'مسؤول المباراة', treasurer: 'الأمين المالي' };
  const STAFF_MODS = ['staff', 'viewStaff', 'contactStaff', 'contactStaffTeam'];
  const POS = ['حارس', 'مدافع', 'وسط', 'مهاجم'], ARCH = 'غير مسجّل', STAT = ['نشط', 'مصاب', 'موقوف', ARCH], KIND = ['فني', 'إداري'];
  const EV = { goal: 'هدف', yellow: 'بطاقة صفراء', red: 'بطاقة حمراء' };
  const DENY = 'غير مصرح بهذه العملية لدورك الحالي';
  const subs = [];
  const c = () => TD.cache();
  const me = () => c().me || { role: '', perms: [], team: {}, display_name: '' };
  const perms = () => { const m = me(); return Array.isArray(m.perms) ? m.perms : []; };

  // الحالة التي تقرأها app.js: كلها عرض حيّ لذاكرة الخادم (بلا نسخ تعديل محلية)
  const S = {
    get players() { return c().players || []; },
    get matches() { return c().matches || []; },
    get matchExt() { return c().matchExt === true; },
    get sessions() { return c().sessions || []; },
    get att() { return c().att || {}; },
    // starters تبقى مصفوفة معرّفات كما كانت (بقية الشاشات تعتمد عليها)؛ الباقي من 0014: v2=true/false/null(غير معروف: خطأ في القراءة)
    get lineup() { const i = c().lineupInfo || {}; return { starters: c().lineup || [], formation: i.formation || '', slots: i.slots || {}, captain: i.captain || '', gk: i.gk || '', v2: i.v2 === undefined ? null : i.v2, err: i.err || '' }; },
    get users() { return (c().members || []).map(m => ({ id: m.user_id || m.id, name: m.display_name || m.name || '', role: m.role })); },
    get logs() { return c().logs || []; },
    get staff() { return c().staff || []; },
    get cur() { return me().role; },
    perms: {}
  };

  const calc = (pid, matches) => { let apps = 0, goals = 0, yellow = 0, red = 0; matches.filter(m => m.played).forEach(m => { if (m.players.includes(pid) || m.events.some(e => e.pid === pid)) apps++; m.events.forEach(e => { if (e.pid !== pid) return; if (e.type === 'goal') goals++; else if (e.type === 'yellow') yellow++; else if (e.type === 'red') red++; }); }); return { apps, goals, yellow, red }; };
  const links = id => ({ events: S.matches.reduce((n, m) => n + m.events.filter(e => e.pid === id).length, 0), matches: S.matches.filter(m => m.players.includes(id)).length, att: S.sessions.filter(s => S.att[s.id] && id in S.att[s.id]).length });
  const cloneMatch = m => ({ ...m, players: m.players.slice(), events: m.events.map(e => ({ ...e })) });

  const St = {
    ROLES, STAFF_MODS, POS, STAT, KIND, ARCH, EV,
    _bind: () => S,
    on(f) { subs.push(f); }, emit() { subs.forEach(f => f()); },
    user() { const m = me(); return { id: '', name: m.display_name || '', role: m.role, teamId: (m.team || {}).id }; },
    team() { const t = me().team || {}; return { id: t.id, name: t.name || '', city: t.city || '', color: t.color || '#0b6b3a' }; },
    can(m, match) {
      const r = me().role; if (!r) return false;
      if (m === 'users') return false;                                   // لا إدارة مستخدمين في هذه النسخة
      if (r === 'founder') return true;
      if (r === 'officer' && STAFF_MODS.includes(m)) return false;
      return perms().includes(m);
    },
    canSeeRoster() { return St.can('viewPlayers') || St.can('lineup'); },
    canViewMatches() { return St.canSeeRoster() || St.can('matches') || perms().includes('stats'); },
    player(id) {
      const full = S.players.find(p => p.id === id); if (full) return full;
      const r = (TD.roster() || []).find(p => p.id === id); return r || undefined;
    },
    players() { return St.can('viewPlayers') ? S.players : []; },
    roster() { return St.canSeeRoster() ? S.players.filter(p => p.status !== ARCH) : (TD.roster() || []); },
    staffList() { return (St.can('staff') || St.can('viewStaff')) ? S.staff : []; },
    logs() { return St.can('audit') ? S.logs.map(l => ({ ...l })) : []; },
    visibleMatches() { return S.matches.map(cloneMatch); },
    eventCandidates(m) {
      if (!St.can('stats', m)) return [];
      return (TD.roster() || []).filter(p => p.status !== ARCH).map(p => p.id);
    },
    playerLinks(id) { return St.canSeeRoster() ? links(id) : { events: 0, matches: 0, att: 0 }; },
    stats(pid, matches) { return calc(pid, matches || S.matches); },
    us: m => m.events.filter(e => e.type === 'goal').length,
    statRows() { return (c().stats || []).map(r => ({ p: { id: r.id, name: r.name, num: r.num, pos: r.pos, status: r.status }, s: { apps: +r.apps || 0, goals: +r.goals || 0, yellow: +r.yellow || 0, red: +r.red || 0 } })); },
    topScorers() { const rows = St.statRows(), max = rows.length ? Math.max(...rows.map(r => r.s.goals)) : 0; return { goals: max, players: max > 0 ? rows.filter(r => r.s.goals === max).map(r => r.p) : [] }; },
    // ---- الكتابة (كلها عبر الخادم) ----
    savePlayer: p => TD.savePlayer(p),
    delPlayer: id => TD.delPlayer(id),
    unregisterPlayer: id => TD.unregisterPlayer(id),
    saveStaff: s => TD.saveStaff(s),
    delStaff: id => TD.delStaff(id),
    saveMatch: m => TD.saveMatch(m),
    addEvent: (mid, ev) => TD.addEvent(mid, ev),
    setResult: (mid, them, played) => TD.setResult(mid, them, played),
    setStarters: ids => TD.setStarters(ids),
    // مركز المدرب: الواجهة لا تتجاوز الصلاحية (الخادم هو الحاسم)، لكن لا نُرسل أصلًا ما لا يحق للمستخدم
    setFormation: f => St.can('lineup') ? TD.setFormation(f) : Promise.resolve(DENY),
    setLineup: p => St.can('lineup') ? TD.setLineup(p) : Promise.resolve(DENY),
    setCaptain: id => St.can('lineup') ? TD.setCaptain(id) : Promise.resolve(DENY),
    setGoalkeeper: id => St.can('lineup') ? TD.setGoalkeeper(id) : Promise.resolve(DENY),
    getFinance: () => TD.getFinance(),
    saveFinance: e => TD.saveFinance(e),
    delFinance: id => TD.delFinance(id),
    saveSession: x => TD.saveSession(x),
    delSession: id => TD.delSession(id),
    setAtt: (sid, pid, v) => TD.setAtt(sid, pid, v),
    // الحضور: قبل 0014 كان يتبع صلاحية lineup؛ بعده صلاحية attendance مستقلة. الواجهة القديمة (v2 غير مفعّل) تبقى على lineup حتى لا تنكسر.
    canAttendance() { const v = (c().lineupInfo || {}).v2; return v === true ? St.can('attendance') : St.can('lineup'); },
    saveTeam: t => TD.saveTeam(t)
  };
  TD.on(() => St.emit());
  window.Store = St;
})();
