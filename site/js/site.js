// الموقع العام: يعرض «لقطة عامة» فقط ولا يحتوي أي محتوى ثابت ولا يحمّل أي كود من لوحة التحكم (لا Store ولا data ولا صلاحيات).
// مصدر المحتوى: دالة Supabase العامة rpc_public_site التي تتحكم فيها لوحة التحكم (لا لقطة محلية ولا بيانات ثابتة).
// كل نص يمر عبر esc() وكل رقم عبر num() قبل دخوله في HTML.
(function () {
  const KEY = 'mt.public.snapshot.v1', CH = 'mt-public-site', $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
  const num = v => Number.isFinite(+v) ? +v : 0;
  const color = c => /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#0b6b3a';
  const ini = n => esc(String(n ?? '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join(' '));
  // الصورة: مسار تخزين من الخادم (UUID/UUID/UUID.jpg|png|webp) يُحوَّل إلى رابط عام لحاوية player-photos فقط، أو JPEG data URL؛ أي قيمة أخرى تُتجاهل
  const PH_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/, SB_RE = /^https:\/\/[a-z0-9]{10,30}\.supabase\.co$/;
  const photoUrl = path => { const u = (window.PUBLIC_CONFIG || {}).SUPABASE_URL; return typeof path === 'string' && PH_RE.test(path) && SB_RE.test(u || '') ? u + '/storage/v1/object/public/player-photos/' + path : null; };
  const photo = (p, alt) => { const u = photoUrl(p.photo); if (u) return `<img src="${esc(u)}" alt="${esc(alt)}" decoding="async">`; return typeof p.photo === 'string' && p.photo.length < 150000 && /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(p.photo) ? `<img src="${p.photo}" alt="${esc(alt)}">` : null; };
  const POSCLS = { 'حارس': 'gk', 'مدافع': 'df', 'مهاجم': 'fw' };
  const fmt = (d, o) => { const t = new Date(String(d) + 'T00:00:00'); return isNaN(t) ? esc(d) : esc(t.toLocaleDateString('ar-u-nu-latn', o)); };
  const longDate = d => fmt(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const shortDate = d => fmt(d, { day: 'numeric', month: 'short', year: 'numeric' });
  let TEAM = 'الفريق';
  const sides = m => { const us = esc(TEAM), o = esc(m.opp); return m.home ? [us, o] : [o, us]; };
  const outcome = m => { const a = num(m.us), b = num(m.them); return a > b ? ['w', 'فوز'] : a < b ? ['l', 'خسارة'] : ['d', 'تعادل']; };
  const where = m => m.home ? 'على أرضنا' : 'خارج الأرض';
  const matchCard = m => {
    const [A, B] = sides(m), r = m.played ? outcome(m) : ['u', 'قادمة'];
    // الرقمان بترتيب الفريقين نفسه (الأول من اليمين)، فيجاور كل رقم فريقه
    const mid = m.played ? `<span class="sc">${m.home ? num(m.us) : num(m.them)} - ${m.home ? num(m.them) : num(m.us)}</span>` : '<span class="mid">×</span>';
    return `<article class="card m"><div class="top"><span>${shortDate(m.date)} · ${where(m)}</span><span class="res ${r[0]}">${r[1]}</span></div><div class="vs"><span class="tm">${A}</span>${mid}<span class="tm">${B}</span></div></article>`;
  };
  // ---------- اللاعبون: ملعب التشكيلة + الاحتياط + بطاقة اللاعب ----------
  let SQ = [], SF = [], LST = SQ, MODE = 'p'; // لاعبو القسم الحالي وأعضاء الطاقم (تُقرأ منها البطاقة عند الضغط)
  const MARKS = ['pk-h', 'pk-c', 'pk-cs', 'pk-pa t', 'pk-pa b', 'pk-ga t', 'pk-ga b', 'pk-ar t', 'pk-ar b', 'pk-sp t', 'pk-sp b'].map(c => `<i class="pk ${c}" aria-hidden="true"></i>`).join('');
  // مرآة إحداثيات admin/live/live-coach.js (يتحقق اختبار tools/test_lineup_ui.py من تطابقهما)
  const XYS = {
    '4-4-2':   [[50, 90], [12, 72], [37, 72], [63, 72], [88, 72], [12, 48], [37, 48], [63, 48], [88, 48], [33, 22], [67, 22]],
    '4-3-3':   [[50, 90], [12, 72], [37, 72], [63, 72], [88, 72], [22, 48], [50, 48], [78, 48], [18, 20], [50, 18], [82, 20]],
    '3-5-2':   [[50, 90], [22, 72], [50, 72], [78, 72], [10, 47], [30, 47], [50, 47], [70, 47], [90, 47], [35, 21], [65, 21]],
    '4-2-3-1': [[50, 91], [12, 74], [37, 74], [63, 74], [88, 74], [35, 57], [65, 57], [18, 38], [50, 38], [82, 38], [50, 17]]
  };
  const LINES = ['مهاجم', 'وسط', 'مدافع', 'حارس']; // المهاجمون في الأعلى والحارس في الأسفل
  const SIL = '<svg class="sil" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="25" r="11"/><path d="M8 64c2-17 13-25 24-25s22 8 24 25z"/></svg>';
  // أي صورة تفشل في التحميل (رابط محذوف أو شبكة) تُستبدل بالرمز البديل بدل ظهور نص مبتور
  document.addEventListener('error', e => { const i = e.target; if (i && i.tagName === 'IMG' && i.closest('.av, .pcard-av, .stf-av')) i.replaceWith(Object.assign(document.createElement('span'), { innerHTML: SIL }).firstChild); }, true);
  const av = p => photo(p, p.name) || SIL;
  const dot = (p, i, sm) => `<button type="button" class="pp${sm ? ' sm' : ''}" data-i="${i}" aria-haspopup="dialog" aria-label="بطاقة ${esc(p.name)}"><span class="av">${av(p)}</span><b class="no">${num(p.num)}</b><span class="nm">${esc(p.name)}</span></button>`;
  function squadHtml(s) {
    SQ = s.players; LST = SQ; if (!SQ.length) return '<p class="empty">لا لاعبين بعد.</p>';
    const all = SQ.map((p, i) => [p, i]), flagged = all.filter(([p]) => p.st === 1);
    // إن لم تُحدَّد تشكيلة أساسية في لوحة الإدارة: كل اللاعبين على الملعب موزّعين حسب المركز. ومن مركزه غير معروف يذهب إلى الاحتياط
    const st = flagged.filter(([p]) => LINES.includes(p.pos)), onPitch = new Set(st.map(([, i]) => i));
    const bench = all.filter(([, i]) => !onPitch.has(i));
    // 0014: إن أرسل الخادم الخطة وخانة كل أساسي (وكانت كل الخانات صالحة وغير مكررة) نرسم اللاعبين على خانات الخطة مع شارة القائد؛ وإلا نبقى على الرسم القديم بالخطوط
    const XY = XYS[s.formation];
    if (XY && st.length && st.every(([p]) => Number.isInteger(p.slot) && p.slot >= 1 && p.slot <= 11) && new Set(st.map(([p]) => p.slot)).size === st.length) {
      const fm2 = `<span class="fm">التشكيلة <bdi dir="ltr">${esc(s.formation)}</bdi></span>`;
      const sl = st.map(([p, i]) => `<div class="sl" style="left:${XY[p.slot - 1][0]}%;top:${XY[p.slot - 1][1]}%">${dot(p, i)}${p.cap ? '<i class="cb" aria-hidden="true" title="القائد">C</i>' : ''}</div>`).join('');
      return `<div class="card lineup"><p class="hint">اضغط على أي لاعب لفتح بطاقته الكاملة.</p><div class="field fx">${fm2}${MARKS}${sl}</div>${bench.length ? `<h3 class="sub-h bench-h">الاحتياط</h3><div class="bench">${bench.map(([p, i]) => dot(p, i, true)).join('')}</div>` : ''}</div>`;
    }
    const lines = LINES.map(pos => { const l = st.filter(([p]) => p.pos === pos); return `<div class="line">${l.length ? l.map(([p, i]) => dot(p, i)).join('') : '<span class="slot" aria-hidden="true">—</span>'}</div>`; }).join('');
    const fm = typeof s.formation === 'string' && /^\d(-\d){1,3}$/.test(s.formation) ? `<span class="fm">التشكيلة <bdi dir="ltr">${esc(s.formation)}</bdi></span>` : '';
    return `<div class="card lineup"><p class="hint">اضغط على أي لاعب لفتح بطاقته الكاملة.</p><div class="field">${fm}${MARKS}${lines}${st.length ? '' : '<p class="empty fe">لم تُعلن التشكيلة الأساسية بعد.</p>'}</div>${bench.length ? `<h3 class="sub-h bench-h">الاحتياط</h3><div class="bench">${bench.map(([p, i]) => dot(p, i, true)).join('')}</div>` : ''}</div>`;
  }
  // بطاقة اللاعب (نافذة): صورة كبيرة، الاسم والرقم والمركز، وإحصاءات المباريات. لا بيانات اتصال تُنشر في الموقع العام.
  let dlg = null, last = null, cur = -1;
  const stat = (n, l, c) => `<div class="ps ${c || ''}"><b>${num(n)}</b><span>${l}</span></div>`;
  function cardHtml(p) {
    const ph = photo(p, p.name), hasSt = SQ.some(x => x.st === 1), role = p.st === 1 ? 'التشكيلة الأساسية' : (hasSt ? 'الاحتياط' : 'اللاعبون');
    return `<div class="pcard-top"><div class="pcard-av">${ph || SIL}</div><span class="pcard-no" aria-hidden="true">${num(p.num)}</span></div>
      <h3 id="pcard-t">${esc(p.name)}</h3>
      <div class="pcard-tags"><span class="pos ${POSCLS[p.pos] || ''}">${esc(p.pos)}</span><span class="tag2">رقم القميص ${num(p.num)}</span><span class="tag2 ${p.st === 1 ? 'on' : ''}">${role}</span></div>
      <div class="pstats">${stat(p.apps, 'مشاركة')}${stat(p.goals, 'هدف', 'g')}${stat(p.yellow, 'بطاقة صفراء', 'y')}${stat(p.red, 'بطاقة حمراء', 'r')}</div>`;
  }
  function staffCardHtml(x) {
    const ph = photo(x, x.name);
    return `<div class="pcard-top"><div class="pcard-av">${ph || SIL}</div></div>
      <h3 id="pcard-t">${esc(x.name)}</h3>
      <div class="pcard-tags"><span class="pos">${esc(x.role)}</span><span class="tag2 ${x.kind === 'إداري' ? 'on' : ''}">${x.kind === 'إداري' ? 'الإدارة' : 'الطاقم الفني'}</span></div>`;
  }
  function ensureDlg() {
    if (dlg) return dlg;
    dlg = document.createElement('div'); dlg.className = 'pmodal'; dlg.hidden = true;
    dlg.innerHTML = '<div class="pm-bd" data-close></div><div class="pm-box" role="dialog" aria-modal="true" aria-labelledby="pcard-t"><button type="button" class="pm-x" data-close aria-label="إغلاق">×</button><div class="pm-body"></div><div class="pm-nav"><button type="button" data-go="-1" aria-label="اللاعب السابق">→ السابق</button><button type="button" data-go="1" aria-label="اللاعب التالي">التالي ←</button></div></div>';
    dlg.addEventListener('click', e => { if (e.target.closest('[data-close]')) return closeCard(); const g = e.target.closest('[data-go]'); if (g) show((cur + +g.dataset.go + LST.length) % LST.length); });
    document.body.appendChild(dlg); return dlg;
  }
  function show(i) { const p = LST[i]; if (!p) return; cur = i; const d = ensureDlg(); d.querySelector('.pm-body').innerHTML = MODE === 's' ? staffCardHtml(p) : cardHtml(p); d.querySelector('.pm-nav').hidden = LST.length < 2; }
  function openCard(i, from, mode) { MODE = mode === 's' ? 's' : 'p'; LST = MODE === 's' ? SF : SQ; if (!LST[i]) return; last = from || null; const d = ensureDlg(); show(i); d.hidden = false; document.documentElement.classList.add('pm-lock'); d.querySelector('.pm-x').focus(); }
  function closeCard() { if (!dlg || dlg.hidden) return; dlg.hidden = true; document.documentElement.classList.remove('pm-lock'); if (last && document.contains(last)) last.focus(); }
  document.addEventListener('keydown', e => {
    if (!dlg || dlg.hidden) return;
    if (e.key === 'Escape') return closeCard();
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); show((cur + (e.key === 'ArrowLeft' ? 1 : -1) + LST.length) % LST.length); }
    if (e.key === 'Tab') { const f = [...dlg.querySelectorAll('button:not([hidden])')].filter(b => b.offsetParent !== null || b === document.activeElement); if (!f.length) return; const a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
  });
  document.addEventListener('click', e => { const t = e.target.closest('#s-squad [data-i]'), u = e.target.closest('#s-staff [data-s]'); if (t) openCard(+t.dataset.i, t, 'p'); else if (u) openCard(+u.dataset.s, u, 's'); });
  document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('#s-squad article[data-i], #s-staff article[data-s]')) { e.preventDefault(); const sf = e.target.dataset.s != null; openCard(+(sf ? e.target.dataset.s : e.target.dataset.i), e.target, sf ? 's' : 'p'); } });
  // مفاتيح هذا السجل هي نفسها مفاتيح Store.SITE في لوحة التحكم؛ يتحقق منها tools/test_site_sync.js
  const NAVI = { about: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5M12 8h.01', squad: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.3M15.5 4.2a3.5 3.5 0 0 1 0 6.6', staff: 'M3 8h18v12H3zM9 8V5h6v3', matches: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', scorers: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 8l3 2-1 3.5h-4L9 10z' };
  const R = {
    about: s => `<div class="card about"><p>${esc(s.text)}</p></div>`,
    developer: s => { const d = s.dev, im = photo({ photo: d.photo }, d.name);
      return `<div class="card devcard"><div class="dev-pic">${im || `<span>${ini(d.name)}</span>`}</div><div class="dev-txt"><b class="dev-n">${esc(d.name)}</b>${d.title ? `<span class="dev-t">${esc(d.title)}</span>` : ''}${d.bio ? `<p>${esc(d.bio)}</p>` : ''}</div></div>`; },
    squad: s => squadHtml(s),
    staff: s => {
      SF = s.staff; if (!SF.length) return '<p class="empty">لا أعضاء بعد.</p>';
      const card = (x, i) => `<article class="stf-card" data-s="${i}" tabindex="0" role="button" aria-haspopup="dialog" aria-label="بطاقة ${esc(x.name)}"><span class="stf-av">${photo(x, x.name) || SIL}</span><b class="stf-nm">${esc(x.name)}</b><span class="stf-role">${esc(x.role)}</span><span class="stf-kind ${x.kind === 'إداري' ? 'adm' : 'tech'}">${x.kind === 'إداري' ? 'الإدارة' : 'الطاقم الفني'}</span></article>`;
      const grp = (title, f) => { const l = SF.map((x, i) => [x, i]).filter(([x]) => f(x)); return l.length ? `<h3 class="stf-h">${title}</h3><div class="stf-grid">${l.map(([x, i]) => card(x, i)).join('')}</div>` : ''; };
      return grp('الإدارة', x => x.kind === 'إداري') + grp('الطاقم الفني', x => x.kind !== 'إداري');
    },
    matches: s => {
      const up = s.matches.filter(m => !m.played).sort((a, b) => String(a.date).localeCompare(String(b.date))), pl = s.matches.filter(m => m.played).sort((a, b) => String(b.date).localeCompare(String(a.date)));
      return (up.length ? `<h3 class="sub-h">المباريات القادمة</h3><div class="mgrid">${up.map(matchCard).join('')}</div>` : '') + (pl.length ? `<h3 class="sub-h">النتائج</h3><div class="mgrid">${pl.map(matchCard).join('')}</div>` : '') || '<p class="empty">لا مباريات بعد.</p>';
    },
    scorers: s => { const max = Math.max(1, ...s.rows.map(r => num(r.goals))); return s.rows.length ? `<div class="card lb">${s.rows.map((r, i) => `<div class="lb-r"><span class="rk">${i + 1}</span><div class="lbw"><span class="lav">${photo(r, r.name) || ini(r.name)}</span><div class="lbm"><div class="nm">${esc(r.name)}</div><div class="bar"><i style="width:${Math.round(num(r.goals) / max * 100)}%"></i></div></div></div><div class="goals">${num(r.goals)}<small>هدف · ${num(r.apps)} مشاركة</small></div></div>`).join('')}</div>` : '<p class="empty">لا أهداف بعد.</p>'; }
  };
  // العدّ التنازلي بالأيام (التاريخ فقط بلا ساعة)، بحسب تاريخ اليوم في قطر
  const untilLabel = d => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d)); if (!m) return 'قريبًا';
    const t = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Qatar' }).split('-').map(Number);
    const n = Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(t[0], t[1] - 1, t[2])) / 864e5);
    return n < 0 ? 'بانتظار تسجيل النتيجة' : n === 0 ? 'اليوم' : n === 1 ? 'غدًا' : n === 2 ? 'بعد يومين' : n <= 10 ? 'بعد ' + n + ' أيام' : 'بعد ' + n + ' يومًا';
  };
  function hero(d, secs) {
    const get = k => secs.find(s => s.key === k), ms = get('matches'), sq = get('squad'), sc = get('scorers'), st = [];
    if (sq) st.push([sq.players.length, 'لاعبًا']);
    if (ms) { const pl = ms.matches.filter(m => m.played); st.push([pl.length, 'مباراة لُعبت'], [pl.filter(m => num(m.us) > num(m.them)).length, 'فوز']); }
    if (sc && sc.rows[0]) st.push([num(sc.rows[0].goals), 'أهداف الهداف']);
    $('#stats').innerHTML = st.map(([n, l]) => `<div class="stat"><b>${num(n)}</b><span>${esc(l)}</span></div>`).join('');
    const next = ms && ms.matches.filter(m => !m.played).sort((a, b) => String(a.date).localeCompare(String(b.date)))[0], h = $('#heroNext');
    if (next) { const [A, B] = sides(next); h.innerHTML = `<div class="lbl"><span>المباراة القادمة</span><span class="pill">${esc(untilLabel(next.date))}</span></div><div class="vs"><span class="tm">${A}</span><span class="mid">×</span><span class="tm">${B}</span></div><div class="meta"><span>${longDate(next.date)}</span><span>${where(next)}</span></div>`; h.hidden = false; }
    else { h.innerHTML = ''; h.hidden = true; }
  }
  function draw(raw) {
    let snap; try { snap = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return false; }
    if (!snap || snap.v !== 1 || !snap.data || !snap.data.team || !Array.isArray(snap.data.sections)) return false;
    closeCard(); const d = snap.data; TEAM = String(d.team.name || 'الفريق');
    document.documentElement.style.setProperty('--p', color(d.team.color));
    document.title = TEAM + ' — الجالية الموريتانية في قطر';
    ['#bname', '#tname', '#fname'].forEach(i => { $(i).textContent = TEAM; });
    $('#tcity').textContent = d.team.city || '';
    const a = $('#ann'); a.textContent = d.announcement || ''; a.hidden = !d.announcement;
    const secs = d.sections.filter(s => Object.prototype.hasOwnProperty.call(R, s.key));
    $('#snav').innerHTML = secs.map(s => `<a href="#s-${esc(s.key)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${NAVI[s.key] || NAVI.about}"/></svg><span>${esc(s.label)}</span></a>`).join('');
    $('#sv').innerHTML = secs.length ? secs.map(s => `<section class="sec" id="s-${esc(s.key)}"><h2 class="sec-h">${esc(s.label)}</h2>${R[s.key](s)}</section>`).join('') : '<p class="empty">لا توجد أقسام ظاهرة حاليًا.</p>';
    hero(d, secs);
    $('#stamp').textContent = snap.t ? 'آخر تحديث: ' + new Date(snap.t).toLocaleTimeString('ar-u-nu-latn', { hour: '2-digit', minute: '2-digit' }) : '';
    return true;
  }
  // قائمة الجوال
  const hdr = $('#hdr'), burger = $('#burger'), nav = $('#snav');
  const setMenu = o => { nav.classList.toggle('open', o); hdr.classList.toggle('open', o); burger.setAttribute('aria-expanded', String(o)); };
  burger.onclick = () => setMenu(!nav.classList.contains('open'));
  nav.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
  // تحميل المحتوى من Supabase: الدالة العامة rpc_public_site (قائمة بيضاء من الحقول؛ لا هاتف ولا بريد). ما تُطفئه لوحة التحكم لا يُرسل أصلًا.
  const CFG = window.PUBLIC_CONFIG || {};
  const toSnap = (j, dev) => {
    if (!j || !j.team) throw 0;
    const S = j.sections || {}, secs = [];
    if (j.about) secs.push({ key: 'about', label: 'عن الفريق', text: j.about });
    if (S.players) secs.push({ key: 'squad', label: 'اللاعبون', players: (j.players || []).map(p => ({ name: p.name, num: p.num, pos: p.pos, photo: p.photo, st: p.st === true ? 1 : 0, cap: p.cap === true, slot: Number.isInteger(p.slot) ? p.slot : null })), formation: typeof j.formation === 'string' ? j.formation : '' });
    if (S.staff) secs.push({ key: 'staff', label: 'الطاقم', staff: (j.staff || []).map(x => ({ name: x.name, role: x.role, kind: x.kind, photo: x.photo })) });
    if (S.matches) secs.push({ key: 'matches', label: 'المباريات والنتائج', matches: (j.matches || []).map(m => ({ opp: m.opp, date: m.date, home: m.home, played: m.played, us: m.us, them: m.them })) });
    if (S.stats) secs.push({ key: 'scorers', label: 'الهدافون', rows: (j.scorers || []).map(r => ({ name: r.name, goals: r.goals, apps: r.apps })) });
    if (dev && typeof dev.name === 'string' && dev.name.trim()) secs.push({ key: 'developer', label: 'عن مطوّر التطبيق', dev: { name: dev.name.slice(0, 60), title: String(dev.title || '').slice(0, 60), bio: String(dev.bio || '').slice(0, 300), photo: dev.photo } });
    return { v: 1, t: new Date().toISOString(), data: { team: j.team, announcement: j.announcement || '', sections: secs } };
  };
  const load = first => {
    if (!CFG.SUPABASE_URL || !CFG.SUPABASE_PUBLISHABLE_KEY) { if (first) $('#sv').innerHTML = '<p class="empty">تعذّر تحميل المحتوى. حاول لاحقًا.</p>'; return; }
    const call = fn => fetch(CFG.SUPABASE_URL + '/rest/v1/rpc/' + fn, { method: 'POST', cache: 'no-store', headers: { apikey: CFG.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' }, body: '{}' }).then(r => { if (!r.ok) throw 0; return r.json(); });
    const dev = call('rpc_public_developer').catch(() => null);   // اختياري: قبل تطبيق 0017 أو عند الخطأ لا يظهر القسم ولا يتأثر باقي الموقع
    call('rpc_public_site').then(j => dev.then(d => { if (!draw(toSnap(j, d))) throw 0; }))
      .catch(() => { if (first) $('#sv').innerHTML = '<p class="empty">تعذّر تحميل المحتوى. حدّث الصفحة أو حاول لاحقًا.</p>'; });
  };
  load(true);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(false); });
})();
