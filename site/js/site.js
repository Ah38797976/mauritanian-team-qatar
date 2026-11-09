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
  // وقت المباراة HH:MM (بتوقيت قطر) بنظام 12 ساعة؛ واسم الملعب نص عادي مُهرَّب (كلاهما اختياري)
  const clock = t => { const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(t || '')); if (!m) return ''; const h = +m[1]; return ((h % 12) || 12) + ':' + m[2] + ' ' + (h < 12 ? 'ص' : 'م'); };
  const venueOf = m => typeof m.venue === 'string' ? m.venue.trim().slice(0, 100) : '';
  const matchCard = m => {
    const [A, B] = sides(m), r = m.played ? outcome(m) : ['u', 'قادمة'];
    const us = esc(TEAM), badge = (name, ours) => `<i class="tb${ours ? ' us' : ''}" aria-hidden="true">${ini(name)}</i>`;
    const [nA, nB] = m.home ? [TEAM, m.opp] : [m.opp, TEAM];
    // الرقمان بترتيب الفريقين نفسه (الأول من اليمين)، فيجاور كل رقم فريقه
    const mid = m.played ? `<span class="sc"><b>${m.home ? num(m.us) : num(m.them)}</b><em>-</em><b>${m.home ? num(m.them) : num(m.us)}</b></span>` : '<span class="mid">VS</span>';
    return `<article class="card m m-${r[0]}"><div class="top"><span class="md">${shortDate(m.date)}</span><span class="res ${r[0]}">${r[1]}</span></div><div class="vs"><span class="tmw">${badge(nA, m.home)}<span class="tm">${A}</span></span>${mid}<span class="tmw">${badge(nB, !m.home)}<span class="tm">${B}</span></span></div><div class="mf"><span class="mw ${m.home ? 'h' : 'a'}">${where(m)}</span>${clock(m.time) ? `<span class="mw tm-c">${clock(m.time)}</span>` : ''}${venueOf(m) ? `<span class="mw vn">${esc(venueOf(m))}</span>` : ''}</div></article>`;
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
  const NAVI = { training: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2', about: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5M12 8h.01', squad: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.3M15.5 4.2a3.5 3.5 0 0 1 0 6.6', staff: 'M3 8h18v12H3zM9 8V5h6v3', matches: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', scorers: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 8l3 2-1 3.5h-4L9 10z' };
  const R = {
    training: s => { const t = s.tr, clk = clock(t.time), v = venueOf(t), me = t.me;
      const rsvp = me ? `<div class="tr-me"><span>أهلًا <b>${esc(me.name)}</b> — هل ستحضر؟</span><div class="tr-btns"><button type="button" class="tr-b${me.status === 'yes' ? ' on' : ''}" data-rsvp="yes" data-sid="${esc(t.id)}">حاضر</button><button type="button" class="tr-b no${me.status === 'no' ? ' on' : ''}" data-rsvp="no" data-sid="${esc(t.id)}">معتذر</button></div>${me.status ? `<small class="tr-s">تم تسجيل ردّك: ${me.status === 'yes' ? 'حاضر' : 'معتذر'}. يمكنك تغييره.</small>` : ''}</div>`
        : `<div class="tr-me"><span>لتأكيد حضورك أدخل رمزك الشخصي (يعطيك إياه المسؤول)</span><div class="tr-code"><input id="trcode" class="pb-i" type="text" maxlength="8" autocomplete="off" autocapitalize="characters" aria-label="رمزك الشخصي" placeholder="الرمز الشخصي"><button type="button" class="tr-b" id="trgo">تأكيد</button></div></div>`;
      return `<div class="card trn"><div class="trn-h"><span class="trn-l">التدريب القادم</span><b class="trn-t">${esc(t.title)}</b></div><div class="trn-d">${longDate(t.date)}</div><div class="trn-chips">${clk ? `<span class="mw tm-c">${clk}</span>` : ''}${v ? `<span class="mw vn">${esc(v)}</span>` : ''}</div>${t.map ? `<a class="tr-map" href="${esc(t.map)}" target="_blank" rel="noopener noreferrer">الموقع على الخريطة</a>` : ''}<div class="trn-c"><b>${t.yes}</b> حاضر · <b>${t.no}</b> معتذر · من ${t.total} لاعبًا</div>${rsvp}<p class="tr-msg" role="status" aria-live="polite"></p></div>`; },
    about: s => `<div class="card about"><p>${esc(s.text)}</p></div>`,
    gallery: s => `<div class="card gal-card"><div class="hg" role="region" aria-roledescription="carousel" aria-label="معرض الصور"><div class="hg-track" tabindex="0">${s.items.map((g, i) => `<button type="button" class="galt hg-slide" data-gi="${i}" aria-label="${esc(g.caption || 'صورة ' + (i + 1))}"><img src="${esc(g.url)}" alt="${esc(g.caption)}" decoding="async"${i ? ' loading="lazy"' : ''}>${g.caption ? `<span class="hg-cap">${esc(g.caption)}</span>` : ''}</button>`).join('')}</div>${s.items.length > 1 ? `<span class="hg-n" aria-live="polite">1 / ${s.items.length}</span><button type="button" class="hg-a hg-prev" aria-label="السابقة">›</button><button type="button" class="hg-a hg-next" aria-label="التالية">‹</button><div class="hg-dots">${s.items.map((g, i) => `<button type="button" class="hg-dot" data-d="${i}" aria-label="صورة ${i + 1}"${i ? '' : ' aria-current="true"'}></button>`).join('')}</div>` : ''}</div></div>`,
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
    scorers: s => { const max = Math.max(1, ...s.rows.map(r => num(r.goals))); return s.rows.length ? `<div class="card lbd">${s.rows.map((r, i) => `<div class="lb-r"><span class="rk">${i + 1}</span><div class="lbw"><span class="lav">${photo(r, r.name) || ini(r.name)}</span><div class="lbm"><div class="nm">${esc(r.name)}</div><div class="bar"><i style="width:${Math.round(num(r.goals) / max * 100)}%"></i></div></div></div><div class="goals">${num(r.goals)}<small>هدف · ${num(r.apps)} مشاركة</small></div></div>`).join('')}</div>` : '<p class="empty">لا أهداف بعد.</p>'; }
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
    if (next) { const [A, B] = sides(next); h.innerHTML = `<div class="lbl"><span>المباراة القادمة</span><span class="pill">${esc(untilLabel(next.date))}</span></div><div class="vs"><span class="tm">${A}</span><span class="mid">×</span><span class="tm">${B}</span></div><div class="meta"><span>${longDate(next.date)}</span>${clock(next.time) ? `<span>${clock(next.time)}</span>` : ''}<span>${where(next)}</span>${venueOf(next) ? `<span>${esc(venueOf(next))}</span>` : ''}</div>`; h.hidden = false; }
    else { h.innerHTML = ''; h.hidden = true; }
  }
  // عدد عناصر القسم (شارة بجانب العنوان)
  const secCount = s => { const n = s.key === 'squad' ? s.players.length : s.key === 'staff' ? s.staff.length : s.key === 'matches' ? s.matches.length : s.key === 'scorers' ? s.rows.length : s.key === 'gallery' ? s.items.length : s.key === 'training' ? s.tr.yes : 0; return n > 0 ? n : 0; };
  // الصفحة الرئيسية = بطاقات الأقسام (خانات). لمس خانة يفتح محتواها وحدها (#s-<قسم>)، وزر «الرئيسية» أو #home يرجع للخانات.
  const UNIT = { squad: 'لاعبًا', staff: 'عضوًا', matches: 'مباراة', scorers: 'هدّافًا', gallery: 'صورة', training: 'حاضر' };
  const route = () => {
    const secsEl = [...document.querySelectorAll('#sv > section.sec')], m = /^#s-([a-z]+)$/.exec(location.hash), cur = m && secsEl.find(e => e.id === 'sv-' + m[1] || e.id === 's-' + m[1]);
    secsEl.forEach(e => e.classList.toggle('cur', e === cur)); document.body.classList.toggle('sec-open', !!cur);
    document.querySelectorAll('#snav a').forEach(a => { const on = cur ? a.getAttribute('href') === '#' + cur.id : a.getAttribute('href') === '#home'; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  window.addEventListener('hashchange', route);
  // تأكيد حضور التدريب: بالرمز الشخصي المحفوظ على الجهاز (نفس رمز التنبيهات)
  document.addEventListener('click', async e => {
    const b = e.target.closest && e.target.closest('[data-rsvp], #trgo'); if (!b) return;
    const card = b.closest('.trn'), msg = card && card.querySelector('.tr-msg'), say = m => { if (msg) msg.textContent = m; };
    const post = (fn, body) => fetch(CFG.SUPABASE_URL + '/rest/v1/rpc/' + fn, { method: 'POST', cache: 'no-store', headers: { apikey: CFG.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => { if (!r.ok) throw 0; return r.json(); });
    if (b.disabled) return; b.disabled = true;
    try {
      if (b.id === 'trgo') {
        const c = String(document.getElementById('trcode').value || '').trim().toUpperCase();
        if (!/^[A-HJ-NP-Z2-9]{8}$/.test(c)) { say('الرمز غير صحيح. تأكد منه.'); return; }
        const j = await post('rpc_public_training', { p_code: c });
        if (!j || !j.me) { say('الرمز غير صحيح. تأكد منه.'); return; }
        try { localStorage.setItem('pushcode', c); } catch (_) {}
        load(false); return;
      }
      let c = ''; try { c = localStorage.getItem('pushcode') || ''; } catch (_) {}
      const r = await post('rpc_training_rsvp', { p: { code: c, status: b.dataset.rsvp, session: b.dataset.sid } });
      if (r === '') { load(false); } else say(typeof r === 'string' && r ? r : 'تعذّر تسجيل الرد. حاول لاحقًا.');
    } catch (_) { say('تعذّر الاتصال. حاول لاحقًا.'); } finally { b.disabled = false; }
  });
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
    $('#snav').innerHTML = `<a href="#home"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/></svg><span>الرئيسية</span></a>` + secs.map(s => `<a href="#s-${esc(s.key)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${NAVI[s.key] || NAVI.about}"/></svg><span>${esc(s.label)}</span></a>`).join('');
    $('#sv').innerHTML = secs.length ? `<nav class="tiles" aria-label="الأقسام">${secs.map(s => { const n = secCount(s); return `<a class="tile" href="#s-${esc(s.key)}"><span class="sec-i" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${NAVI[s.key] || NAVI.about}"/></svg></span><b class="tile-t">${esc(s.label)}</b><small class="tile-n">${n ? n + ' ' + (UNIT[s.key] || '') : 'عرض'}</small></a>`; }).join('')}</nav>` + secs.map(s => { const n = secCount(s); return `<section class="sec" id="s-${esc(s.key)}"><a class="sec-back" href="#home"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg><span>الرئيسية</span></a><h2 class="sec-h"><span class="sec-i" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${NAVI[s.key] || NAVI.about}"/></svg></span><span class="sec-t">${esc(s.label)}</span>${n ? `<em class="sec-n">${n}</em>` : ''}</h2>${R[s.key](s)}</section>`; }).join('') : '<p class="empty">لا توجد أقسام ظاهرة حاليًا.</p>';
    hero(d, secs); route();
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
  // عارض الصور: يفتح بلمس صورة المعرض، أسهم للتنقل، إغلاق بالزر أو الخلفية أو Esc
  const lightbox = (() => { let box = null, list = [], i = 0;
    const show = () => { box.querySelector('img').src = list[i].url; box.querySelector('img').alt = list[i].caption; box.querySelector('.lb-c').textContent = list[i].caption || ''; box.querySelector('.lb-n').textContent = (i + 1) + ' / ' + list.length; };
    const close = () => { if (box) { box.remove(); box = null; document.removeEventListener('keydown', key); } };
    const key = e => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') step(1); else if (e.key === 'ArrowRight') step(-1); };
    const step = d => { i = (i + d + list.length) % list.length; show(); };
    return { open(items, at) { close(); list = items; i = at; box = document.createElement('div'); box.className = 'lb'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
      box.innerHTML = '<button type="button" class="lb-x" aria-label="إغلاق">×</button><button type="button" class="lb-p" aria-label="السابقة">›</button><button type="button" class="lb-nx" aria-label="التالية">‹</button><img alt=""><div class="lb-i"><span class="lb-c"></span><span class="lb-n"></span></div>';
      box.addEventListener('click', e => { const c = e.target.classList; if (c.contains('lb-x') || e.target === box) close(); else if (c.contains('lb-p')) step(-1); else if (c.contains('lb-nx')) step(1); });
      document.body.appendChild(box); document.addEventListener('keydown', key); show(); box.querySelector('.lb-x').focus(); } }; })();
  // شريط المعرض (هيرو): تمرير أفقي أصلي مع snap + أزرار ونقاط + تشغيل تلقائي يتوقف عند اللمس أو إخفاء الصفحة أو تفضيل تقليل الحركة
  const hgIdx = t => Math.max(0, Math.min(t.children.length - 1, Math.round(Math.abs(t.scrollLeft) / Math.max(1, t.clientWidth))));
  const hgGo = (t, i) => { const n = t.children.length; i = (i + n) % n; t.children[i].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); };
  let hgHold = 0;
  document.addEventListener('scroll', e => { const t = e.target; if (!t || !t.classList || !t.classList.contains('hg-track')) return; const i = hgIdx(t), box = t.parentNode;
    box.querySelectorAll('.hg-dot').forEach((d, k) => k === i ? d.setAttribute('aria-current', 'true') : d.removeAttribute('aria-current')); const c = box.querySelector('.hg-n'); if (c) c.textContent = (i + 1) + ' / ' + t.children.length; }, true);
  ['touchstart', 'pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, e => { if (e.target.closest && e.target.closest('.hg')) hgHold = Date.now() + 10000; }, { passive: true }));
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  setInterval(() => { const t = document.querySelector('.hg-track'); if (!t || t.children.length < 2 || document.hidden || Date.now() < hgHold || (reduce && reduce.matches) || document.querySelector('.lb')) return;
    if (!t.offsetParent) return; const r = t.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return; hgGo(t, hgIdx(t) + 1); }, 5000);
  document.addEventListener('click', e => { const el = e.target.closest && e.target.closest('.hg-a, .hg-dot'); if (!el) return; const t = el.closest('.hg').querySelector('.hg-track'); hgHold = Date.now() + 10000;
    hgGo(t, el.classList.contains('hg-dot') ? +el.dataset.d : hgIdx(t) + (el.classList.contains('hg-next') ? 1 : -1)); });
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.galt'); if (!b) return; const all = [...document.querySelectorAll('.galt')]; lightbox.open(all.map(x => ({ url: x.querySelector('img').src, caption: x.querySelector('img').alt })), all.indexOf(b)); });
  const toSnap = (j, dev, gal, trn) => {
    if (!j || !j.team) throw 0;
    const S = j.sections || {}, secs = [];
    if (j.about) secs.push({ key: 'about', label: 'عن الفريق', text: j.about });
    if (trn && typeof trn.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(String(trn.date)) && typeof trn.title === 'string') secs.push({ key: 'training', label: 'التدريب', tr: { id: trn.id, title: trn.title.slice(0, 80), date: trn.date, time: trn.time, venue: trn.venue, map: /^https:\/\/[^\s<>"']+$/.test(String(trn.map || '')) && String(trn.map).length <= 300 ? trn.map : '', yes: num(trn.yes), no: num(trn.no), total: num(trn.total), me: trn.me && typeof trn.me.name === 'string' ? { name: trn.me.name.slice(0, 60), status: trn.me.status === 'yes' || trn.me.status === 'no' ? trn.me.status : '' } : null } });
    if (S.players) secs.push({ key: 'squad', label: 'اللاعبون', players: (j.players || []).map(p => ({ name: p.name, num: p.num, pos: p.pos, photo: p.photo, st: p.st === true ? 1 : 0, cap: p.cap === true, slot: Number.isInteger(p.slot) ? p.slot : null })), formation: typeof j.formation === 'string' ? j.formation : '' });
    if (S.staff) secs.push({ key: 'staff', label: 'الطاقم', staff: (j.staff || []).map(x => ({ name: x.name, role: x.role, kind: x.kind, photo: x.photo })) });
    if (S.matches) secs.push({ key: 'matches', label: 'المباريات والنتائج', matches: (j.matches || []).map(m => ({ opp: m.opp, date: m.date, home: m.home, played: m.played, us: m.us, them: m.them, time: m.time, venue: m.venue })) });
    if (S.stats) secs.push({ key: 'scorers', label: 'الهدافون', rows: (j.scorers || []).map(r => ({ name: r.name, goals: r.goals, apps: r.apps })) });
    if (Array.isArray(gal)) { const items = gal.filter(g => g && photoUrl(g.path)).slice(0, 40).map(g => ({ url: photoUrl(g.path), caption: String(g.caption || '').slice(0, 80) })); if (items.length) secs.push({ key: 'gallery', label: 'معرض الصور', items }); }
    if (dev && typeof dev.name === 'string' && dev.name.trim()) secs.push({ key: 'developer', label: 'عن مطوّر التطبيق', dev: { name: dev.name.slice(0, 60), title: String(dev.title || '').slice(0, 60), bio: String(dev.bio || '').slice(0, 300), photo: dev.photo } });
    return { v: 1, t: new Date().toISOString(), data: { team: j.team, announcement: j.announcement || '', sections: secs } };
  };
  const load = first => {
    if (!CFG.SUPABASE_URL || !CFG.SUPABASE_PUBLISHABLE_KEY) { if (first) $('#sv').innerHTML = '<p class="empty">تعذّر تحميل المحتوى. حاول لاحقًا.</p>'; return; }
    const call = fn => fetch(CFG.SUPABASE_URL + '/rest/v1/rpc/' + fn, { method: 'POST', cache: 'no-store', headers: { apikey: CFG.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' }, body: '{}' }).then(r => { if (!r.ok) throw 0; return r.json(); });
    const dev = call('rpc_public_developer').catch(() => null);   // اختياري: قبل تطبيق 0017 أو عند الخطأ لا يظهر القسم ولا يتأثر باقي الموقع
    const gal = call('rpc_public_gallery').catch(() => null);   // اختياري كذلك
    let code = ''; try { code = localStorage.getItem('pushcode') || ''; } catch (_) {}
    const trn = fetch(CFG.SUPABASE_URL + '/rest/v1/rpc/rpc_public_training', { method: 'POST', cache: 'no-store', headers: { apikey: CFG.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(/^[A-HJ-NP-Z2-9]{8}$/.test(code) ? { p_code: code } : {}) }).then(r => { if (!r.ok) throw 0; return r.json(); }).catch(() => null);   // اختياري: قبل تطبيق 0022 لا يظهر القسم
    call('rpc_public_site').then(j => Promise.all([dev, gal, trn]).then(([d, g, tr]) => { if (!draw(toSnap(j, d, g, tr))) throw 0; }))
      .catch(() => { if (first) $('#sv').innerHTML = '<p class="empty">تعذّر تحميل المحتوى. حدّث الصفحة أو حاول لاحقًا.</p>'; });
  };
  load(true);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(false); });
})();
