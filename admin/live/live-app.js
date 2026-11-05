// النسخة المتصلة (live): مبنية من app.js مع طبقة بيانات Supabase. لا مستخدمون ولا موقع عام ولا إدارة أدوار هنا.
// الواجهة: التوجيه والصفحات. تقرأ من Store فقط (لا تلمس البيانات مباشرة).
// قاعدة أمان العرض: كل قيمة تأتي من بيانات المستخدم تمر عبر esc() أو num() قبل دخولها في HTML.
(function () {
  const St = Store, S = St._bind(), $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
  const num = v => Number.isFinite(+v) ? +v : 0;
  const POS = St.POS, STAT = St.STAT;
  const ini = n => esc(String(n ?? '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join(' '));
  // صورة الشخص إن وُجدت (data URL مُتحقَّق منه في Store) وإلا الأحرف الأولى
  const avatar = (p, big) => `<div class="av${big ? ' big' : ''}">${p.photo ? `<img src="${esc(p.photo)}" alt="${esc(p.name)}">` : ini(p.name)}</div>`;
  const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200); };
  const SAVED = 'تم الحفظ';
  const TD = window.TeamData;
  const denied = (what) => `<div class="card"><h2>غير مصرح</h2><p>هذه الصفحة (${what}) غير متاحة لدور «${esc(St.ROLES[St.user().role])}». الصلاحيات تُفرض في الخادم.</p></div>`;
  // لوحة الإدارة مستقلة تمامًا عن الموقع العام (الموقع في الجذر ولا يحمّل أي ملف من هنا). قائمة جانبية واحدة مجمّعة؛ تظهر لكل دور الصفحات المسموحة له فقط.
  // الإخفاء هنا للعرض فقط؛ الصلاحيات الفعلية في Store.can داخل كل صفحة وكل دالة كتابة.
  const PANEL_ROLES = ['founder', 'admin', 'secretary', 'treasurer'];
  const isPanelUser = () => PANEL_ROLES.includes(St.user().role);
  const mg = () => true; // أدوات الإضافة/التعديل/الحذف تظهر لمن يملك الصلاحية (St.can) في صفحته
    const ico = k => `<i class="ic ic-${k}" aria-hidden="true"></i>`; // الأيقونات في admin.css (CSS mask) فلا عناصر SVG في الصفحة
  // [المفتاح، العنوان، شرط الظهور]
  const GROUPS = () => [
    ['', [['dash', 'نظرة عامة', isPanelUser()]]],
    ['الفريق', [['players', 'اللاعبون', St.can('viewPlayers')], ['matches', 'المباريات', St.canViewMatches()], ['stats', 'الإحصائيات', St.canViewMatches()], ['pitch', 'الملعب', St.canSeeRoster()], ['coach', 'التشكيلة والحضور', St.can('lineup') || St.can('viewPlayers')], ['staff', 'الطاقم', St.can('staff') || St.can('viewStaff')]]],
    ['الإدارة', [['finance', 'المالية', St.can('finance')], ['users', 'المستخدمون', St.user().role === 'founder'], ['roles', 'الصلاحيات', St.user().role === 'founder'], ['audit', 'سجل العمليات', St.can('audit')]]],
    ['الإعدادات', [['site', 'إدارة الموقع العام', isPanelUser() && St.can('settings')], ['settings', 'إعدادات الفريق', isPanelUser()]]]
  ];
  const TITLES = { dash: 'لوحة التحكم', players: 'اللاعبون', player: 'بطاقة لاعب', pitch: 'الملعب', member: 'ملف عضو الطاقم', matches: 'المباريات والنتائج', stats: 'الإحصائيات', coach: 'التشكيلة والحضور', staff: 'الطاقم', users: 'المستخدمون', roles: 'الصلاحيات', finance: 'المالية', audit: 'سجل العمليات', site: 'إدارة الموقع العام', settings: 'إعدادات الفريق' };
  function navFor(page) {
    return GROUPS().map(([g, items]) => { const its = items.filter(i => i[2]); return its.length ? (g ? `<div class="grp">${esc(g)}</div>` : '') + its.map(([k, l]) => `<a href="#/${k}" class="${page === k || (page === 'player' && k === 'players') || (page === 'member' && k === 'staff') ? 'on' : ''}" ${page === k ? 'aria-current="page"' : ''}>${ico(k)}<span>${esc(l)}</span></a>`).join('') : ''; }).join('');
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
    $('form', d).onsubmit = e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); Promise.resolve(onSubmit(f)).then(er => { if (er) $('#err', d).textContent = er; else { d.close(); toast(SAVED); } }); };
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
    ${(() => { const top = St.statRows().filter(r => r.s.goals > 0).slice(0, 3); return top.length ? `<div class="card"><h2>أبرز الهدافين</h2><div class="row">${top.map(r => `<a class="pc" href="#/player/${esc(r.p.id)}" style="text-decoration:none;color:inherit">${avatar(r.p)}<div><b>${esc(r.p.name)}</b><br><small>${num(r.s.goals)} هدف</small></div></a>`).join('')}</div></div>` : ''; })()}
    ${St.can('audit') ? `<div class="card"><h2>آخر العمليات</h2>${St.logs().slice(0, 4).map(l => `<div>• ${esc(l.a)}: ${esc(l.d)} <small>(${esc(l.who)})</small></div>`).join('')}</div>` : ''}`;
  };

  V.players = () => {
    if (!St.can('viewPlayers')) return denied('ملفات اللاعبين');
    return `<h1>اللاعبون</h1><div class="note">ملفات اللاعبين للمسؤولين المخولين فقط — لا توجد قائمة عامة.</div><div class="tools"><input id="q" type="search" placeholder="بحث بالاسم أو الرقم" aria-label="بحث"><select id="fp" aria-label="المركز"><option value="">كل المراكز</option>${POS.map(p => `<option>${esc(p)}</option>`).join('')}</select><select id="fs" aria-label="الحالة"><option value="">كل الحالات</option>${STAT.map(p => `<option>${esc(p)}</option>`).join('')}</select>${St.can('players') && mg() ? '<button id="addp">+ إضافة لاعب</button>' : ''}</div><div class="plist" id="plist"></div>`;
  };
  const drawPlayers = () => {
    const q = $('#q').value.trim(), fp = $('#fp').value, fs = $('#fs').value;
    const r = St.players().filter(p => (!q || p.name.includes(q) || String(p.num) === q) && (!fp || p.pos === fp) && (!fs || p.status === fs));
    $('#plist').innerHTML = r.map(p => `<a class="card pc" href="#/player/${esc(p.id)}">${avatar(p)}<div><b>${esc(p.name)}</b><br>${tag(p)}</div></a>`).join('') || '<p>لا نتائج.</p>';
  };
  // حقلا الهاتف والبريد لا يدخلان النموذج (ولا الـ HTML) إلا لمن يملك صلاحية عرضهما
  // الصورة: JPEG/PNG/WebP حتى 2 م.ب، تُرفع إلى Storage ثم تُسجَّل عبر RPC (الفحص الفعلي في الخادم). للاعب الموجود فقط (يلزم معرّفه).
  // تصغير موحّد قبل الرفع: قصّ مربع (مع ميل للأعلى للحفاظ على الوجه) 640×640 كحد أقصى، JPEG بجودة 0.86 — أخف وأسرع وبمظهر ثابت
  const readUrl = file => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(new Error('read')); r.readAsDataURL(file); });   // data: مسموح في CSP، أما blob: فلا
  const loadImg = url => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error('img')); im.src = url; });
  const shrink = async file => {
    const im = await loadImg(await readUrl(file)), w = im.naturalWidth, h = im.naturalHeight, side = Math.min(w, h), sx = (w - side) / 2, sy = h > w ? (h - side) * 0.3 : 0, out = Math.min(640, side);
    const c = document.createElement('canvas'); c.width = c.height = out; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, out, out); x.drawImage(im, sx, sy, side, side, 0, 0, out, out);
    const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86)); if (!b) throw new Error('blob');
    return new File([b], 'photo.jpg', { type: 'image/jpeg' });
  };
  const photoFld = p => { const cur = TD.primaryPhoto ? TD.primaryPhoto(p.id) : null; return `<div class="f photof"><span>الصورة (اختيارية)</span><div class="row"><div class="av big" id="pprev">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : '؟'}</div><div><label class="btnlink filebtn">اختيار صورة<input type="file" name="photoFile" accept="image/*" hidden></label>${cur ? ' <label class="rm"><input type="checkbox" name="rmphoto"> حذف الصورة الحالية</label>' : ''}<div class="hint">أي صورة من الجوال أو الكمبيوتر — تُقصّ مربعة وتُصغَّر تلقائيًا قبل الرفع.</div></div></div></div>`; };
  document.addEventListener('change', e => { const t = e.target; if (!t || t.name !== 'photoFile') return; const f = t.files && t.files[0], pv = $('#pprev'); if (!f || !pv) return; if (f.size > 25 * 1048576 || !/^image\//.test(f.type)) { t.value = ''; const er = $('#err'); if (er) er.textContent = 'ملف الصورة غير مقبول أو كبير جدًا'; return; } shrink(f).then(readUrl).then(u => { const im = document.createElement('img'); im.alt = ''; im.src = u; pv.textContent = ''; pv.appendChild(im); const er = $('#err'); if (er) er.textContent = ''; }).catch(() => { t.value = ''; const er = $('#err'); if (er) er.textContent = 'تعذّر قراءة الصورة، جرّب صورة JPEG أو PNG'; }); });
  const playerForm = p => { const c = St.can('contactPlayers'); p = p || { name: '', num: '', pos: 'وسط', city: '', status: 'نشط', phone: '', email: '' };
    modal(p.id ? 'تعديل لاعب' : 'إضافة لاعب', fld('الاسم', 'name', p.name) + fld('رقم القميص', 'num', p.num, 'number', 'min=1 max=99') + sel('المركز', 'pos', POS, p.pos) + sel('الحالة', 'status', STAT, p.status) + fld('المدينة', 'city', p.city) + (p.id ? photoFld(p) : '<p class="hint">يمكن إضافة الصورة بعد الحفظ، من «تعديل» اللاعب.</p>') + (c ? fld('الهاتف', 'phone', p.phone) + fld('البريد', 'email', p.email, 'email') : ''),
      async f => {
        const er = await St.savePlayer({ id: p.id, name: f.name, num: f.num, pos: f.pos, status: f.status, city: f.city, ...(c ? { phone: f.phone, email: f.email } : {}) }); if (er) return er;
        if (!p.id) return '';
        const file = f.photoFile, old = TD.primaryPhoto(p.id);
        if (file && file.size) { let up; try { up = await shrink(file); } catch (_) { return 'حُفظ اللاعب لكن تعذّر قراءة الصورة'; } const r = await TD.uploadPhoto(p.id, up, true); if (r) return 'حُفظ اللاعب لكن تعذّر رفع الصورة: ' + r; if (old) await TD.deletePhoto(old.id); }   // القديمة تُحذف بعد نجاح الجديدة
        else if (f.rmphoto === 'on' && old) { const r = await TD.deletePhoto(old.id); if (r) return 'حُفظ اللاعب لكن تعذّر حذف الصورة: ' + r; }
        return '';
      }); };

  V.player = id => {
    if (!St.can('viewPlayers')) return denied('ملفات اللاعبين');
    const p = St.player(id); if (!p) return '<h1>اللاعب غير موجود</h1><a href="#/players">رجوع</a>';
    const s = St.stats(id), ed = St.can('players') && mg(), l = St.playerLinks(id), linked = l.events + l.matches > 0;
    const acts = !ed ? '' : linked
      ? `<div class="note" id="dnote">لا يمكن حذف هذا اللاعب نهائيًا لأنه مرتبط بسجلات مباريات (${l.events} حدث، ${l.matches} مشاركة). «إلغاء التسجيل» يُبقي اسمه وإحصائياته في السجل التاريخي ويُخرجه من التشكيلة والحضور الجديد.</div><div class="row"><button id="edp">تعديل</button>${p.status === St.ARCH ? '' : '<button class="dng" id="unregp">إلغاء التسجيل</button>'}</div>`
      : `<div class="row"><button id="edp">تعديل</button><button class="dng" id="delp">حذف</button></div>`;
    return `<a href="#/players">→ رجوع للقائمة</a> · <a href="#/pitch">الملعب</a><div class="card row" style="margin-top:8px">${avatar(p, true)}<div><h1 id="pn" style="margin:0">${esc(p.name)}</h1>${tag(p)}<p>المدينة: ${esc(p.city)}${St.can('contactPlayers') ? `<br>هاتف: <bdi>${esc(p.phone)}</bdi><br>بريد: <bdi>${esc(p.email)}</bdi>` : '<br><small id="cnote">الهاتف والبريد غير متاحين لدورك.</small>'}</p></div></div>
    <div class="grid"><div class="card kpi"><b>${s.apps}</b>مشاركات</div><div class="card kpi"><b>${s.goals}</b>أهداف</div><div class="card kpi"><b>${s.yellow}</b>صفراء</div><div class="card kpi"><b>${s.red}</b>حمراء</div></div>
    <p>في التشكيلة الأساسية: <b>${S.lineup.starters.includes(id) ? 'نعم' : 'لا'}</b> · حصص التدريب المسجّلة: <b>${num(l.att)}</b></p>${acts}`;
  };

  V.staff = () => { if (!(St.can('staff') || St.can('viewStaff'))) return denied('الطاقم'); const ph = St.can('contactStaff') || St.can('contactStaffTeam'); return `<h1>الطاقم الإداري والفني</h1>${ph ? '' : '<div class="note" id="snote">أرقام هواتف الطاقم غير متاحة لدورك.</div>'}<div class="tools">${St.can('staff') ? '<button id="adds">+ إضافة عضو</button>' : ''}</div>${tw('جدول الطاقم', `<tr><th>الاسم</th><th>الدور</th><th>النوع</th>${ph ? '<th>الهاتف</th>' : ''}<th></th></tr>${St.staffList().map(s => `<tr><td><a class="pn" href="#/member/${esc(s.id)}">${esc(s.name)}</a></td><td>${esc(s.role)}</td><td>${esc(s.kind)}</td>${ph ? `<td>${s.phone === undefined ? '—' : `<bdi>${esc(s.phone)}</bdi>`}</td>` : ''}<td>${St.can('staff') ? `<button class="sec" data-es="${esc(s.id)}">تعديل</button> <button class="dng" data-ds="${esc(s.id)}">حذف</button>` : ''}</td></tr>`).join('')}`)}`; };
  V.member = id => {
    if (!(St.can('staff') || St.can('viewStaff'))) return denied('الطاقم');
    const s = St.staffList().find(x => x.id === id); if (!s) return '<h1>العضو غير موجود</h1><a href="#/staff">رجوع</a>';
    const ph = s.phone !== undefined, ed = St.can('staff');
    return `<a href="#/staff">→ رجوع للطاقم</a><div class="card row" style="margin-top:8px">${avatar(s, true)}<div><h1 id="mn" style="margin:0">${esc(s.name)}</h1><span class="tag">${esc(s.role)}</span> <span class="tag">${esc(s.kind)}</span><p>${ph ? `هاتف: <bdi>${esc(s.phone)}</bdi>` : '<small id="cnote">الهاتف غير متاح لدورك.</small>'}</p></div></div>${ed ? `<div class="row"><button data-es="${esc(s.id)}">تعديل</button><button class="dng" data-dsp="${esc(s.id)}">حذف</button></div>` : ''}`;
  };
  const staffForm = s => { const c = St.can('contactStaff'); s = s || { name: '', role: '', kind: 'فني', phone: '' }; modal(s.id ? 'تعديل عضو' : 'إضافة عضو', fld('الاسم', 'name', s.name) + fld('الدور', 'role', s.role) + sel('النوع', 'kind', St.KIND, s.kind) + (c ? fld('الهاتف', 'phone', s.phone) : ''), f => St.saveStaff({ id: s.id, name: f.name, role: f.role, kind: f.kind, ...(c ? { phone: f.phone } : {}) })); };

  let sesId = '';   // الحصة المختارة؛ تُحسم من الحصص الفعلية (أحدثها افتراضيًا) في curSes()
  const curSes = () => { const l = S.sessions; if (l.some(x => x.id === sesId)) return sesId; const last = [...l].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]; return last ? last.id : ''; };
  const sesForm = () => modal('إضافة حصة تدريب', fld('العنوان', 'title', 'تدريب') + fld('التاريخ', 'date', new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Qatar' }), 'date'), async f => { sesId = ''; return St.saveSession({ title: f.title, date: f.date }); });   // بعد الحفظ تُختار أحدث حصة
  // الملعب: التشكيلة الأساسية على أرض الملعب (الحارس في الأسفل والمهاجمون في الأعلى)، وكل لاعب بصورته ورقمه؛ الضغط عليه يفتح بطاقته
  const pitchHtml = () => {
    const st = S.lineup.starters.map(St.player).filter(Boolean), pl = p => `<a class="pp ${p.status === 'نشط' ? '' : 'off'}" href="#/player/${esc(p.id)}" aria-label="بطاقة ${esc(p.name)}">${avatar(p)}<b class="no">${num(p.num)}</b><span class="nm">${esc(p.name)}</span></a>`;
    const lines = ['مهاجم', 'وسط', 'مدافع', 'حارس'].map(pos => `<div class="line">${st.filter(p => p.pos === pos).map(pl).join('')}</div>`).join('');
    return `<div class="field" id="pitch"><i class="m-c"></i><i class="m-h"></i><i class="m-b t"></i><i class="m-b b"></i>${st.length ? lines : '<p class="empty">لم تُحدَّد تشكيلة أساسية بعد.</p>'}</div>`;
  };
  const benchHtml = () => { const ids = new Set(S.lineup.starters), b = St.roster().filter(p => !ids.has(p.id)); return b.length ? `<h2 style="margin-top:14px">الاحتياط</h2><div class="bench">${b.map(p => `<a class="pp sm ${p.status === 'نشط' ? '' : 'off'}" href="#/player/${esc(p.id)}" aria-label="بطاقة ${esc(p.name)}">${avatar(p)}<b class="no">${num(p.num)}</b><span class="nm">${esc(p.name)}</span></a>`).join('')}</div>` : ''; };
  V.pitch = () => {
    if (!St.canSeeRoster()) return denied('الملعب');
    return `<h1>الملعب</h1><div class="note">اضغط على أي لاعب لفتح بطاقته الكاملة. التشكيلة تُعدَّل من «التشكيلة والحضور».</div><div class="card">${pitchHtml()}${benchHtml()}</div>`;
  };
  V.coach = () => {
    if (!St.can('lineup') && !St.can('viewPlayers')) return denied('لوحة المدرب');
    const ed = St.can('lineup'), st = S.lineup.starters, g = pos => st.map(St.player).filter(p => p && p.pos === pos);
    const cs = curSes(), ses = S.att[cs] || {}, ros = St.roster(), activeN = S.players.filter(p => p.status === 'نشط').length;
    const incomplete = st.length < 11 ? `<div class="note" id="lnote">التشكيلة غير مكتملة (${st.length}/11)${activeN < 11 ? ` — عدد اللاعبين النشطين المتاحين ${activeN} فقط، لذلك لا يمكن إكمال 11 دون إضافة لاعب نشط أو تغيير حالة لاعب.` : ' — اختر لاعبين إضافيين.'}</div>` : '';
    return `<h1>لوحة المدرب</h1>${ed ? '' : '<div class="note">عرض فقط — لا تملك صلاحية التعديل.</div>'}
    <div class="card"><h2>التشكيلة الأساسية — <span id="sc">${st.length}</span>/11</h2>${incomplete}${pitchHtml()}
    ${ed ? `<h2 style="margin-top:12px">اختيار اللاعبين</h2><div class="row">${ros.map(p => `<label><input type="checkbox" data-st="${esc(p.id)}" ${st.includes(p.id) ? 'checked' : ''} ${p.status !== 'نشط' ? 'disabled' : ''}> ${esc(p.name)} (${esc(p.pos)})</label>`).join('')}</div>` : ''}</div>
    <div class="card"><h2>الحضور</h2>${S.sessions.length ? `<div class="tools ses"><select id="ses" aria-label="الحصة">${[...S.sessions].sort((x, y) => String(y.date).localeCompare(String(x.date))).map(x => `<option value="${esc(x.id)}" ${x.id === cs ? 'selected' : ''}>${esc(x.title)} — ${esc(x.date)}</option>`).join('')}</select>${ed ? '<button id="addses">+ حصة</button><button class="dng" id="delses">حذف الحصة</button>' : ''}</div>` : `<p class="empty">لا توجد حصص تدريب بعد.${ed ? ' أضف حصة لتسجيل الحضور.' : ''}</p>${ed ? '<div class="tools"><button id="addses">+ حصة تدريب</button></div>' : ''}`}${S.sessions.length ? tw('جدول الحضور', `<tr><th>اللاعب</th><th>حاضر</th></tr>${ros.map(p => `<tr><td>${esc(p.name)}</td><td><input type="checkbox" data-at="${esc(p.id)}" ${ses[p.id] ? 'checked' : ''} ${ed ? '' : 'disabled'} aria-label="حضور ${esc(p.name)}"></td></tr>`).join('')}`, 'att').replace('class="card tw"', 'class="tw"') : ''}</div>`;
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
  const matchForm = m => { const offs = TD.officers(); m = m || { opp: '', date: new Date().toISOString().slice(0, 10), home: true, officer: offs[0] ? offs[0].id : '' };
    modal(m.id ? 'تعديل مباراة' : 'إضافة مباراة', fld('الخصم', 'opp', m.opp) + fld('التاريخ', 'date', m.date, 'date') + sel('الملعب', 'home', [['1', 'على أرضنا'], ['0', 'خارج الأرض']], m.home ? '1' : '0') + sel('مسؤول المباراة', 'officer', offs.map(u => [u.id, u.name]), m.officer), f => St.saveMatch({ id: m.id, opp: f.opp, date: f.date, officer: f.officer, home: f.home === '1' })); };

  V.stats = () => {
    if (!St.canViewMatches()) return denied('الإحصائيات');
    const rows = St.statRows(), scoped = !St.canSeeRoster();
    return `<h1>الإحصائيات</h1>${scoped ? '<div class="note">تعرض هذه الصفحة إحصائيات اللاعبين في مبارياتك المكلّف بها فقط.</div>' : ''}${tw('جدول الإحصائيات', `<tr><th>اللاعب</th><th>مشاركات</th><th>أهداف</th><th>صفراء</th><th>حمراء</th></tr>${rows.map(({ p, s }) => `<tr><td>${esc(p.name)}${p.status === St.ARCH ? ' <small>(غير مسجّل)</small>' : ''}</td><td>${s.apps}</td><td>${s.goals}</td><td>${s.yellow}</td><td>${s.red}</td></tr>`).join('')}`)}<small>تُحسب تلقائيًا من أحداث المباريات المنتهية. الترتيب: الأهداف ثم المشاركات (تنازليًا) ثم الاسم أبجديًا؛ وعند تعادل الأهداف تُعرض لوحة التحكم جميع المتعادلين على الصدارة.</small>`;
  };


  // ---- الصلاحيات والمستخدمون (للمؤسس فقط؛ الخادم يفرض ذلك أيضًا) ----
  const isFounder = () => St.user().role === 'founder';
  const ROLE_KEYS = ['admin', 'secretary', 'coach', 'officer', 'treasurer'];
  V.roles = () => !isFounder() ? denied('الصلاحيات') : `<h1>الصلاحيات</h1><div class="note">المؤسس يملك كل الصلاحيات دائمًا. فعّل أو ألغِ الصلاحية لكل دور؛ يُسجَّل كل تغيير في سجل العمليات. دور «مسؤول المباراة» لا يحصل على صلاحيات الطاقم.</div><div id="rolebox"><p>جارٍ التحميل…</p></div>`;
  const loadRoles = () => TD.getRoles().then(r => {
    const b = $('#rolebox'); if (!b || route().page !== 'roles') return;
    if (!r) { b.innerHTML = '<p>تعذّر تحميل الصلاحيات.</p>'; return; }
    const head = ROLE_KEYS.map(k => `<th>${esc(St.ROLES[k])}</th>`).join('');
    const rows = r.catalog.map(c => `<tr><td>${esc(c.label_ar)}<br><small dir="ltr">${esc(c.code)}</small></td>${ROLE_KEYS.map(k => {
      const blocked = k === 'officer' && St.STAFF_MODS.includes(c.code), on = (r.matrix[k] || []).includes(c.code);
      return `<td><input type="checkbox" data-rp="${esc(k)}|${esc(c.code)}" aria-label="${esc(c.label_ar)} — ${esc(St.ROLES[k])}" ${on ? 'checked' : ''} ${blocked ? 'disabled' : ''}></td>`; }).join('')}</tr>`).join('');
    b.innerHTML = tw('جدول الصلاحيات', `<thead><tr><th>الصلاحية</th>${head}</tr></thead><tbody>${rows}</tbody>`);
  });
  V.users = () => !isFounder() ? denied('المستخدمون') : `<h1>المستخدمون</h1><div class="note">لإضافة مستخدم جديد: أنشئ حسابه (بريد وكلمة مرور) من لوحة Supabase → Authentication، ثم اربطه هنا بالبريد نفسه وبالدور المطلوب.</div><div class="card"><h2>ربط حساب بالفريق</h2><form id="uf">${fld('البريد الإلكتروني', 'email', '', 'email', 'required')}${fld('الاسم المعروض', 'name', '', 'text', 'required maxlength="60"')}${sel('الدور', 'role', ROLE_KEYS.map(k => [k, St.ROLES[k]]), 'coach')}<button>إضافة</button></form></div><div id="userbox"><p>جارٍ التحميل…</p></div>`;
  const loadUsers = () => TD.getMembers().then(ms => {
    const b = $('#userbox'); if (!b || route().page !== 'users') return;
    if (!ms) { b.innerHTML = '<p>تعذّر تحميل المستخدمين.</p>'; return; }
    const rows = ms.map(m => { const f = m.role === 'founder';
      return `<tr><td>${esc(m.display_name)}</td><td>${f ? esc(St.ROLES.founder) : `<select data-ur="${esc(m.user_id)}" aria-label="دور ${esc(m.display_name)}">${ROLE_KEYS.map(k => `<option value="${k}" ${k === m.role ? 'selected' : ''}>${esc(St.ROLES[k])}</option>`).join('')}</select>`}</td><td><span class="tag ${m.active ? '' : 'bad'}">${m.active ? 'فعّال' : 'موقوف'}</span></td><td>${f ? '' : `<button type="button" class="sec" data-ua="${esc(m.user_id)}" data-to="${m.active ? '0' : '1'}">${m.active ? 'إيقاف' : 'تفعيل'}</button>`}</td></tr>`; }).join('');
    b.innerHTML = tw('المستخدمون', `<thead><tr><th>الاسم</th><th>الدور</th><th>الحالة</th><th></th></tr></thead><tbody>${rows}</tbody>`);
  });
  // سجل العمليات: بطاقات مجمّعة حسب اليوم (بتوقيت قطر) مع بحث وتصفية بنوع العملية
  const QD = { timeZone: 'Asia/Qatar' };
  const dayKey = d => d.toLocaleDateString('en-CA', QD);
  const dayLabel = d => { const k = dayKey(d), t = dayKey(new Date()), y = dayKey(new Date(Date.now() - 864e5)); return k === t ? 'اليوم' : k === y ? 'أمس' : d.toLocaleDateString('ar-u-nu-latn', { ...QD, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); };
  const timeLabel = d => d.toLocaleTimeString('ar-u-nu-latn', { ...QD, hour: 'numeric', minute: '2-digit' });
  const logItem = (l, d) => { const role = St.ROLES[l.role] || '', det = String(l.d || '').trim();
    return `<li class="lg" data-a="${esc(l.a)}" data-q="${esc([l.a, l.d, l.who, role].join(' ').toLowerCase())}"><div class="lg-top"><b class="lg-a">${esc(l.a)}</b><time class="lg-t" datetime="${esc(d.toISOString())}">${esc(timeLabel(d))}</time></div>${det ? `<div class="lg-d">${esc(det)}</div>` : ''}<div class="lg-by"><span>${esc(l.who || '—')}</span>${role ? `<span class="lg-r">${esc(role)}</span>` : ''}</div></li>`; };
  V.audit = () => {
    if (!St.can('audit')) return denied('سجل العمليات');
    const rows = St.logs().map(l => ({ l, d: new Date(l.t) })).filter(x => !isNaN(x.d)).sort((a, b) => b.d - a.d);
    if (!rows.length) return '<h1>سجل العمليات</h1><div class="card"><p class="empty">لا توجد عمليات مسجّلة بعد.</p></div>';
    const acts = [...new Set(rows.map(x => x.l.a))].sort((a, b) => a.localeCompare(b, 'ar'));
    const groups = []; rows.forEach(x => { const k = dayKey(x.d), g = groups[groups.length - 1]; if (g && g.k === k) g.items.push(x); else groups.push({ k, label: dayLabel(x.d), items: [x] }); });
    return `<h1>سجل العمليات</h1><div class="card lg-bar"><input id="lgq" type="search" placeholder="ابحث: اسم، عملية، تفاصيل…" aria-label="بحث في السجل"><select id="lga" aria-label="نوع العملية"><option value="">كل العمليات</option>${acts.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('')}</select><small id="lgn">${rows.length} عملية</small></div>` +
      groups.map(g => `<section class="lg-day" aria-label="${esc(g.label)}"><h2 class="lg-h">${esc(g.label)}</h2><ul class="card lg-list">${g.items.map(x => logItem(x.l, x.d)).join('')}</ul></section>`).join('') + '<p class="empty" id="lg0" hidden>لا نتائج مطابقة.</p>';
  };
  document.addEventListener('input', e => { const t = e.target; if (!t || (t.id !== 'lgq' && t.id !== 'lga')) return;
    const q = ($('#lgq').value || '').trim().toLowerCase(), a = $('#lga').value; let n = 0;
    document.querySelectorAll('.lg').forEach(li => { const ok = (!a || li.dataset.a === a) && (!q || li.dataset.q.includes(q)); li.hidden = !ok; if (ok) n++; });
    document.querySelectorAll('.lg-day').forEach(d => { d.hidden = !d.querySelector('.lg:not([hidden])'); });
    $('#lgn').textContent = n + ' عملية'; $('#lg0').hidden = n > 0; });
  V.settings = () => { const t = St.team(), ed = St.can('settings'); return `<h1>إعدادات الفريق</h1><div class="card"><form id="tf">${fld('اسم الفريق', 'name', t.name, 'text', ed ? '' : 'disabled')}${fld('المدينة', 'city', t.city, 'text', ed ? '' : 'disabled')}${fld('اللون الرئيسي', 'color', t.color, 'color', ed ? '' : 'disabled')}<small class="hint">يظهر هذا اللون في الموقع العام فقط، ولا يغيّر ألوان لوحة الإدارة.</small>${ed ? '<button>حفظ</button>' : '<small>عرض فقط</small>'}</form></div>`; };
  // إدارة الموقع العام: ما تفعّله هنا يظهر للزوار في الموقع؛ وما تُطفئه يختفي. لا هواتف ولا بريد ولا مدن في الموقع أبدًا (الخادم يرجع قائمة بيضاء فقط).
  const SEC = [['players', 'اللاعبون', 'الاسم والرقم والمركز فقط'], ['staff', 'الطاقم', 'الاسم والدور فقط'], ['matches', 'المباريات والنتائج', 'الخصم والتاريخ والنتيجة'], ['stats', 'الهدافون', 'الاسم والأهداف والمشاركات'], ['photos', 'صور اللاعبين', 'تظهر صورة كل لاعب في الملعب وبطاقته؛ الصور المرفوعة تصبح قابلة للفتح برابطها العام']];
  V.site = () => { if (!isPanelUser() || !St.can('settings')) return denied('إدارة الموقع العام'); return `<h1>إدارة الموقع العام</h1><div class="note">يظهر في الموقع ما تفعّله هنا فقط. كل الأقسام مطفأة افتراضيًا. لا يُنشر في الموقع أي هاتف أو بريد أو مدينة لأي لاعب أو عضو.</div><div class="card" id="sitebox"><p>جارٍ التحميل…</p></div>`; };
  const siteForm = r => { const s = r.sections || {};
    return `<div class="row between"><h2>محتوى الموقع</h2><a class="btnlink" href="../../" target="_blank" rel="noopener">عرض الموقع ↗</a></div><form id="sf"><label class="f"><span>نبذة عن الفريق (اختيارية)</span><textarea name="about" rows="3" maxlength="500">${esc(r.about)}</textarea></label><label class="f"><span>إعلان أعلى الموقع (اختياري)</span><input name="announcement" maxlength="200" value="${esc(r.announcement)}"></label><h2>الأقسام الظاهرة في الموقع</h2><div class="secs">${SEC.map(([k, l, n]) => `<label class="ck"><input type="checkbox" name="sec_${esc(k)}" ${s[k] === true ? 'checked' : ''}><span><b>${esc(l)}</b><small>${esc(n)}</small></span></label>`).join('')}</div><button>حفظ الموقع</button></form>`; };
  const loadSite = () => { const box = $('#sitebox'); if (!box) return; TD.getSite().then(r => { const b = $('#sitebox'); if (!b || route().page !== 'site') return; b.innerHTML = r && typeof r === 'object' ? siteForm(r) : '<p>تعذّر تحميل إعدادات الموقع أو لا تملك الصلاحية.</p>'; }); };

  // ---- العرض والأحداث ----
  const safeColor = c => /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#0b6b3a';
  function render() {
    const logged = !!St.user().role;
    $('#loginView').hidden = logged; $('#shell').hidden = !logged;
    if (!logged) { const m = $('#modal'); if (m.open) m.close(); m.innerHTML = ''; $('#view').innerHTML = ''; return; }  // لا تبقى بيانات الجلسة السابقة في الصفحة
    let { page, id } = route(); const v = $('#view');
    // أدوار التطبيق لا ترى «لوحة التحكم» إطلاقًا: الصفحة الرئيسية ومسار غير معروف يحوّلان إلى شاشتها في التطبيق
    if (!isPanelUser() && (page === 'dash' || !Object.prototype.hasOwnProperty.call(V, page))) { page = St.user().role === 'coach' ? 'coach' : 'matches'; history.replaceState(null, '', '#/' + page); id = undefined; }
    // لون أزرار اللوحة ثابت (هوية الفريق)؛ «لون الفريق» من الإعدادات يخصّ الموقع العام فقط
    $('#teamName').textContent = St.team().name;
    $('#nav').innerHTML = navFor(page); $('#crumb').textContent = TITLES[Object.prototype.hasOwnProperty.call(V, page) ? page : 'dash'] || ''; document.body.classList.remove('menu-open'); $('#menuBtn').setAttribute('aria-expanded', 'false');
    $('#whoName').textContent = (St.user().name || '') + ' — ' + (St.ROLES[St.user().role] || '');
    v.innerHTML = (Object.prototype.hasOwnProperty.call(V, page) ? V[page] : V.dash)(id);  // لا نقرأ مفاتيح النموذج الأولي (constructor…)
    if (page === 'players' && St.can('viewPlayers')) drawPlayers();
    if (page === 'site') loadSite();
    if (page === 'roles' && isFounder()) loadRoles();
    if (page === 'users' && isFounder()) loadUsers();
  }
  const fail = async p => { const er = await p; if (er) { toast(er); render(); } return !!er; };
  St.on(render); window.addEventListener('hashchange', render);
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
    if (d.at) { const c = curSes(); if (!c) { t.checked = false; return toast('أضف حصة تدريب أولًا'); } fail(St.setAtt(c, d.at, t.checked)); }
    if (d.rp) { const [rl, pm] = d.rp.split('|'); fail(TD.setPerm(rl, pm, t.checked)); }
    if (d.ur && confirm('تغيير دور هذا المستخدم؟')) fail(TD.setMemberRole(d.ur, t.value)); else if (d.ur) render();
    if (d.th || d.pl) { const id = d.th || d.pl, c = v.querySelector(`[data-m="${CSS.escape(id)}"]`); fail(St.setResult(id, +c.querySelector('[data-th]').value || 0, c.querySelector('[data-pl]').checked)); }
  });
  v.addEventListener('click', e => {
    const t = e.target, d = t.dataset, id = t.id;
    if (id === 'addp') playerForm();
    if (id === 'edp') playerForm(St.player(route().id));
    if (id === 'delp' && confirm('حذف هذا اللاعب؟')) { fail(St.delPlayer(route().id)).then(bad => { if (!bad) location.hash = '#/players'; }); }
    if (id === 'unregp' && confirm('إلغاء تسجيل هذا اللاعب؟ يبقى سجله التاريخي محفوظًا.')) { fail(St.unregisterPlayer(route().id)); }
    if (id === 'addses') sesForm();
    if (id === 'delses' && curSes() && confirm('حذف هذه الحصة وكل سجلات حضورها؟')) { fail(St.delSession(curSes())).then(bad => { if (!bad) { sesId = ''; toast('تم الحذف'); } }); }
    if (id === 'adds') staffForm();
    if (d.es) staffForm(St.staffList().find(x => x.id === d.es));
    if (d.ds && confirm('حذف عضو الطاقم؟')) fail(St.delStaff(d.ds));
    if (d.dsp && confirm('حذف عضو الطاقم؟')) { fail(St.delStaff(d.dsp)).then(bad => { if (!bad) location.hash = '#/staff'; }); }
    if (id === 'addm') matchForm();
    if (d.em) matchForm(S.matches.find(x => x.id === d.em));
    if (d.ua && confirm(d.to === '1' ? 'تفعيل هذا المستخدم؟' : 'إيقاف هذا المستخدم؟ لن يستطيع الدخول للوحة.')) fail(TD.setMemberActive(d.ua, d.to === '1'));
  });
  v.addEventListener('submit', e => {
    if (e.target.classList.contains('evf')) { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); fail(St.addEvent(e.target.dataset.mid, { pid: f.pid, type: f.type, min: +f.min || 1 })); }
    if (e.target.id === 'sf') { e.preventDefault(); const fd = new FormData(e.target), sec = {}; SEC.forEach(([k]) => { sec[k] = fd.has('sec_' + k); }); fail(TD.saveSite({ about: fd.get('about'), announcement: fd.get('announcement'), sections: sec })).then(bad => { if (!bad) toast(SAVED); }); }
    if (e.target.id === 'uf') { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); fail(TD.addMemberByEmail(f.email.trim(), f.name.trim(), f.role)).then(bad => { if (!bad) toast(SAVED); }); }
    if (e.target.id === 'tf') { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); St.saveTeam({ name: f.name, city: f.city, color: f.color }).then(er => toast(er || SAVED)); }
  });
  render();
})();
