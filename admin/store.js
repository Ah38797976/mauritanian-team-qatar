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
      const rec = { name, num, pos: p.pos, city, status: p.status, phone: canC ? phone : (cur ? cur.phone : ''), email: canC ? email : (cur ? cur.email : '') };
      const cc = canC && cur && (rec.phone !== cur.phone || rec.email !== cur.email) ? ' (تغيير بيانات التواصل)' : ''; // دون تسجيل القيم نفسها
      if (cur) { Object.assign(cur, rec); if (rec.status === ARCH) S.lineup.starters = S.lineup.starters.filter(x => x !== cur.id); St.log('تعديل لاعب', name + cc); }
      else { S.players.push({ id: nextId('p', S.players), teamId: St.team().id, ...rec }); St.log('إضافة لاعب', name); }
      St.emit(); return '';
    },
    // سياسة الحذف: لا يُحذف نهائيًا إلا لاعب بلا أحداث ولا مشاركات في مباريات. غير ذلك: إلغاء تسجيل يحفظ السجل.
    delPlayer(id) {
      const g = St.guard('players'); if (g) return g;
      const p = rawPlayer(id); if (!p) return 'اللاعب غير موجود';
      const l = links(id);
      if (l.events || l.matches) return `لا يمكن حذف لاعب مرتبط بسجلات مباريات (${l.events} حدث، ${l.matches} مشاركة). استخدم «إلغاء التسجيل» للحفاظ على التاريخ.`;
      S.players = S.players.filter(x => x.id !== id);
      S.lineup.starters = S.lineup.starters.filter(x => x !== id);
      S.sessions.forEach(s => { if (S.att[s.id]) delete S.att[s.id][id]; });
      St.log('حذف لاعب', l.att ? `${p.name} (وأُزيلت ${l.att} سجلات حضور)` : p.name); St.emit(); return '';
    },
    unregisterPlayer(id) {
      const g = St.guard('players'); if (g) return g;
      const p = rawPlayer(id); if (!p) return 'اللاعب غير موجود';
      if (p.status === ARCH) return 'اللاعب غير مسجّل أصلًا';
      p.status = ARCH; S.lineup.starters = S.lineup.starters.filter(x => x !== id);
      St.log('إلغاء تسجيل لاعب', `${p.name} (السجل التاريخي محفوظ)`); St.emit(); return '';
    },
    // ---- الطاقم ----
    saveStaff(s) {
      const g = St.guard('staff'); if (g) return g;
      s = s || {};
      const name = txt(s.name, 60), role = txt(s.role, 40), phone = txt(s.phone, 30);
      if (name === null || role === null || phone === null) return 'أحد الحقول أطول من الحد المسموح';
      if (!name) return 'الاسم مطلوب';
      if (!KIND.includes(s.kind)) return 'النوع غير صالح';
      const cur = s.id ? S.staff.find(x => x.id === s.id) : null;
      if (s.id && !cur) return 'عضو الطاقم غير موجود';
      const canC = St.can('contactStaff');
      if (!canC && s.phone != null && String(s.phone).trim() !== (cur ? String(cur.phone) : '')) return DENY;
      const rec = { name, role, kind: s.kind, phone: canC ? phone : (cur ? cur.phone : '') };
      const cc = canC && cur && rec.phone !== cur.phone ? ' (تغيير الهاتف)' : '';
      if (cur) { Object.assign(cur, rec); St.log('تعديل عضو طاقم', name + cc); } else { S.staff.push({ id: nextId('s', S.staff), teamId: St.team().id, ...rec }); St.log('إضافة عضو طاقم', name); }
      St.emit(); return '';
    },
    delStaff(id) {
      const g = St.guard('staff'); if (g) return g;
      const s = S.staff.find(x => x.id === id); if (!s) return 'عضو الطاقم غير موجود';
      S.staff = S.staff.filter(x => x.id !== id); St.log('حذف عضو طاقم', s.name); St.emit(); return '';
    },
    // ---- المباريات ----
    saveMatch(m) {
      const g = St.guard('matches'); if (g) return g;
      m = m || {};
      const opp = txt(m.opp, 80);
      if (opp === null) return 'اسم الخصم أطول من الحد المسموح';
      if (!opp || !isDate(m.date)) return 'الخصم والتاريخ مطلوبان';
      if (typeof m.home !== 'boolean') return 'الملعب غير صالح';
      if (!S.users.some(u => u.id === m.officer && (u.role === 'officer' || u.role === 'secretary'))) return 'مسؤول المباراة غير صالح';
      const cur = m.id ? S.matches.find(x => x.id === m.id) : null;
      if (m.id && !cur) return 'المباراة غير موجودة';
      const rec = { opp, date: m.date, home: m.home, officer: m.officer };
      if (cur) Object.assign(cur, rec); else S.matches.push({ id: nextId('m', S.matches), ...rec, played: false, them: 0, players: [], events: [] });
      St.log('حفظ مباراة', opp); St.emit(); return '';
    },
    addEvent(mid, ev) {
      const m = S.matches.find(x => x.id === mid); if (!m) return 'المباراة غير موجودة';
      const g = St.guard('stats', m); if (g) return g;
      ev = ev || {};
      const p = rawPlayer(ev.pid), min = Number(ev.min);
      if (!p) return 'اللاعب غير موجود';
      if (!EV[ev.type]) return 'نوع الحدث غير صالح';
      if (!Number.isInteger(min) || min < 1 || min > 130) return 'الدقيقة بين 1 و130';
      if (p.status === ARCH) return 'لا يمكن تسجيل حدث للاعب غير مسجّل';
      if (!St.eventCandidates(m).includes(p.id)) return 'اللاعب خارج نطاق هذه المباراة';
      m.events.push({ pid: p.id, type: ev.type, min }); if (!m.players.includes(p.id)) m.players.push(p.id);
      St.log('إدخال حدث مباراة', `${EV[ev.type]} — ${p.name} (د ${min}) ضد ${m.opp}`); St.emit(); return '';
    },
    setResult(mid, them, played) {
      const m = S.matches.find(x => x.id === mid); if (!m) return 'المباراة غير موجودة';
      const g = St.guard('stats', m); if (g) return g;
      them = Number(them);
      if (!Number.isInteger(them) || them < 0 || them > 99) return 'أهداف الخصم بين 0 و99';
      if (typeof played !== 'boolean') return 'حالة المباراة غير صالحة';
      m.them = them; m.played = played;
      St.log('تحديث نتيجة', `${m.opp}: ${played ? 'انتهت' : 'لم تُلعب'}، أهداف الخصم ${them}`); St.emit(); return '';
    },
    us: m => m.events.filter(e => e.type === 'goal').length,
    // الإحصاءات مقيّدة بالنطاق: من لا يرى الفريق كاملًا يحسبها من مبارياته المرئية فقط
    stats(pid, matches) { return calc(pid, matches || (St.canSeeRoster() ? S.matches : St.visibleMatches())); },
    // صفوف الإحصائيات حسب النطاق. الترتيب المعلن: الأهداف ثم المشاركات (تنازليًا) ثم الاسم أبجديًا.
    statRows() {
      const full = St.canSeeRoster(), ms = full ? null : St.visibleMatches();
      const ids = full ? S.players.map(p => p.id) : [...new Set(ms.flatMap(m => [...m.players, ...m.events.map(e => e.pid)]))];
      return ids.map(St.player).filter(Boolean).map(p => ({ p, s: St.stats(p.id, ms) }))
        .filter(({ p, s }) => p.status !== ARCH || s.apps + s.goals + s.yellow + s.red > 0)
        .sort((a, b) => b.s.goals - a.s.goals || b.s.apps - a.s.apps || a.p.name.localeCompare(b.p.name, 'ar'));
    },
    // الهداف: كل من يملك أعلى عدد أهداف (عند التعادل تُعرض أسماء المتعادلين جميعًا). صفر أهداف = لا هداف.
    topScorers() {
      const rows = St.statRows(), max = rows.length ? rows[0].s.goals : 0;
      return { goals: max, players: max > 0 ? rows.filter(r => r.s.goals === max).map(r => r.p) : [] };
    },
    // ---- التشكيلة والحضور ----
    setStarters(ids) {
      const g = St.guard('lineup'); if (g) return g;
      if (!Array.isArray(ids) || new Set(ids).size !== ids.length) return 'قائمة التشكيلة غير صالحة';
      if (ids.length > 11) return 'الحد الأقصى 11 لاعبًا';
      for (const id of ids) {
