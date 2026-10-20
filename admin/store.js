// الحالة المحلية (في الذاكرة فقط) — طبقة يمكن استبدالها لاحقًا بقاعدة بيانات بعد الموافقة.
// تنبيه أمني: كل فحوص الصلاحيات هنا تعمل في المتصفح، ومن يتحكم في JavaScript يستطيع تجاوزها
// (مثلًا بتعديل Store.S مباشرة). هي لمنع الأخطاء في النموذج التجريبي فقط وليست حماية إنتاجية.
// الإنفاذ الحقيقي يجب أن يكون على الخادم وقاعدة البيانات (RLS/RPC) قبل إدخال أي بيانات حقيقية.
// خصوصية (Task 05): دوال القراءة تُرجع نسخًا مُنقّحة حسب الدور (انظر README)؛ Store.S خام ويبقى كاشفًا لأي سكربت في الصفحة.
// عقد الدوال المعدِّلة: تُرجع '' عند النجاح، أو نص الخطأ عند الرفض (دون أي تغيير في الحالة).
(function () {
  const S = JSON.parse(JSON.stringify(window.DATA));
  delete window.DATA; // لا نسخة خام عامة؛ الحالة الوحيدة هي S داخل هذا الإغلاق
  const subs = [];
  const ROLES = { founder: 'المؤسس', admin: 'الإدارة', secretary: 'الأمين الرياضي', coach: 'المدرب', officer: 'مسؤول المباراة', treasurer: 'الأمين المالي' };
  const MODS = { viewPlayers: 'مشاهدة ملفات اللاعبين', players: 'إدارة اللاعبين', staff: 'إدارة الطاقم', lineup: 'التشكيلة والحضور', viewStaff: 'مشاهدة الطاقم (بلا هواتف)', contactPlayers: 'عرض هاتف وبريد اللاعبين', contactStaff: 'عرض هواتف الطاقم', contactStaffTeam: 'هواتف طاقم الفريق فقط (بلا بريد)', finance: 'البيانات المالية (محدودة)', viewNames: 'مشاهدة أسماء اللاعبين فقط', matches: 'إدارة المباريات', stats: 'إدخال الإحصائيات', settings: 'إعدادات الفريق', audit: 'سجل العمليات', users: 'إدارة المستخدمين' };
  // ---- الموقع العام: كل قسم في الموقع له مصدر واحد في لوحة التحكم (بالصلاحية التي تديره). لا قسم في الموقع بلا مصدر، ولا يظهر شيء خارج هذا السجل ----
  const SITE = { about: { label: 'عن الفريق', src: 'settings' }, squad: { label: 'اللاعبون', src: 'players' }, staff: { label: 'الطاقم', src: 'staff' }, matches: { label: 'المباريات والنتائج', src: 'matches' }, scorers: { label: 'الهدافون', src: 'stats' } };
  const EDITABLE_ROLES = ['admin', 'secretary', 'coach', 'officer', 'treasurer'];
  const STAFF_MODS = ['staff', 'viewStaff', 'contactStaff', 'contactStaffTeam']; // مسؤول المباراة لا يصل إلى بيانات الطاقم أبدًا، حتى لو عُدّلت الصلاحيات مباشرة
  const POS = ['حارس', 'مدافع', 'وسط', 'مهاجم'];
  const ARCH = 'غير مسجّل'; // إلغاء التسجيل: يحفظ السجل التاريخي ولا يحذف اللاعب
  const STAT = ['نشط', 'مصاب', 'موقوف', ARCH];
  const KIND = ['فني', 'إداري'];
  const EV = { goal: 'هدف', yellow: 'بطاقة صفراء', red: 'بطاقة حمراء' };
  const DENY = 'غير مصرح بهذه العملية لدورك الحالي';
  const nextId = (p, arr) => p + (Math.max(0, ...arr.map(x => +String(x.id).slice(p.length) || 0)) + 1);
  const rawPlayer = id => S.players.find(p => p.id === id); // خام: للدوال الداخلية فقط، لا يُعاد للمستدعي
  const user = () => S.users.find(u => u.id === S.cur);
  // تنقيح اللاعب حسب الدور: الحقول الأساسية، والمدينة لمن يشاهد الملفات، والهاتف/البريد لمن خُوّل
  const view = p => {
    const o = { id: p.id, teamId: p.teamId, name: p.name, num: p.num, pos: p.pos, status: p.status };
    if (St.can('viewPlayers')) o.city = p.city;
    if (St.can('contactPlayers')) { o.phone = p.phone; o.email = p.email; }
    return o;
  };
  const cloneMatch = m => ({ ...m, players: m.players.slice(), events: m.events.map(e => ({ ...e })) });
  const calc = (pid, matches) => {
    const ms = matches.filter(m => m.played), ev = ms.flatMap(m => m.events).filter(e => e.pid === pid);
    return { apps: ms.filter(m => m.players.includes(pid)).length, goals: ev.filter(e => e.type === 'goal').length, yellow: ev.filter(e => e.type === 'yellow').length, red: ev.filter(e => e.type === 'red').length };
  };
  let bound = false;
  const links = id => ({ events: S.matches.reduce((n, m) => n + m.events.filter(e => e.pid === id).length, 0), matches: S.matches.filter(m => m.players.includes(id)).length, att: S.sessions.filter(s => S.att[s.id] && id in S.att[s.id]).length });
  const txt = (v, max) => { const s = String(v == null ? '' : v).trim(); return s.length > max ? null : s; };
  const isDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));
  const St = {
    ROLES, MODS, STAFF_MODS, EV, POS, STAT, KIND, ARCH,
    on(f) { subs.push(f); }, emit() { subs.forEach(f => f()); },
    user,
    team() { return S.teams[0]; },
    // ---- الصلاحيات (محاكاة واجهة فقط) ----
    can(m, match) {
      const u = St.user();
      if (u.role === 'founder') return true;
      if (m === 'roles' || m === 'users') return false; // للمؤسس وحده، ولا تُمنح لأي دور مهما عُدّلت S.perms
      if (u.role === 'officer' && STAFF_MODS.includes(m)) return false;
      if (m === 'stats' && u.role === 'officer') return !!match && match.officer === u.id && (S.perms.officer || []).includes('stats');
      return (S.perms[u.role] || []).includes(m);
    },
    guard(m, match) { return St.can(m, match) ? '' : DENY; },
    // من يرى قائمة اللاعبين كاملة؟ (غير ذلك يرى فقط نطاق تكليفه)
    canSeeRoster() { return St.can('viewPlayers') || St.can('lineup'); },
    // صفحات المباريات/الإحصاءات: لمن يرى الفريق أو يدير المباريات أو مسؤول مباراة له إدخال إحصائيات (الأمين المالي لا)
    canViewMatches() { return St.canSeeRoster() || St.can('matches') || (S.perms[user().role] || []).includes('stats'); },
    log(a, d) { const n = new Date(), p = x => String(x).padStart(2, '0'); if (S.logs.length >= 500) S.logs.length = 499; S.logs.unshift({ t: `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())} ${p(n.getHours())}:${p(n.getMinutes())}`, who: St.user().name, role: St.user().role, a, d }); },
    // ---- القراءة المقيّدة بالنطاق ----
    // سياسة الخصوصية (Task 05): القراءة تُرجع نسخًا مُنقّحة حسب الدور، لا كائنات الحالة نفسها.
    // الحقول الأساسية: الاسم والرقم والمركز والحالة. المدينة: لمن يملك «مشاهدة ملفات اللاعبين». الهاتف والبريد: لمن يملك «عرض هاتف وبريد اللاعبين» فقط.
    // لاعب واحد: من لا يرى القائمة كاملة (مسؤول المباراة) لا يصل إلا للاعبي مبارياته المكلّف بها
    player(id) {
      const p = rawPlayer(id); if (!p) return undefined;
      if (St.canSeeRoster() || St.visibleMatches().some(m => m.players.includes(id) || m.events.some(e => e.pid === id) || (!m.played && S.lineup.starters.includes(id)))) return view(p);
      return St.can('viewNames') ? { id: p.id, name: p.name } : undefined; // الأمين المالي: الاسم فقط
    },
    players() { return St.can('viewPlayers') ? S.players.map(view) : []; },
    roster() {
      if (St.canSeeRoster()) return S.players.filter(p => p.status !== ARCH).map(view);
      return St.can('viewNames') ? S.players.filter(p => p.status !== ARCH).map(p => ({ id: p.id, name: p.name })) : [];
    },
    // الطاقم: الأسماء والأدوار لمن يملك مشاهدة/إدارة الطاقم، والهواتف لمن يملك «عرض هواتف الطاقم» فقط
    staffList() {
      if (!(St.can('staff') || St.can('viewStaff'))) return [];
      // الهاتف: لمن يملك «هواتف الطاقم»، أو «هواتف طاقم الفريق» لأعضاء فريقه فقط. لا بريد للطاقم في أي حال.
      const all = St.can('contactStaff'), team = St.can('contactStaffTeam'), tid = user().teamId;
      return S.staff.map(s => { const o = { id: s.id, teamId: s.teamId, name: s.name, role: s.role, kind: s.kind }; if (all || (team && s.teamId === tid)) o.phone = s.phone; return o; });
    },
    logs() { return St.can('audit') ? S.logs.map(l => ({ ...l })) : []; },
    // نسخ لا مراجع حية: لا تعديل للحالة إلا عبر دوال Store المحروسة
    visibleMatches() { return ((St.canSeeRoster() || St.can('matches')) ? S.matches : S.matches.filter(m => m.officer === St.user().id)).map(cloneMatch); },
    // لاعبو مباراة لمسؤول المباراة: المسجلون فيها، وللمباراة القادمة أيضًا التشكيلة الأساسية الحالية
    eventCandidates(m) {
      if (!St.can('stats', m)) return [];
      if (St.canSeeRoster()) return St.roster().map(p => p.id);
      const ids = new Set(m.players); if (!m.played) S.lineup.starters.forEach(i => ids.add(i));
      return [...ids].filter(id => { const p = rawPlayer(id); return p && p.status !== ARCH; });
    },
    // عدّادات الارتباط (عبر كل المباريات والحضور) لمن يرى الفريق فقط؛ غيره أصفار
    playerLinks(id) { return St.canSeeRoster() && St.player(id) ? links(id) : { events: 0, matches: 0, att: 0 }; },
    // ---- اللاعبون ----
    savePlayer(p) {
      const g = St.guard('players'); if (g) return g;
      p = p || {};
      const name = txt(p.name, 60), city = txt(p.city, 60), phone = txt(p.phone, 30), email = txt(p.email, 80), num = Number(p.num);
      if (name === null || city === null || phone === null || email === null) return 'أحد الحقول أطول من الحد المسموح';
      if (!name) return 'الاسم مطلوب';
      if (!Number.isInteger(num) || num < 1 || num > 99) return 'رقم القميص بين 1 و99';
      if (!POS.includes(p.pos)) return 'المركز غير صالح';
      if (!STAT.includes(p.status)) return 'الحالة غير صالحة';
      const cur = p.id ? rawPlayer(p.id) : null;
      if (p.id && !cur) return 'اللاعب غير موجود';
      // الهاتف والبريد: لا يُكتبان إلا لمن يملك صلاحية عرضهما؛ ومن لا يملكها يحتفظ السجل بقيمه الحالية
      const canC = St.can('contactPlayers');
      if (!canC && ['phone', 'email'].some(k => p[k] != null && String(p[k]).trim() !== (cur ? String(cur[k]) : ''))) return DENY;
      if (p.status !== ARCH && S.players.some(x => x.num === num && x.status !== ARCH && x.id !== p.id)) return 'رقم القميص مستخدم';
