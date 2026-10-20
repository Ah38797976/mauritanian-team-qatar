// الواجهة: التوجيه والصفحات. تقرأ من Store فقط (لا تلمس البيانات مباشرة).
// قاعدة أمان العرض: كل قيمة تأتي من بيانات المستخدم تمر عبر esc() أو num() قبل دخولها في HTML.
(function () {
  const St = Store, S = St._bind(), $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
  const num = v => Number.isFinite(+v) ? +v : 0;
  const POS = St.POS, STAT = St.STAT;
  const ini = n => esc(String(n ?? '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join(' '));
  const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200); };
  const SAVED = 'تم الحفظ مؤقتًا (في الذاكرة فقط)';
  const denied = (what) => `<div class="card"><h2>غير مصرح</h2><p>هذه الصفحة (${what}) غير متاحة لدور «${esc(St.ROLES[St.user().role])}». هذه محاكاة واجهة فقط وليست حماية أمنية حقيقية.</p></div>`;
  // لوحة الإدارة مستقلة تمامًا عن الموقع العام (الموقع في الجذر ولا يحمّل أي ملف من هنا). قائمة جانبية واحدة مجمّعة؛ تظهر لكل دور الصفحات المسموحة له فقط.
  // الإخفاء هنا للعرض فقط؛ الصلاحيات الفعلية في Store.can داخل كل صفحة وكل دالة كتابة.
  const PANEL_ROLES = ['founder', 'admin', 'secretary', 'treasurer'];
  const isPanelUser = () => PANEL_ROLES.includes(St.user().role);
  const mg = () => true; // أدوات الإضافة/التعديل/الحذف تظهر لمن يملك الصلاحية (St.can) في صفحته
    const ico = k => `<i class="ic ic-${k}" aria-hidden="true"></i>`; // الأيقونات في admin.css (CSS mask) فلا عناصر SVG في الصفحة
  // [المفتاح، العنوان، شرط الظهور]
  const GROUPS = () => [
    ['', [['dash', 'نظرة عامة', isPanelUser()]]],
    ['الفريق', [['players', 'اللاعبون', St.can('viewPlayers')], ['matches', 'المباريات', St.canViewMatches()], ['stats', 'الإحصائيات', St.canViewMatches()], ['coach', 'التشكيلة والحضور', St.can('lineup') || St.can('viewPlayers')], ['staff', 'الطاقم', St.can('staff') || St.can('viewStaff')]]],
    ['الإدارة', [['users', 'المستخدمون', St.can('users')], ['roles', 'الصلاحيات', St.can('roles')], ['finance', 'المالية', St.can('finance')], ['audit', 'سجل العمليات', St.can('audit')]]],
    ['الموقع والإعدادات', [['site', 'إدارة الموقع العام', isPanelUser() && St.can('settings')], ['settings', 'إعدادات الفريق', isPanelUser()]]]
  ];
  const TITLES = { dash: 'لوحة التحكم', players: 'اللاعبون', player: 'ملف لاعب', matches: 'المباريات والنتائج', stats: 'الإحصائيات', coach: 'التشكيلة والحضور', staff: 'الطاقم', users: 'المستخدمون', roles: 'الصلاحيات', finance: 'المالية', audit: 'سجل العمليات', site: 'إدارة الموقع العام', settings: 'إعدادات الفريق' };
  function navFor(page) {
    return GROUPS().map(([g, items]) => { const its = items.filter(i => i[2]); return its.length ? (g ? `<div class="grp">${esc(g)}</div>` : '') + its.map(([k, l]) => `<a href="#/${k}" class="${page === k || (page === 'player' && k === 'players') ? 'on' : ''}" ${page === k ? 'aria-current="page"' : ''}>${ico(k)}<span>${esc(l)}</span></a>`).join('') : ''; }).join('');
  }
  const route = () => { const h = (location.hash || '#/dash').slice(2).split('/'); return { page: h[0] || 'dash', id: h[1] }; };
  const tw = (label, inner, cls = '') => `<div class="card tw" tabindex="0" role="region" aria-label="${esc(label)}"><table class="${cls}">${inner}</table></div>`;
  // نتيجة المباراة بترتيب الفريقين نفسه الذي يظهر في العنوان (الأول في القراءة من اليمين = الفريق الأول)
  const score = m => {
    const us = num(St.us(m)), th = num(m.them), a = m.home ? ['us', us] : ['them', th], b = m.home ? ['them', th] : ['us', us];
    return `<span class="tag score" role="img" aria-label="النتيجة: نحن ${us}، ${esc(m.opp)} ${th}"><span class="n" data-side="${a[0]}">${a[1]}</span> - <span class="n" data-side="${b[0]}">${b[1]}</span></span>`;
  };
  // العنوان كلوحة نتائج: الفريق الأول (يمين) ثم النتيجة ثم الفريق الثاني، فيجاور كل رقمٍ فريقَه
  const title = m => {
    const u = '<span class="tm" data-t="us">نحن</span>', o = `<span class="tm" data-t="opp">${esc(m.opp)}</span>`, A = m.home ? u : o, B = m.home ? o : u;
    return m.played ? `${A} ${score(m)} ${B}` : `${A} × ${B} <span class="tag">قادمة</span>`;
  };

  function modal(title, body, onSubmit) {
    const d = $('#modal');
    d.innerHTML = `<form method="dialog"><h2>${esc(title)}</h2>${body}<div class="err" id="err"></div><div class="row"><button type="submit" value="ok">حفظ</button><button type="button" class="sec" id="cx">إلغاء</button></div></form>`;
    $('#cx', d).onclick = () => d.close();
    $('form', d).onsubmit = e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const er = onSubmit(f); if (er) $('#err', d).textContent = er; else { d.close(); toast(SAVED); } };
    d.showModal();
  }
  const fld = (l, n, v = '', t = 'text', extra = '') => `<label class="f"><span>${esc(l)}</span><input name="${esc(n)}" type="${esc(t)}" value="${esc(v)}" ${extra}></label>`;
  const sel = (l, n, opts, v) => `<label class="f"><span>${esc(l)}</span><select name="${esc(n)}">${opts.map(o => { const [k, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(t)}</option>`; }).join('')}</select></label>`;
  const tag = (p) => `<span class="tag">#${num(p.num)}</span> <span class="tag">${esc(p.pos)}</span> <span class="tag ${p.status === 'نشط' ? '' : 'bad'}">${esc(p.status)}</span>`;

  // ---- الصفحات ----
  const V = {};
  V.dash = () => {
    // الرؤية الكاملة لمن يملك صلاحية اللاعبين/التشكيلة؛ غيره (مثل مسؤول المباراة) يرى نطاق تكليفه فقط
    if (!St.canSeeRoster() && St.can('finance') && !St.canViewMatches()) {
      return `<h1>لوحة التحكم</h1><div class="note">لا توجد وحدة مالية في هذا النموذج بعد. صلاحيات هذا الدور جاهزة ومحدودة لتُربط لاحقًا بعد الموافقة.</div><div class="card"><h2>المالية</h2><a href="#/finance">فتح صفحة المالية (الأسماء فقط)</a></div>`;
    }
    if (!St.canSeeRoster()) {
      const ms = St.visibleMatches(), next = ms.filter(m => !m.played).sort((a, b) => a.date.localeCompare(b.date))[0];
      return `<h1>لوحة التحكم</h1><div class="note">تعرض اللوحة مبارياتك المكلّف بها فقط.</div><div class="grid"><div class="card kpi"><b>${ms.length}</b>مباريات مكلّف بها</div><div class="card kpi"><b>${ms.filter(m => m.played).length}</b>منها منتهية</div></div>
      <div class="card"><h2>مباراتك القادمة</h2>${next ? `${esc(next.opp)} — ${esc(next.date)} — ${next.home ? 'على أرضنا' : 'خارج الأرض'}` : 'لا توجد مباراة قادمة مكلّف بها'}</div>`;
    }
    const act = S.players.filter(p => p.status === 'نشط').length, total = S.players.filter(p => p.status !== St.ARCH).length, pl = S.matches.filter(m => m.played), next = S.matches.find(m => !m.played);
    const w = pl.filter(m => St.us(m) > m.them).length, ts = St.topScorers();
    const ses = S.sessions.flatMap(s => Object.values(S.att[s.id] || {})), rate = ses.length ? Math.round(ses.filter(Boolean).length / ses.length * 100) : 0;
    const topMain = !ts.players.length ? '-' : ts.players.length === 1 ? esc(ts.players[0].name) : `تعادل (${ts.players.length})`;
    const topSub = !ts.players.length ? 'الهداف (لا أهداف بعد)' : ts.players.length === 1 ? `الهداف (${ts.goals})` : `الهدافون بـ ${ts.goals} لكل منهم: ${ts.players.map(p => esc(p.name)).join('، ')}`;
    return `<h1>لوحة التحكم</h1><div class="grid"><div class="card kpi"><b>${total}</b>لاعبون (${act} نشطون)</div><div class="card kpi"><b>${pl.length}</b>مباريات لُعبت (${w} فوز)</div><div class="card kpi"><b>${rate}%</b>نسبة الحضور</div><div class="card kpi" id="topk"><b>${topMain}</b>${topSub}</div></div>
    <div class="card"><h2>المباراة القادمة</h2>${next ? `${esc(next.opp)} — ${esc(next.date)} — ${next.home ? 'على أرضنا' : 'خارج الأرض'}` : 'لا توجد مباراة قادمة'}</div>
    ${St.can('audit') ? `<div class="card"><h2>آخر العمليات</h2>${St.logs().slice(0, 4).map(l => `<div>• ${esc(l.a)}: ${esc(l.d)} <small>(${esc(l.who)})</small></div>`).join('')}</div>` : ''}`;
  };

  V.players = () => {
    if (!St.can('viewPlayers')) return denied('ملفات اللاعبين');
    return `<h1>اللاعبون</h1><div class="note">ملفات اللاعبين للمسؤولين المخولين فقط — لا توجد قائمة عامة.</div><div class="tools"><input id="q" type="search" placeholder="بحث بالاسم أو الرقم" aria-label="بحث"><select id="fp" aria-label="المركز"><option value="">كل المراكز</option>${POS.map(p => `<option>${esc(p)}</option>`).join('')}</select><select id="fs" aria-label="الحالة"><option value="">كل الحالات</option>${STAT.map(p => `<option>${esc(p)}</option>`).join('')}</select>${St.can('players') && mg() ? '<button id="addp">+ إضافة لاعب</button>' : ''}</div><div class="plist" id="plist"></div>`;
  };
  const drawPlayers = () => {
    const q = $('#q').value.trim(), fp = $('#fp').value, fs = $('#fs').value;
    const r = St.players().filter(p => (!q || p.name.includes(q) || String(p.num) === q) && (!fp || p.pos === fp) && (!fs || p.status === fs));
    $('#plist').innerHTML = r.map(p => `<a class="card pc" href="#/player/${esc(p.id)}"><div class="av">${ini(p.name)}</div><div><b>${esc(p.name)}</b><br>${tag(p)}</div></a>`).join('') || '<p>لا نتائج.</p>';
  };
  // حقلا الهاتف والبريد لا يدخلان النموذج (ولا الـ HTML) إلا لمن يملك صلاحية عرضهما
  const playerForm = p => { const c = St.can('contactPlayers'); p = p || { name: '', num: '', pos: 'وسط', city: '', status: 'نشط', phone: '+000 00 00 00 00', email: 'new@example.invalid' };
    modal(p.id ? 'تعديل لاعب' : 'إضافة لاعب', fld('الاسم', 'name', p.name) + fld('رقم القميص', 'num', p.num, 'number', 'min=1 max=99') + sel('المركز', 'pos', POS, p.pos) + sel('الحالة', 'status', STAT, p.status) + fld('المدينة', 'city', p.city) + (c ? fld('هاتف وهمي', 'phone', p.phone) + fld('بريد وهمي', 'email', p.email) : ''),
      f => St.savePlayer({ id: p.id, name: f.name, num: f.num, pos: f.pos, status: f.status, city: f.city, ...(c ? { phone: f.phone, email: f.email } : {}) })); };

  V.player = id => {
    if (!St.can('viewPlayers')) return denied('ملفات اللاعبين');
    const p = St.player(id); if (!p) return '<h1>اللاعب غير موجود</h1><a href="#/players">رجوع</a>';
    const s = St.stats(id), ed = St.can('players') && mg(), l = St.playerLinks(id), linked = l.events + l.matches > 0;
    const acts = !ed ? '' : linked
      ? `<div class="note" id="dnote">لا يمكن حذف هذا اللاعب نهائيًا لأنه مرتبط بسجلات مباريات (${l.events} حدث، ${l.matches} مشاركة). «إلغاء التسجيل» يُبقي اسمه وإحصائياته في السجل التاريخي ويُخرجه من التشكيلة والحضور الجديد.</div><div class="row"><button id="edp">تعديل</button>${p.status === St.ARCH ? '' : '<button class="dng" id="unregp">إلغاء التسجيل</button>'}</div>`
      : `<div class="row"><button id="edp">تعديل</button><button class="dng" id="delp">حذف</button></div>`;
    return `<a href="#/players">→ رجوع للقائمة</a><div class="card row" style="margin-top:8px"><div class="av big">${ini(p.name)}</div><div><h1 id="pn" style="margin:0">${esc(p.name)}</h1>${tag(p)}<p>المدينة: ${esc(p.city)}${St.can('contactPlayers') ? `<br>هاتف (وهمي): <bdi>${esc(p.phone)}</bdi><br>بريد (وهمي): <bdi>${esc(p.email)}</bdi>` : '<br><small id="cnote">الهاتف والبريد غير متاحين لدورك.</small>'}</p></div></div>
    <div class="grid"><div class="card kpi"><b>${s.apps}</b>مشاركات</div><div class="card kpi"><b>${s.goals}</b>أهداف</div><div class="card kpi"><b>${s.yellow}</b>صفراء</div><div class="card kpi"><b>${s.red}</b>حمراء</div></div>
    <p>في التشكيلة الأساسية: <b>${S.lineup.starters.includes(id) ? 'نعم' : 'لا'}</b></p>${acts}`;
  };

  V.staff = () => { if (!(St.can('staff') || St.can('viewStaff'))) return denied('الطاقم'); const ph = St.can('contactStaff') || St.can('contactStaffTeam'); return `<h1>الطاقم الإداري والفني</h1>${ph ? '' : '<div class="note" id="snote">أرقام هواتف الطاقم غير متاحة لدورك.</div>'}<div class="tools">${St.can('staff') ? '<button id="adds">+ إضافة عضو</button>' : ''}</div>${tw('جدول الطاقم', `<tr><th>الاسم</th><th>الدور</th><th>النوع</th>${ph ? '<th>هاتف (وهمي)</th>' : ''}<th></th></tr>${St.staffList().map(s => `<tr><td>${esc(s.name)}</td><td>${esc(s.role)}</td><td>${esc(s.kind)}</td>${ph ? `<td>${s.phone === undefined ? '—' : `<bdi>${esc(s.phone)}</bdi>`}</td>` : ''}<td>${St.can('staff') ? `<button class="sec" data-es="${esc(s.id)}">تعديل</button> <button class="dng" data-ds="${esc(s.id)}">حذف</button>` : ''}</td></tr>`).join('')}`)}`; };
  V.users = () => { if (!St.can('users')) return denied('المستخدمون'); return `<h1>المستخدمون والأدوار (تجريبي)</h1><div class="note">أضف إداريًا أو أمينًا رياضيًا أو مدربًا أو مسؤول مباراة. يظهر المستخدم الجديد في قائمة «المستخدم التجريبي» أعلى الصفحة. لا توجد كلمات مرور في هذا النموذج.</div><div class="tools"><button id="addu">+ إضافة مستخدم</button></div>${tw('جدول المستخدمين', `<tr><th>الاسم</th><th>الدور</th><th></th></tr>${S.users.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(St.ROLES[u.role])}</td><td>${u.role === 'founder' ? '—' : `<button class="sec" data-eu="${esc(u.id)}">تعديل</button> <button class="dng" data-du="${esc(u.id)}">حذف</button>`}</td></tr>`).join('')}`)}`; };
  const userForm = u => { u = u || { name: '', role: 'admin' }; modal(u.id ? 'تعديل مستخدم' : 'إضافة مستخدم', fld('الاسم', 'name', u.name) + `<label class="f"><span>الدور</span><select name="role">${['admin', 'secretary', 'coach', 'officer', 'treasurer'].map(r => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${esc(St.ROLES[r])}</option>`).join('')}</select></label>`, f => St.saveUser({ id: u.id, name: f.name, role: f.role })); };
  const staffForm = s => { const c = St.can('contactStaff'); s = s || { name: '', role: '', kind: 'فني', phone: '+000 00 11 00 00' }; modal(s.id ? 'تعديل عضو' : 'إضافة عضو', fld('الاسم', 'name', s.name) + fld('الدور', 'role', s.role) + sel('النوع', 'kind', St.KIND, s.kind) + (c ? fld('هاتف وهمي', 'phone', s.phone) : ''), f => St.saveStaff({ id: s.id, name: f.name, role: f.role, kind: f.kind, ...(c ? { phone: f.phone } : {}) })); };

  let sesId = 'x1';
  V.coach = () => {
    if (!St.can('lineup') && !St.can('viewPlayers')) return denied('لوحة المدرب');
    const ed = St.can('lineup'), st = S.lineup.starters, g = pos => st.map(St.player).filter(p => p && p.pos === pos);
    const ses = S.att[sesId] || {}, ros = St.roster(), activeN = S.players.filter(p => p.status === 'نشط').length;
    const incomplete = st.length < 11 ? `<div class="note" id="lnote">التشكيلة غير مكتملة (${st.length}/11)${activeN < 11 ? ` — عدد اللاعبين النشطين المتاحين ${activeN} فقط، لذلك لا يمكن إكمال 11 دون إضافة لاعب نشط أو تغيير حالة لاعب.` : ' — اختر لاعبين إضافيين.'}</div>` : '';
    return `<h1>لوحة المدرب</h1>${ed ? '' : '<div class="note">عرض فقط — لا تملك صلاحية التعديل.</div>'}
    <div class="card"><h2>التشكيلة الأساسية (${esc(S.lineup.formation)}) — <span id="sc">${st.length}</span>/11</h2>${incomplete}<div class="pitch" id="pitch">${['مهاجم', 'وسط', 'مدافع', 'حارس'].map(pos => `<div class="line">${g(pos).map(p => `<span class="dot">${esc(p.name)} #${num(p.num)}</span>`).join('') || '<span class="dot">—</span>'}</div>`).join('')}</div>
    ${ed ? `<h2 style="margin-top:12px">اختيار اللاعبين</h2><div class="row">${ros.map(p => `<label><input type="checkbox" data-st="${esc(p.id)}" ${st.includes(p.id) ? 'checked' : ''} ${p.status !== 'نشط' ? 'disabled' : ''}> ${esc(p.name)} (${esc(p.pos)})</label>`).join('')}</div>` : ''}</div>
    <div class="card"><h2>الحضور</h2><select id="ses" aria-label="الحصة">${S.sessions.map(s => `<option value="${esc(s.id)}" ${s.id === sesId ? 'selected' : ''}>${esc(s.title)} — ${esc(s.date)}</option>`).join('')}</select>${tw('جدول الحضور', `<tr><th>اللاعب</th><th>حاضر</th></tr>${ros.map(p => `<tr><td>${esc(p.name)}</td><td><input type="checkbox" data-at="${esc(p.id)}" ${ses[p.id] ? 'checked' : ''} ${ed ? '' : 'disabled'} aria-label="حضور ${esc(p.name)}"></td></tr>`).join('')}`, 'att').replace('class="card tw"', 'class="tw"')}</div>`;
  };

  V.finance = () => {
    if (!St.can('finance')) return denied('المالية');
    const ps = St.roster();
    return `<h1>المالية</h1><div class="note" id="fnote">لا توجد وحدة مالية في هذا النموذج بعد (لا اشتراكات ولا مبالغ). يعرض هذا الدور أسماء اللاعبين فقط، بلا هاتف أو بريد أو إحصاءات أو مباريات.</div><div class="card"><h2>اللاعبون (الأسماء فقط) — ${ps.length}</h2><ul id="fnames">${ps.map(p => `<li>${esc(p.name)}</li>`).join('')}</ul></div>`;
  };
  V.matches = () => { if (!St.canViewMatches()) return denied('المباريات'); const ms = St.visibleMatches(), scoped = !St.canSeeRoster() && !St.can('matches');
    return `<h1>المباريات والنتائج</h1>${scoped ? '<div class="note">تظهر هنا المباريات المكلّف بها فقط.</div>' : ''}<div class="tools">${St.can('matches') && mg() ? '<button id="addm">+ مباراة</button>' : ''}</div>${[...ms].sort((a, b) => b.date.localeCompare(a.date)).map(m => {
    const off = S.users.find(u => u.id === m.officer), canS = St.can('stats', m), cand = St.eventCandidates(m).map(St.player).filter(Boolean);
    return `<div class="card" data-m="${esc(m.id)}"><h2>${title(m)}</h2><div>${esc(m.date)} — مسؤول المباراة: ${esc(off ? off.name : '-')}</div>
    <ul>${m.events.map(e => `<li>د ${num(e.min)}: ${esc(St.EV[e.type])} — ${esc(St.player(e.pid)?.name)}</li>`).join('') || '<li>لا أحداث</li>'}</ul>
    ${canS ? `<form class="row evf" data-mid="${esc(m.id)}"><select name="pid" aria-label="اللاعب">${cand.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select><select name="type" aria-label="الحدث">${Object.entries(St.EV).map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`).join('')}</select><input name="min" type="number" min="1" max="130" value="1" style="width:80px" aria-label="الدقيقة"><button>إضافة حدث</button></form><div class="row" style="margin-top:6px">أهداف الخصم: <input type="number" min="0" value="${num(m.them)}" data-th="${esc(m.id)}" style="width:70px"> <label><input type="checkbox" data-pl="${esc(m.id)}" ${m.played ? 'checked' : ''}> انتهت</label></div>` : '<small>لا تملك صلاحية إدخال إحصائيات هذه المباراة.</small>'}
    ${St.can('matches') && mg() ? `<button class="sec" data-em="${esc(m.id)}" style="margin-top:6px">تعديل البيانات</button>` : ''}</div>`;
  }).join('')}`; };
  const matchForm = m => { m = m || { opp: '', date: '2026-11-01', home: true, officer: 'u5' };
    modal(m.id ? 'تعديل مباراة' : 'إضافة مباراة', fld('الخصم', 'opp', m.opp) + fld('التاريخ', 'date', m.date, 'date') + sel('الملعب', 'home', [['1', 'على أرضنا'], ['0', 'خارج الأرض']], m.home ? '1' : '0') + sel('مسؤول المباراة', 'officer', S.users.filter(u => u.role === 'officer' || u.role === 'secretary').map(u => [u.id, u.name]), m.officer), f => St.saveMatch({ id: m.id, opp: f.opp, date: f.date, officer: f.officer, home: f.home === '1' })); };

  V.stats = () => {
    if (!St.canViewMatches()) return denied('الإحصائيات');
    const rows = St.statRows(), scoped = !St.canSeeRoster();
    return `<h1>الإحصائيات</h1>${scoped ? '<div class="note">تعرض هذه الصفحة إحصائيات اللاعبين في مبارياتك المكلّف بها فقط.</div>' : ''}${tw('جدول الإحصائيات', `<tr><th>اللاعب</th><th>مشاركات</th><th>أهداف</th><th>صفراء</th><th>حمراء</th></tr>${rows.map(({ p, s }) => `<tr><td>${esc(p.name)}${p.status === St.ARCH ? ' <small>(غير مسجّل)</small>' : ''}</td><td>${s.apps}</td><td>${s.goals}</td><td>${s.yellow}</td><td>${s.red}</td></tr>`).join('')}`)}<small>تُحسب تلقائيًا من أحداث المباريات المنتهية. الترتيب: الأهداف ثم المشاركات (تنازليًا) ثم الاسم أبجديًا؛ وعند تعادل الأهداف تُعرض لوحة التحكم جميع المتعادلين على الصدارة.</small>`;
  };

  V.roles = () => {
    if (!St.can('roles')) return denied('إدارة الأدوار (للمؤسس فقط)');
    const roles = ['admin', 'secretary', 'coach', 'officer', 'treasurer'];
    return `<h1>الأدوار والصلاحيات (تجريبي)</h1><div class="note">المؤسس يملك كل الصلاحيات دائمًا. هذه محاكاة واجهة فقط.</div>${tw('جدول الصلاحيات', `<tr><th>الصلاحية</th>${roles.map(r => `<th>${esc(St.ROLES[r])}</th>`).join('')}</tr>${Object.entries(St.MODS).map(([m, l]) => `<tr><td>${esc(l)}</td>${roles.map(r => `<td><input type="checkbox" data-pm="${r}|${m}" ${(S.perms[r] || []).includes(m) ? 'checked' : ''} ${m === 'users' ? 'disabled title="للمؤسس وحده"' : (r === 'officer' && St.STAFF_MODS.includes(m)) ? 'disabled title="غير متاحة لمسؤول المباراة"' : ''} aria-label="${esc(St.ROLES[r])} ${esc(l)}"></td>`).join('')}</tr>`).join('')}`)}`;
  };
  V.audit = () => !St.can('audit') ? denied('سجل العمليات') : `<h1>سجل العمليات (تجريبي)</h1>${tw('سجل العمليات', `<tr><th>الوقت</th><th>المنفّذ</th><th>الدور</th><th>العملية</th><th>التفاصيل</th></tr>${St.logs().map(l => `<tr><td><bdi>${esc(l.t)}</bdi></td><td>${esc(l.who)}</td><td>${esc(St.ROLES[l.role])}</td><td>${esc(l.a)}</td><td>${esc(l.d)}</td></tr>`).join('')}`)}`;
  V.settings = () => { const t = St.team(), ed = St.can('settings'); return `<h1>إعدادات الفريق</h1><div class="card"><form id="tf">${fld('اسم الفريق', 'name', t.name, 'text', ed ? '' : 'disabled')}${fld('المدينة', 'city', t.city, 'text', ed ? '' : 'disabled')}${fld('اللون الرئيسي', 'color', t.color, 'color', ed ? '' : 'disabled')}${ed ? '<button>حفظ</button>' : '<small>عرض فقط</small>'}</form><p><small>النسخة الأولى: فريق واحد، والبنية تدعم فرقًا متعددة لاحقًا (teams / teamId).</small></p></div>`; };
  // بطاقة «الموقع العام»: كل قسم في الموقع يُدار من هنا ومن صفحته في لوحة التحكم؛ ما لا يُفعَّل لا يظهر ولا يُرسل للموقع
  V.site = () => { if (!isPanelUser() || !St.can('settings')) return denied('إدارة الموقع العام'); const c = St.siteConfig(), SRC = { settings: 'هذه الصفحة', players: 'اللاعبون', staff: 'الطاقم', matches: 'المباريات', stats: 'الإحصائيات' };
    return `<h1>إدارة الموقع العام</h1><div class="note">الموقع العام منفصل تمامًا عن لوحة الإدارة: لا يظهر فيه أي زر أو رابط أو صفحة إدارية. ما تفعّله هنا يظهر فيه، وما تُخفيه يختفي. لا هواتف ولا بريد ولا مالية في الموقع أبدًا. في هذا النموذج الأولي يتحدّث الموقع تلقائيًا في المتصفح نفسه فقط.</div>
    <div class="card"><div class="row between"><h2>محتوى الموقع</h2><a class="btnlink" href="../" target="_blank" rel="noopener">عرض الموقع ↗</a></div><form id="sf"><label class="f"><span>نبذة عن الفريق</span><textarea name="about" rows="3" maxlength="500">${esc(c.about)}</textarea></label><label class="f"><span>إعلان أعلى الموقع (اختياري)</span><input name="announcement" maxlength="200" value="${esc(c.announcement)}"></label>
    <h2>الأقسام الظاهرة في الموقع</h2><div class="secs">${Object.entries(St.siteSections()).map(([k, m]) => `<label class="ck"><input type="checkbox" name="sec_${esc(k)}" ${c.sections[k] ? 'checked' : ''}><span><b>${esc(m.label)}</b><small>تُدار بياناته من: ${esc(SRC[m.src] || '')}</small></span></label>`).join('')}</div><button>حفظ الموقع</button></form></div>`; };

  // ---- العرض والأحداث ----
  const safeColor = c => /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#0b6b3a';
  let lastUser = S.cur;
  function render() {
    // تبديل الدور: أغلق أي نموذج مفتوح وأفرغه حتى لا تبقى بيانات الدور السابق في الصفحة
    if (S.cur !== lastUser) { lastUser = S.cur; const m = $('#modal'); if (m.open) m.close(); m.innerHTML = ''; }
    let { page, id } = route(); const v = $('#view');
    // أدوار التطبيق لا ترى «لوحة التحكم» إطلاقًا: الصفحة الرئيسية ومسار غير معروف يحوّلان إلى شاشتها في التطبيق
    if (!isPanelUser() && (page === 'dash' || !Object.prototype.hasOwnProperty.call(V, page))) { page = St.user().role === 'coach' ? 'coach' : 'matches'; history.replaceState(null, '', '#/' + page); id = undefined; }
    document.documentElement.style.setProperty('--p', safeColor(St.team().color));
    $('#teamName').textContent = St.team().name;
    $('#nav').innerHTML = navFor(page); $('#crumb').textContent = TITLES[Object.prototype.hasOwnProperty.call(V, page) ? page : 'dash'] || ''; document.body.classList.remove('menu-open'); $('#menuBtn').setAttribute('aria-expanded', 'false');
    const us = $('#userSel'); us.innerHTML = S.users.map(u => `<option value="${esc(u.id)}" ${u.id === S.cur ? 'selected' : ''}>${esc(u.name)} — ${esc(St.ROLES[u.role])}</option>`).join('');
    v.innerHTML = (Object.prototype.hasOwnProperty.call(V, page) ? V[page] : V.dash)(id);  // لا نقرأ مفاتيح النموذج الأولي (constructor…)
    if (page === 'players' && St.can('viewPlayers')) drawPlayers();
  }
  const fail = er => { if (er) { toast(er); render(); } return !!er; };
  St.on(render); window.addEventListener('hashchange', render);
  $('#userSel').onchange = e => St.setUser(e.target.value);
  const setMenu = o => { document.body.classList.toggle('menu-open', o); $('#menuBtn').setAttribute('aria-expanded', String(o)); };
  $('#menuBtn').onclick = () => setMenu(!document.body.classList.contains('menu-open'));
  $('#scrim').onclick = () => setMenu(false);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
  const v = $('#view');
  v.addEventListener('input', e => { if (['q'].includes(e.target.id)) drawPlayers(); });
  v.addEventListener('change', e => {
    const t = e.target, d = t.dataset;
    if (t.id === 'fp' || t.id === 'fs') drawPlayers();
    if (t.id === 'ses') { sesId = t.value; render(); }
    if (d.st) { const ids = [...v.querySelectorAll('[data-st]:checked')].map(x => x.dataset.st); if (ids.length > 11) { t.checked = false; return toast('الحد الأقصى 11 لاعبًا'); } fail(St.setStarters(ids)); }
    if (d.at) fail(St.setAtt(sesId, d.at, t.checked));
    if (d.pm) { const [r, m] = d.pm.split('|'); fail(St.setPerm(r, m, t.checked)); }
    if (d.th || d.pl) { const id = d.th || d.pl, c = v.querySelector(`[data-m="${CSS.escape(id)}"]`); fail(St.setResult(id, +c.querySelector('[data-th]').value || 0, c.querySelector('[data-pl]').checked)); }
  });
  v.addEventListener('click', e => {
    const t = e.target, d = t.dataset, id = t.id;
    if (id === 'addp') playerForm();
    if (id === 'edp') playerForm(St.player(route().id));
    if (id === 'delp' && confirm('حذف هذا اللاعب (بيانات وهمية)؟')) { if (!fail(St.delPlayer(route().id))) location.hash = '#/players'; }
    if (id === 'unregp' && confirm('إلغاء تسجيل هذا اللاعب؟ يبقى سجله التاريخي محفوظًا.')) { fail(St.unregisterPlayer(route().id)); }
    if (id === 'adds') staffForm();
    if (id === 'addu') userForm();
    if (d.eu) userForm(S.users.find(x => x.id === d.eu));
    if (d.du && confirm('حذف هذا المستخدم؟')) fail(St.delUser(d.du));
    if (d.es) staffForm(St.staffList().find(x => x.id === d.es));
    if (d.ds && confirm('حذف عضو الطاقم؟')) fail(St.delStaff(d.ds));
    if (id === 'addm') matchForm();
    if (d.em) matchForm(S.matches.find(x => x.id === d.em));
  });
  v.addEventListener('submit', e => {
    if (e.target.classList.contains('evf')) { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); fail(St.addEvent(e.target.dataset.mid, { pid: f.pid, type: f.type, min: +f.min || 1 })); }
    if (e.target.id === 'sf') { e.preventDefault(); const fd = new FormData(e.target), sec = {}; Object.keys(St.siteSections()).forEach(k => { sec[k] = fd.has('sec_' + k); }); fail(St.saveSite({ about: fd.get('about'), announcement: fd.get('announcement'), sections: sec })) || toast(SAVED); }
    if (e.target.id === 'tf') { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const er = St.saveTeam({ name: f.name, city: f.city, color: f.color }); toast(er || SAVED); }
  });
  render();
})();
