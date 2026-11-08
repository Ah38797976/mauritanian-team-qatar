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
    ['الفريق', [['players', 'اللاعبون', St.can('viewPlayers')], ['matches', 'المباريات', St.canViewMatches()], ['stats', 'الإحصائيات', St.canViewMatches()], ['pitch', 'الملعب', St.canSeeRoster()], ['coach', 'لوحة المدرب', St.can('lineup') || St.can('viewPlayers')], ['staff', 'الطاقم', St.can('staff') || St.can('viewStaff')]]],
    ['الإدارة', [['finance', 'المالية', St.can('finance')], ['users', 'المستخدمون', St.user().role === 'founder'], ['roles', 'الصلاحيات', St.user().role === 'founder'], ['audit', 'سجل العمليات', St.can('audit')]]],
    ['الإعدادات', [['site', 'إدارة الموقع العام', isPanelUser() && St.can('settings')], ['settings', 'إعدادات الفريق', isPanelUser()]]]
  ];
  const TITLES = { dash: 'لوحة التحكم', players: 'اللاعبون', player: 'بطاقة لاعب', pitch: 'الملعب', member: 'ملف عضو الطاقم', matches: 'المباريات والنتائج', stats: 'الإحصائيات', coach: 'لوحة المدرب', staff: 'الطاقم', users: 'المستخدمون', roles: 'الصلاحيات', finance: 'المالية', audit: 'سجل العمليات', site: 'إدارة الموقع العام', settings: 'إعدادات الفريق' };
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
    d.innerHTML = `<form method="dialog" autocomplete="off"><h2>${esc(title)}</h2>${body}<div class="err" id="err" role="alert"></div><div class="mact"><button type="submit" value="ok">حفظ</button><button type="button" class="sec" id="cx">إلغاء</button></div></form>`;
    $('#cx', d).onclick = () => d.close();
    $('form', d).onsubmit = e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); Promise.resolve(onSubmit(f)).then(er => { if (er) { const E = $('#err', d); E.textContent = er; E.scrollIntoView({ block: 'nearest' }); } else { d.close(); toast(SAVED); } }); };
    d.showModal();
  }
  const fld = (l, n, v = '', t = 'text', extra = '') => `<label class="f"><span>${esc(l)}</span><input name="${esc(n)}" type="${esc(t)}" value="${esc(v)}" autocomplete="off" ${extra}></label>`;
  const sel = (l, n, opts, v) => `<label class="f"><span>${esc(l)}</span><select name="${esc(n)}">${opts.map(o => { const [k, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(t)}</option>`; }).join('')}</select></label>`;
  const tag = (p) => `<span class="tag">#${num(p.num)}</span> <span class="tag">${esc(p.pos)}</span> <span class="tag ${p.status === 'نشط' ? '' : 'bad'}">${esc(p.status)}</span>`;

  // ---- الصفحات ----
  const V = {};
  V.dash = () => {
    // الرؤية الكاملة لمن يملك صلاحية اللاعبين/التشكيلة؛ غيره (مثل مسؤول المباراة) يرى نطاق تكليفه فقط
    if (!St.canSeeRoster() && St.can('finance') && !St.canViewMatches()) {
      return `<h1>لوحة التحكم</h1><div class="card"><h2>المالية</h2><p>سجل المصروفات والإيرادات ورصيد الفريق.</p><a class="btnlink" href="#/finance">فتح صفحة المالية</a></div>`;
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
    ${St.can('lineup') || St.can('viewPlayers') ? `<a class="card coach-card" href="#/coach"><h2>لوحة المدرب</h2><p>التشكيلة الأساسية (${num(S.lineup.starters.length)}/11)، الملعب، والحضور.</p><span class="btnlink">فتح لوحة المدرب</span></a>` : ''}
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
  const photoFld = (p, cur) => { if (cur === undefined) cur = TD.primaryPhoto ? TD.primaryPhoto(p.id) : null; return `<div class="f photof"><span>الصورة (اختيارية)</span><div class="row"><div class="av big" id="pprev">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : '؟'}</div><div><label class="btnlink filebtn">اختيار صورة<input type="file" name="photoFile" accept="image/*" hidden></label>${cur ? ' <label class="rm"><input type="checkbox" name="rmphoto"> حذف الصورة الحالية</label>' : ''}<div class="hint">أي صورة من الجوال أو الكمبيوتر — تُقصّ مربعة وتُصغَّر تلقائيًا قبل الرفع.</div></div></div></div>`; };
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

  V.staff = () => {
    if (!(St.can('staff') || St.can('viewStaff'))) return denied('الطاقم');
    const ph = St.can('contactStaff') || St.can('contactStaffTeam'), ed = St.can('staff'), all = St.staffList();
    const card = s => `<article class="stc"><a class="stc-main" href="#/member/${esc(s.id)}">${avatar(s, true)}<div class="stc-t"><b>${esc(s.name)}</b><span>${esc(s.role || '—')}</span></div></a>${ph && s.phone ? `<a class="stc-ph" href="tel:${esc(String(s.phone).replace(/[^\d+]/g, ''))}"><bdi>${esc(s.phone)}</bdi></a>` : ''}${ed ? `<div class="stc-a"><button class="sec sm" data-es="${esc(s.id)}">تعديل</button><button class="dng sm" data-ds="${esc(s.id)}">حذف</button></div>` : ''}</article>`;
    const grp = (t, k) => { const l = all.filter(x => x.kind === k); return l.length ? `<h2 class="stc-h">${t} <span class="tag">${l.length}</span></h2><div class="stc-grid">${l.map(card).join('')}</div>` : ''; };
    return `<h1>الطاقم الإداري والفني</h1>${ph ? '' : '<div class="note" id="snote">أرقام هواتف الطاقم غير متاحة لدورك.</div>'}<div class="tools">${ed ? '<button id="adds">+ إضافة عضو</button>' : ''}</div>${all.length ? grp('الطاقم الفني', 'فني') + grp('الطاقم الإداري', 'إداري') : '<div class="card"><p class="empty">لا أعضاء بعد.</p></div>'}`;
  };
  V.member = id => {
    if (!(St.can('staff') || St.can('viewStaff'))) return denied('الطاقم');
    const s = St.staffList().find(x => x.id === id); if (!s) return '<h1>العضو غير موجود</h1><a href="#/staff">رجوع</a>';
    const ph = s.phone !== undefined, ed = St.can('staff');
    return `<a href="#/staff">→ رجوع للطاقم</a><div class="card row" style="margin-top:8px">${avatar(s, true)}<div><h1 id="mn" style="margin:0">${esc(s.name)}</h1><span class="tag">${esc(s.role)}</span> <span class="tag">${esc(s.kind)}</span><p>${ph ? `هاتف: <bdi>${esc(s.phone)}</bdi>` : '<small id="cnote">الهاتف غير متاح لدورك.</small>'}</p></div></div>${ed ? `<div class="row"><button data-es="${esc(s.id)}">تعديل</button><button class="dng" data-dsp="${esc(s.id)}">حذف</button></div>` : ''}`;
  };
  const staffForm = s => { const c = St.can('contactStaff'); s = s || { name: '', role: '', kind: 'فني', phone: '' };
    modal(s.id ? 'تعديل عضو' : 'إضافة عضو', fld('الاسم', 'name', s.name) + fld('الدور', 'role', s.role) + sel('النوع', 'kind', St.KIND, s.kind) + (s.id ? photoFld(s, TD.staffPhoto(s.id)) : '<p class="hint">يمكن إضافة الصورة بعد الحفظ، من «تعديل» العضو.</p>') + (c ? fld('الهاتف', 'phone', s.phone) : ''),
      async f => {
        const er = await St.saveStaff({ id: s.id, name: f.name, role: f.role, kind: f.kind, ...(c ? { phone: f.phone } : {}) }); if (er) return er;
        if (!s.id) return '';
        const file = f.photoFile;
        if (file && file.size) { let up; try { up = await shrink(file); } catch (_) { return 'حُفظ العضو لكن تعذّر قراءة الصورة'; } const r = await TD.setStaffPhoto(s.id, up); if (r) return 'حُفظ العضو لكن تعذّر رفع الصورة: ' + r; }
        else if (f.rmphoto === 'on' && TD.staffPhoto(s.id)) { const r = await TD.delStaffPhoto(s.id); if (r) return 'حُفظ العضو لكن تعذّر حذف الصورة: ' + r; }
        return '';
      }); };

  let sesId = '';   // الحصة المختارة؛ تُحسم من الحصص الفعلية (أحدثها افتراضيًا) في curSes()
  const curSes = () => { const l = S.sessions; if (l.some(x => x.id === sesId)) return sesId; const last = [...l].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]; return last ? last.id : ''; };
  const sesForm = () => modal('إضافة حصة تدريب', fld('العنوان', 'title', 'تدريب') + fld('التاريخ', 'date', new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Qatar' }), 'date'), async f => { sesId = ''; return St.saveSession({ title: f.title, date: f.date }); });   // بعد الحفظ تُختار أحدث حصة
  // الملعب: التشكيلة الأساسية على أرض الملعب (الحارس في الأسفل والمهاجمون في الأعلى)، وكل لاعب بصورته ورقمه؛ الضغط عليه يفتح بطاقته
  const PITCH_MARKS = ['pk-h', 'pk-c', 'pk-cs', 'pk-pa t', 'pk-pa b', 'pk-ga t', 'pk-ga b', 'pk-ar t', 'pk-ar b', 'pk-sp t', 'pk-sp b'].map(c => `<i class="pk ${c}" aria-hidden="true"></i>`).join('');
  const pitchHtml = (ed) => {
    const st = S.lineup.starters.map(St.player).filter(Boolean), pl = p => `<div class="ppw"><a class="pp ${p.status === 'نشط' ? '' : 'off'}" href="#/player/${esc(p.id)}" aria-label="بطاقة ${esc(p.name)}">${avatar(p)}<b class="no">${num(p.num)}</b><span class="nm">${esc(p.name)}</span></a>${ed ? `<button class="ppb rm" data-rs="${esc(p.id)}" aria-label="إخراج ${esc(p.name)} من التشكيلة">×</button>` : ''}</div>`;
    const lines = [['مهاجم', 'خط الهجوم'], ['وسط', 'خط الوسط'], ['مدافع', 'خط الدفاع'], ['حارس', 'حارس المرمى']].map(([pos, lab]) => { const l = st.filter(p => p.pos === pos); return `<div class="line" data-line="${esc(pos)}"><span class="ln">${lab}</span>${l.length ? l.map(pl).join('') : '<span class="slot" aria-hidden="true">—</span>'}</div>`; }).join('');
    return `<div class="field" id="pitch">${PITCH_MARKS}${lines}${st.length ? '' : '<p class="empty fe">لم تُحدَّد تشكيلة أساسية بعد.</p>'}</div>`;
  };
  const benchHtml = (ed) => { const ids = new Set(S.lineup.starters), b = St.roster().filter(p => !ids.has(p.id)), full = ids.size >= 11; return b.length ? `<h2 style="margin-top:14px">الاحتياط <span class="tag">${b.length}</span></h2><div class="bench">${b.map(p => `<div class="ppw"><a class="pp sm ${p.status === 'نشط' ? '' : 'off'}" href="#/player/${esc(p.id)}" aria-label="بطاقة ${esc(p.name)}">${avatar(p)}<b class="no">${num(p.num)}</b><span class="nm">${esc(p.name)}</span></a>${ed && p.status === 'نشط' && !full ? `<button class="ppb add" data-as="${esc(p.id)}" aria-label="إضافة ${esc(p.name)} للتشكيلة">+</button>` : ''}</div>`).join('')}</div>` : ''; };
  // الملعب التفاعلي (0014): لو كانت التشكيلة بالأعمدة الجديدة نعرض مركز المدرب؛ وإلا (0014 غير مُطبَّق) نبقى على الملعب القديم دون أي تغيير
  const coachPitch = ed => (window.CoachUI && CoachUI.html(ed)) || null;
  V.pitch = () => {
    if (!St.canSeeRoster()) return denied('الملعب');
    const ed = St.can('lineup'), c = coachPitch(ed);
    if (c) return `<h1>الملعب</h1><div class="card">${c}</div>`;
    return `<h1>الملعب</h1><div class="note">${ed ? `اضغط «+» على لاعب الاحتياط لإضافته إلى الملعب في مركزه، و«×» لإخراجه. (${S.lineup.starters.length}/11)` : 'اضغط على أي لاعب لفتح بطاقته الكاملة.'}</div><div class="card">${pitchHtml(ed)}${benchHtml(ed)}</div>`;
  };
  V.coach = () => {
    if (!St.can('lineup') && !St.can('viewPlayers')) return denied('لوحة المدرب');
    const ed = St.can('lineup'), edA = St.canAttendance(), st = S.lineup.starters, g = pos => st.map(St.player).filter(p => p && p.pos === pos);
    const cs = curSes(), ses = S.att[cs] || {}, ros = St.roster(), activeN = S.players.filter(p => p.status === 'نشط').length;
    const incomplete = st.length < 11 ? `<div class="note" id="lnote">التشكيلة غير مكتملة (${st.length}/11)${activeN < 11 ? ` — عدد اللاعبين النشطين المتاحين ${activeN} فقط، لذلك لا يمكن إكمال 11 دون إضافة لاعب نشط أو تغيير حالة لاعب.` : ' — اختر لاعبين إضافيين.'}</div>` : '';
    const cp = coachPitch(ed);
    const lineupCard = cp ? `<div class="card">${cp}</div>` : `<div class="card"><h2>التشكيلة الأساسية — <span id="sc">${st.length}</span>/11</h2>${incomplete}${pitchHtml()}
    ${ed ? `<h2 style="margin-top:12px">اختيار اللاعبين</h2><div class="row">${ros.map(p => `<label><input type="checkbox" data-st="${esc(p.id)}" ${st.includes(p.id) ? 'checked' : ''} ${p.status !== 'نشط' ? 'disabled' : ''}> ${esc(p.name)} (${esc(p.pos)})</label>`).join('')}</div>` : ''}</div>`;
    return `<h1>لوحة المدرب</h1>${ed ? '' : '<div class="note">عرض فقط — لا تملك صلاحية التعديل.</div>'}
    ${lineupCard}
    <div class="card"><h2>الحضور</h2>${edA || !S.sessions.length ? '' : '<div class="note">عرض فقط — لا تملك صلاحية تسجيل الحضور.</div>'}${S.sessions.length ? `<div class="tools ses"><select id="ses" aria-label="الحصة">${[...S.sessions].sort((x, y) => String(y.date).localeCompare(String(x.date))).map(x => `<option value="${esc(x.id)}" ${x.id === cs ? 'selected' : ''}>${esc(x.title)} — ${esc(x.date)}</option>`).join('')}</select>${edA ? '<button id="addses">+ حصة</button><button class="dng" id="delses">حذف الحصة</button>' : ''}</div>` : `<p class="empty">لا توجد حصص تدريب بعد.${edA ? ' أضف حصة لتسجيل الحضور.' : ''}</p>${edA ? '<div class="tools"><button id="addses">+ حصة تدريب</button></div>' : ''}`}${S.sessions.length ? tw('جدول الحضور', `<tr><th>اللاعب</th><th>حاضر</th></tr>${ros.map(p => `<tr><td>${esc(p.name)}</td><td><input type="checkbox" data-at="${esc(p.id)}" ${ses[p.id] ? 'checked' : ''} ${edA ? '' : 'disabled'} aria-label="حضور ${esc(p.name)}"></td></tr>`).join('')}`, 'att').replace('class="card tw"', 'class="tw"') : ''}</div>`;
  };

  // ---- المالية: سجل مصروفات وإيرادات (الأمين المالي والمؤسس فقط؛ الخادم يفرض الصلاحية). لا أسماء لاعبين هنا.
  let FIN = null, finM = '', finT = '', finQ = '';
  const money = n => Number(n || 0).toLocaleString('ar-u-nu-latn', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ر.ق';
  const monthKey = d => String(d).slice(0, 7);
  const monthName = k => new Date(k + '-01T00:00:00').toLocaleDateString('ar-u-nu-latn', { month: 'long', year: 'numeric' });
  const FCATS = ['اشتراكات', 'تبرعات', 'رعاية', 'رسوم ملعب', 'معدات وملابس', 'مواصلات', 'مباريات وبطولات', 'أخرى'];
  const finHtml = r => {
    if (!r) return '<p class="empty">تعذّر تحميل البيانات المالية أو لا تملك الصلاحية.</p>';
    const all = r.entries || [], months = [...new Set(all.map(e => monthKey(e.date)))];
    const inM = all.filter(e => !finM || monthKey(e.date) === finM);
    const inc = finM ? inM.filter(e => e.kind === 'income').reduce((a, e) => a + Number(e.amount), 0) : Number(r.income), exp = finM ? inM.filter(e => e.kind === 'expense').reduce((a, e) => a + Number(e.amount), 0) : Number(r.expense), bal = inc - exp;
    const q = finQ.trim().toLowerCase(), list = inM.filter(e => (!finT || e.kind === finT) && (!q || (e.category + ' ' + e.note).toLowerCase().includes(q)));
    return `<div class="fin-sum"><div class="card fs inc"><span>الإيرادات</span><b>${esc(money(inc))}</b></div><div class="card fs exp"><span>المصروفات</span><b>${esc(money(exp))}</b></div><div class="card fs bal ${bal < 0 ? 'neg' : ''}"><span>الرصيد</span><b dir="ltr">${esc(money(bal))}</b></div></div>
      <div class="tools"><button id="addinc">+ إيراد</button><button class="sec" id="addexp">+ مصروف</button></div>
      <div class="card lg-bar"><select id="finm" aria-label="الفترة"><option value="">كل الفترة</option>${months.map(k => `<option value="${esc(k)}" ${k === finM ? 'selected' : ''}>${esc(monthName(k))}</option>`).join('')}</select><select id="fint" aria-label="النوع"><option value="">الكل</option><option value="income" ${finT === 'income' ? 'selected' : ''}>إيرادات</option><option value="expense" ${finT === 'expense' ? 'selected' : ''}>مصروفات</option></select><input id="finq" type="search" placeholder="بحث في التصنيف والملاحظة" value="${esc(finQ)}" aria-label="بحث"></div>
      ${list.length ? `<ul class="card lg-list">${list.map(e => `<li class="lg fe ${e.kind}"><div class="lg-top"><b class="lg-a">${esc(e.category || (e.kind === 'income' ? 'إيراد' : 'مصروف'))}</b><span class="fe-amt"><bdi>${e.kind === 'income' ? '+' : '−'} ${esc(money(e.amount))}</bdi></span></div>${e.note ? `<div class="lg-d">${esc(e.note)}</div>` : ''}<div class="lg-by"><time datetime="${esc(e.date)}">${esc(new Date(e.date + 'T00:00:00').toLocaleDateString('ar-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }))}</time><span class="lg-r">${e.kind === 'income' ? 'إيراد' : 'مصروف'}</span><span class="fe-acts"><button class="sec sm" data-fe="${esc(e.id)}">تعديل</button><button class="dng sm" data-fd="${esc(e.id)}">حذف</button></span></div></li>`).join('')}</ul>` : `<div class="card"><p class="empty">${all.length ? 'لا نتائج مطابقة.' : 'لا توجد معاملات بعد. أضف أول إيراد أو مصروف.'}</p></div>`}`;
  };
  const drawFin = () => { const b = $('#finbox'); if (b && route().page === 'finance') b.innerHTML = finHtml(FIN); };
  const loadFin = () => TD.getFinance().then(r => { FIN = r && typeof r === 'object' ? r : null; drawFin(); });
  const normAmt = v => String(v || '').replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[٫,،]/g, '.').replace(/\s/g, '');
  const finForm = (kind, e) => { e = e || { kind, amount: '', date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Qatar' }), category: '', note: '' };
    modal(e.id ? 'تعديل معاملة' : (e.kind === 'income' ? 'إضافة إيراد' : 'إضافة مصروف'), sel('النوع', 'kind', [['income', 'إيراد'], ['expense', 'مصروف']], e.kind) + fld('المبلغ (ر.ق)', 'amount', e.amount, 'text', 'inputmode="decimal" required placeholder="0.00"') + fld('التاريخ', 'date', e.date, 'date', 'required') + fld('التصنيف', 'category', e.category, 'text', 'maxlength="40" list="fcats"') + `<datalist id="fcats">${FCATS.map(c => `<option value="${esc(c)}">`).join('')}</datalist>` + fld('ملاحظة (اختيارية)', 'note', e.note, 'text', 'maxlength="200"'),
      f => St.saveFinance({ ...(e.id ? { id: e.id } : {}), kind: f.kind, amount: normAmt(f.amount), date: f.date, category: f.category, note: f.note })); };
  V.finance = () => {
    if (!St.can('finance')) return denied('المالية');
    return `<h1>المالية</h1><div id="finbox">${FIN ? finHtml(FIN) : '<p class="empty">جارٍ التحميل…</p>'}</div>`;
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
      return `<tr><td class="u-n">${esc(m.display_name)}</td><td class="u-r">${f ? esc(St.ROLES.founder) : `<select data-ur="${esc(m.user_id)}" aria-label="دور ${esc(m.display_name)}">${ROLE_KEYS.map(k => `<option value="${k}" ${k === m.role ? 'selected' : ''}>${esc(St.ROLES[k])}</option>`).join('')}</select>`}</td><td class="u-s"><span class="tag ${m.active ? '' : 'bad'}">${m.active ? 'فعّال' : 'موقوف'}</span></td><td class="u-a">${f ? '' : `<button type="button" class="sec" data-ua="${esc(m.user_id)}" data-to="${m.active ? '0' : '1'}">${m.active ? 'إيقاف' : 'تفعيل'}</button>`}</td></tr>`; }).join('');
    b.innerHTML = tw('المستخدمون', `<thead><tr><th>الاسم</th><th>الدور</th><th>الحالة</th><th></th></tr></thead><tbody>${rows}</tbody>`, 'utbl');
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
  V.site = () => { if (!isPanelUser() || !St.can('settings')) return denied('إدارة الموقع العام'); return `<h1>إدارة الموقع العام</h1><div class="note">يظهر في الموقع ما تفعّله هنا فقط. كل الأقسام مطفأة افتراضيًا. لا يُنشر في الموقع أي هاتف أو بريد أو مدينة لأي لاعب أو عضو.</div><div class="card" id="sitebox"><p>جارٍ التحميل…</p></div><div class="card" id="devbox"><p>جارٍ التحميل…</p></div><div class="card" id="gallerybox"><p>جارٍ التحميل…</p></div><div class="card" id="pushadm"><p>جارٍ التحميل…</p></div>`; };
  const siteForm = r => { const s = r.sections || {};
    return `<div class="row between"><h2>محتوى الموقع</h2><a class="btnlink" href="../../" target="_blank" rel="noopener">عرض الموقع ↗</a></div><form id="sf"><label class="f"><span>نبذة عن الفريق (اختيارية)</span><textarea name="about" rows="3" maxlength="500">${esc(r.about)}</textarea></label><label class="f"><span>إعلان أعلى الموقع (اختياري)</span><input name="announcement" maxlength="200" value="${esc(r.announcement)}"></label><h2>الأقسام الظاهرة في الموقع</h2><div class="secs">${SEC.map(([k, l, n]) => `<label class="ck"><input type="checkbox" name="sec_${esc(k)}" ${s[k] === true ? 'checked' : ''}><span><b>${esc(l)}</b><small>${esc(n)}</small></span></label>`).join('')}</div><button>حفظ الموقع</button></form>`; };
  const loadSite = () => { const box = $('#sitebox'); if (!box) return; TD.getSite().then(r => { const b = $('#sitebox'); if (!b || route().page !== 'site') return; b.innerHTML = r && typeof r === 'object' ? siteForm(r) : '<p>تعذّر تحميل إعدادات الموقع أو لا تملك الصلاحية.</p>'; }); };

  // معرض الصور: تصغير بلا قصّ (أطول ضلع 1600px) ثم رفع متتابع
  const shrinkWide = async file => {
    const im = await loadImg(await readUrl(file)), k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight)), w = Math.max(1, Math.round(im.naturalWidth * k)), h = Math.max(1, Math.round(im.naturalHeight * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(im, 0, 0, w, h);
    let q = 0.84, b = await new Promise(r => c.toBlob(r, 'image/jpeg', q)); while (b && b.size > 1900000 && q > 0.5) { q -= 0.1; b = await new Promise(r => c.toBlob(r, 'image/jpeg', q)); }
    if (!b) throw new Error('blob'); return new File([b], 'photo.jpg', { type: 'image/jpeg' });
  };
  let galData = null;
  const galForm = g => { galData = g; const ph = g.photos || [];
    return `<h2>معرض صور الفريق</h2><div class="secs"><label class="ck"><input type="checkbox" id="gvis" ${g.visible === true ? 'checked' : ''}><span><b>إظهار المعرض في الموقع العام</b><small>${ph.length} من 40 صورة — يظهر فقط إذا كان فيه صور</small></span></label></div>
      ${ph.length ? `<div class="galgrid">${ph.map(x => `<figure class="galtile"><img src="${esc(TD.devPhotoUrl(x.path))}" alt="" loading="lazy"><button type="button" class="galx" data-gd="${esc(x.id)}" aria-label="حذف الصورة">×</button>${x.caption ? `<figcaption>${esc(x.caption)}</figcaption>` : ''}</figure>`).join('')}</div>` : '<p class="muted">لا توجد صور بعد.</p>'}
      <form id="gf"><label class="f"><span>إضافة صور (يمكن اختيار أكثر من صورة)</span><input type="file" name="gphotos" accept="image/jpeg,image/png,image/webp" multiple></label>${fld('تعليق (اختياري، يُطبَّق على كل الصور المرفوعة الآن)', 'gcap', '', 'text', 'maxlength="80"')}<button>رفع الصور</button></form>`; };
  const loadGal = () => { const box = $('#gallerybox'); if (!box) return; TD.getGallery().then(g => { const b = $('#gallerybox'); if (!b || route().page !== 'site') return; b.innerHTML = g && typeof g === 'object' ? galForm(g) : '<h2>معرض صور الفريق</h2><p>هذه الميزة غير مفعّلة بعد في قاعدة البيانات، أو لا تملك صلاحية إدارة الموقع.</p>'; }); };

  // إرسال تنبيه (Web Push) لكل من فعّل التنبيهات في الموقع
  let pushCount = 0;
  const pushForm = r => { pushCount = r.subscribers | 0; const rec = Array.isArray(r.recent) ? r.recent : [];
    return `<h2>إرسال تنبيه للجميع</h2><p class="muted">يصل إلى ${pushCount} جهازًا فعّل التنبيهات من الموقع. على الآيفون يعمل فقط لمن أضاف الموقع إلى الشاشة الرئيسية.</p>
      <form id="pf">${fld('العنوان', 'ptitle', '', 'text', 'maxlength="60" required')}<label class="f"><span>نص التنبيه</span><textarea name="pbody" rows="3" maxlength="160" required></textarea></label>
      <label class="f"><span>عند الضغط يفتح</span><select name="purl"><option value="/">الصفحة الرئيسية</option><option value="/#s-matches">المباريات والنتائج</option><option value="/#s-squad">اللاعبون</option><option value="/#s-gallery">معرض الصور</option></select></label><button>إرسال التنبيه</button></form>
      ${rec.length ? `<h3>آخر التنبيهات</h3><ul class="plist">${rec.map(x => `<li><b>${esc(x.title)}</b> — ${esc(x.body)}<small>${esc(new Date(x.at).toLocaleString('ar'))} · وصل ${x.sent | 0} · فشل ${x.failed | 0}${x.by ? ' · ' + esc(x.by) : ''}</small></li>`).join('')}</ul>` : ''}`; };
  const loadPush = () => { const box = $('#pushadm'); if (!box) return; TD.getPushStats().then(r => { const b = $('#pushadm'); if (!b || route().page !== 'site') return; b.innerHTML = r && typeof r === 'object' ? pushForm(r) : '<h2>إرسال تنبيه للجميع</h2><p>هذه الميزة غير مفعّلة بعد في قاعدة البيانات، أو لا تملك صلاحية إدارة الموقع.</p>'; }); };

  // بطاقة «عن مطوّر التطبيق»: الاسم والصفة والنبذة والصورة، تظهر في الموقع العام عند التفعيل فقط
  let devPhoto = '';
  const devForm = r => { devPhoto = r.photo || ''; const u = TD.devPhotoUrl(devPhoto);
    return `<h2>عن مطوّر التطبيق</h2><form id="df"><div class="devrow"><div class="devpic">${u ? `<img src="${esc(u)}" alt="">` : '<span>بلا صورة</span>'}</div><div class="devpick"><label class="f"><span>الصورة (JPEG أو PNG أو WebP)</span><input type="file" name="photo" accept="image/jpeg,image/png,image/webp"></label>${u ? '<div class="secs"><label class="ck"><input type="checkbox" name="rmphoto"><span><b>حذف الصورة الحالية</b></span></label></div>' : ''}</div></div>${fld('الاسم', 'name', r.name, 'text', 'maxlength="60"')}${fld('الصفة', 'title', r.title || 'مطوّر ومصمم التطبيق', 'text', 'maxlength="60"')}<label class="f"><span>نبذة قصيرة (اختيارية)</span><textarea name="bio" rows="3" maxlength="300">${esc(r.bio)}</textarea></label><div class="secs"><label class="ck"><input type="checkbox" name="visible" ${r.visible === true ? 'checked' : ''}><span><b>إظهار القسم في الموقع العام</b><small>يتطلب كتابة الاسم</small></span></label></div><button>حفظ بطاقة المطوّر</button></form>`; };
  const loadDev = () => { const box = $('#devbox'); if (!box) return; TD.getDeveloper().then(r => { const b = $('#devbox'); if (!b || route().page !== 'site') return; b.innerHTML = r && typeof r === 'object' ? devForm(r) : '<h2>عن مطوّر التطبيق</h2><p>هذه الميزة غير مفعّلة بعد في قاعدة البيانات، أو لا تملك صلاحية إدارة الموقع.</p>'; }); };

  // ---- العرض والأحداث ----
  const safeColor = c => /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#0b6b3a';
  let lastRoute = null;
  function render() {
    const logged = !!St.user().role;
    $('#loginView').hidden = logged; $('#shell').hidden = !logged;
    if (!logged) { if (window.CoachUI) CoachUI.reset(); const m = $('#modal'); if (m.open) m.close(); m.innerHTML = ''; $('#view').innerHTML = ''; return; }  // لا تبقى بيانات الجلسة السابقة في الصفحة
    let { page, id } = route(); const v = $('#view');
    // أدوار التطبيق لا ترى «لوحة التحكم» إطلاقًا: الصفحة الرئيسية ومسار غير معروف يحوّلان إلى شاشتها في التطبيق
    if (!isPanelUser() && (page === 'dash' || !Object.prototype.hasOwnProperty.call(V, page))) { page = St.user().role === 'coach' ? 'coach' : 'matches'; history.replaceState(null, '', '#/' + page); id = undefined; }
    // لون أزرار اللوحة ثابت (هوية الفريق)؛ «لون الفريق» من الإعدادات يخصّ الموقع العام فقط
    $('#teamName').textContent = St.team().name;
    $('#nav').innerHTML = navFor(page); $('#crumb').textContent = TITLES[Object.prototype.hasOwnProperty.call(V, page) ? page : 'dash'] || ''; if (lastRoute !== page + '/' + id) { document.body.classList.remove('menu-open'); $('#menuBtn').setAttribute('aria-expanded', 'false'); } lastRoute = page + '/' + id;   // القائمة تُغلق عند تغيّر الصفحة فقط، لا عند كل تحديث خلفي (كان يُغلقها فجأة ويضيّع اللمس)
    $('#whoName').textContent = (St.user().name || '') + ' — ' + (St.ROLES[St.user().role] || '');
    v.innerHTML = (Object.prototype.hasOwnProperty.call(V, page) ? V[page] : V.dash)(id);  // لا نقرأ مفاتيح النموذج الأولي (constructor…)
    if ((page === 'pitch' || page === 'coach') && window.CoachUI) CoachUI.bind(v, St.can('lineup'));
    if (page === 'players' && St.can('viewPlayers')) drawPlayers();
    if (page === 'site') { loadSite(); loadDev(); loadGal(); loadPush(); }
    if (page === 'finance' && St.can('finance')) loadFin();
    if (page === 'roles' && isFounder()) loadRoles();
    if (page === 'users' && isFounder()) loadUsers();
  }
  if (window.CoachUI) CoachUI.init({ St, S, esc, num, avatar, toast, render: () => render(), TD });
  const fail = async p => { const er = await p; if (er) { toast(er); render(); } return !!er; };
  St.on(render); window.addEventListener('hashchange', render);
  const setMenu = o => { document.body.classList.toggle('menu-open', o); $('#menuBtn').setAttribute('aria-expanded', String(o)); };
  $('#menuBtn').onclick = () => setMenu(!document.body.classList.contains('menu-open'));
  $('#scrim').onclick = () => setMenu(false);
  $('#scrim').addEventListener('touchmove', e => e.preventDefault(), { passive: false });   // iOS: لا تتحرك الصفحة خلف القائمة المفتوحة
  $('#nav').addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });   // لمس الصفحة الحالية لا يغيّر الرابط فلا يحدث تحديث: نغلق القائمة صراحةً
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
  const v = $('#view');
  v.addEventListener('input', e => { if (['q'].includes(e.target.id)) drawPlayers(); if (e.target.id === 'finq') { finQ = e.target.value; const pos = e.target.selectionStart; drawFin(); const n = $('#finq'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) {} } } });
  v.addEventListener('change', e => {
    const t = e.target, d = t.dataset;
    if (t.id === 'fp' || t.id === 'fs') drawPlayers();
    if (t.id === 'gvis') { fail(TD.setGalleryVisible(t.checked)).then(bad => { if (!bad) toast(SAVED); loadGal(); }); }
    if (t.id === 'ses') { sesId = t.value; render(); }
    if (t.id === 'finm') { finM = t.value; drawFin(); }
    if (t.id === 'fint') { finT = t.value; drawFin(); }
    if (d.st) { const ids = [...v.querySelectorAll('[data-st]:checked')].map(x => x.dataset.st); if (ids.length > 11) { t.checked = false; return toast('الحد الأقصى 11 لاعبًا'); } fail(St.setStarters(ids)); }
    if (d.at) { const c = curSes(); if (!c) { t.checked = false; return toast('أضف حصة تدريب أولًا'); } fail(St.setAtt(c, d.at, t.checked)); }
    if (d.rp) { const [rl, pm] = d.rp.split('|'); fail(TD.setPerm(rl, pm, t.checked)); }
    if (d.ur && confirm('تغيير دور هذا المستخدم؟')) fail(TD.setMemberRole(d.ur, t.value)); else if (d.ur) render();
    if (d.th || d.pl) { const id = d.th || d.pl, c = v.querySelector(`[data-m="${CSS.escape(id)}"]`); fail(St.setResult(id, +c.querySelector('[data-th]').value || 0, c.querySelector('[data-pl]').checked)); }
  });
  v.addEventListener('click', e => {
    const t = e.target, d = t.dataset, id = t.id;
    if (d.as) { const ids = S.lineup.starters; if (ids.length >= 11) return toast('الحد الأقصى 11 لاعبًا'); fail(St.setStarters([...ids, d.as])); }
    if (d.gd && confirm('حذف هذه الصورة من المعرض؟')) { const ph = ((galData && galData.photos) || []).find(x => x.id === d.gd); fail(TD.deleteGalleryPhoto(d.gd, ph && ph.path)).then(bad => { if (!bad) toast('تم الحذف'); loadGal(); }); }
    if (d.rs) fail(St.setStarters(S.lineup.starters.filter(x => x !== d.rs)));
    if (id === 'addp') playerForm();
    if (id === 'edp') playerForm(St.player(route().id));
    if (id === 'delp' && confirm('حذف هذا اللاعب؟')) { fail(St.delPlayer(route().id)).then(bad => { if (!bad) location.hash = '#/players'; }); }
    if (id === 'unregp' && confirm('إلغاء تسجيل هذا اللاعب؟ يبقى سجله التاريخي محفوظًا.')) { fail(St.unregisterPlayer(route().id)); }
    if (id === 'addinc') finForm('income');
    if (id === 'addexp') finForm('expense');
    if (d.fe && FIN) finForm(null, (FIN.entries || []).find(x => x.id === d.fe));
    if (d.fd && confirm('حذف هذه المعاملة؟')) fail(St.delFinance(d.fd)).then(bad => { if (!bad) toast('تم الحذف'); });
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
    if (e.target.id === 'df') { e.preventDefault(); const form = e.target, fd = new FormData(form), file = fd.get('photo'), btn = form.querySelector('button'); btn.disabled = true;
      (async () => {
        let er = await TD.saveDeveloper({ name: String(fd.get('name') || ''), title: String(fd.get('title') || ''), bio: String(fd.get('bio') || ''), visible: fd.has('visible') });
        if (!er && file && file.size) { let up; try { up = await shrink(file); } catch (_) { er = 'حُفظت البيانات لكن تعذّر قراءة الصورة'; } if (up) er = await TD.setDeveloperPhoto(up, devPhoto); }
        else if (!er && fd.has('rmphoto') && devPhoto) er = await TD.delDeveloperPhoto(devPhoto);
        toast(er || SAVED); loadDev();
      })().finally(() => { btn.disabled = false; });
    }
    if (e.target.id === 'pf') { e.preventDefault(); const form = e.target, fd = new FormData(form), ti = String(fd.get('ptitle') || '').trim(), bo = String(fd.get('pbody') || '').trim(), u = String(fd.get('purl') || '/'), btn = form.querySelector('button');
      if (!ti || !bo) { toast('اكتب العنوان والنص'); return; }
      if (!confirm('إرسال التنبيه إلى ' + pushCount + ' جهازًا الآن؟ لا يمكن التراجع بعد الإرسال.')) return;
      btn.disabled = true; TD.sendPush(ti, bo, u).then(r => { if (r.err) { toast(r.err); btn.disabled = false; } else { toast('أُرسل التنبيه: وصل ' + r.sent + ' وفشل ' + r.failed); loadPush(); } }); return; }
    if (e.target.id === 'gf') { e.preventDefault(); const form = e.target, fd = new FormData(form), files = fd.getAll('gphotos').filter(f => f && f.size), cap = String(fd.get('gcap') || ''), btn = form.querySelector('button');
      if (!files.length) return toast('اختر صورة واحدة على الأقل'); if (files.length + ((galData && galData.photos) || []).length > 40) return toast('الحد الأقصى 40 صورة في المعرض');
      btn.disabled = true;
      (async () => { let ok = 0, er = ''; for (const f of files) { let up; try { up = await shrinkWide(f); } catch (_) { er = 'تعذّر قراءة إحدى الصور'; continue; } er = await TD.addGalleryPhoto(up, cap); if (er) break; ok++; toast(`رُفعت ${ok} من ${files.length}`); }
        toast(er ? (ok ? `رُفعت ${ok} وتوقف الباقي: ${er}` : er) : SAVED); loadGal(); })().finally(() => { btn.disabled = false; });
    }
    if (e.target.id === 'uf') { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); fail(TD.addMemberByEmail(f.email.trim(), f.name.trim(), f.role)).then(bad => { if (!bad) toast(SAVED); }); }
    if (e.target.id === 'tf') { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); St.saveTeam({ name: f.name, city: f.city, color: f.color }).then(er => toast(er || SAVED)); }
  });
  render();
})();
