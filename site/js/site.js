// الموقع العام: يعرض «لقطة عامة» فقط ولا يحتوي أي محتوى ثابت ولا يحمّل أي كود من لوحة التحكم (لا Store ولا data ولا صلاحيات).
// مصدر اللقطة: (1) إن نشرت لوحة التحكم تعديلًا في هذا المتصفح نفسه (localStorage/BroadcastChannel) فهو الأحدث، (2) وإلا data/public.json (النسخة الافتراضية للزوّار).
// كل نص يمر عبر esc() وكل رقم عبر num() قبل دخوله في HTML.
(function () {
  const KEY = 'mt.public.snapshot.v1', CH = 'mt-public-site', $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
  const num = v => Number.isFinite(+v) ? +v : 0;
  const color = c => /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#0b6b3a';
  const ini = n => esc(String(n ?? '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join(' '));
  // الصورة: JPEG data URL فقط (تأتي من لوحة التحكم)؛ أي قيمة أخرى تُتجاهل
  const photo = (p, alt) => typeof p.photo === 'string' && p.photo.length < 150000 && /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(p.photo) ? `<img src="${p.photo}" alt="${esc(alt)}" loading="lazy">` : null;
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
  const LINES = ['مهاجم', 'وسط', 'مدافع', 'حارس']; // المهاجمون في الأعلى والحارس في الأسفل
  const SIL = '<svg class="sil" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="25" r="11"/><path d="M8 64c2-17 13-25 24-25s22 8 24 25z"/></svg>';
  const av = p => photo(p, p.name) || SIL;
  const dot = (p, i, sm) => `<button type="button" class="pp${sm ? ' sm' : ''}" data-i="${i}" aria-haspopup="dialog" aria-label="بطاقة ${esc(p.name)}"><span class="av">${av(p)}</span><b class="no">${num(p.num)}</b><span class="nm">${esc(p.name)}</span></button>`;
  function squadHtml(s) {
    SQ = s.players; LST = SQ; if (!SQ.length) return '<p class="empty">لا لاعبين بعد.</p>';
    const all = SQ.map((p, i) => [p, i]), flagged = all.filter(([p]) => p.st === 1);
    // إن لم تُحدَّد تشكيلة أساسية في لوحة الإدارة: كل اللاعبين على الملعب موزّعين حسب المركز. ومن مركزه غير معروف يذهب إلى الاحتياط
    const st = (flagged.length ? flagged : all).filter(([p]) => LINES.includes(p.pos));
    const bench = flagged.length ? all.filter(([p]) => p.st !== 1 || !LINES.includes(p.pos)) : all.filter(([p]) => !LINES.includes(p.pos));
    const lines = LINES.map(pos => st.filter(([p]) => p.pos === pos)).filter(l => l.length).map(l => `<div class="line">${l.map(([p, i]) => dot(p, i)).join('')}</div>`).join('');
    const fm = typeof s.formation === 'string' && /^\d(-\d){1,3}$/.test(s.formation) ? `<span class="fm">التشكيلة <bdi dir="ltr">${esc(s.formation)}</bdi></span>` : '';
    return `<div class="card lineup"><p class="hint">اضغط على أي لاعب لفتح بطاقته الكاملة.</p><div class="field">${fm}<i class="m-c"></i><i class="m-h"></i><i class="m-b t"></i><i class="m-b b"></i>${lines}</div>${bench.length ? `<h3 class="sub-h bench-h">الاحتياط</h3><div class="bench">${bench.map(([p, i]) => dot(p, i, true)).join('')}</div>` : ''}</div>`;
  }
  // بطاقة اللاعب (نافذة): صورة كبيرة، الاسم والرقم والمركز، وإحصاءات المباريات. لا بيانات اتصال تُنشر في الموقع العام.
  let dlg = null, last = null, cur = -1;
  const stat = (n, l, c) => `<div class="ps ${c || ''}"><b>${num(n)}</b><span>${l}</span></div>`;
  function cardHtml(p) {
    const ph = photo(p, p.name), role = p.st === 1 ? 'التشكيلة الأساسية' : 'الاحتياط';
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
  function hero(d, secs) {
    const get = k => secs.find(s => s.key === k), ms = get('matches'), sq = get('squad'), sc = get('scorers'), st = [];
    if (sq) st.push([sq.players.length, 'لاعبًا']);
    if (ms) { const pl = ms.matches.filter(m => m.played); st.push([pl.length, 'مباراة لُعبت'], [pl.filter(m => num(m.us) > num(m.them)).length, 'فوز']); }
    if (sc && sc.rows[0]) st.push([num(sc.rows[0].goals), 'أهداف الهداف']);
    $('#stats').innerHTML = st.map(([n, l]) => `<div class="stat"><b>${num(n)}</b><span>${esc(l)}</span></div>`).join('');
    const next = ms && ms.matches.filter(m => !m.played).sort((a, b) => String(a.date).localeCompare(String(b.date)))[0], h = $('#heroNext');
    if (next) { const [A, B] = sides(next); h.innerHTML = `<div class="lbl"><span>المباراة القادمة</span><span class="pill">قريبًا</span></div><div class="vs"><span class="tm">${A}</span><span class="mid">×</span><span class="tm">${B}</span></div><div class="meta"><span>${longDate(next.date)}</span><span>${where(next)}</span></div>`; h.hidden = false; }
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
  // تحميل أولي: لقطة محلية نشرتها لوحة التحكم في هذا المتصفح إن وُجدت، وإلا النسخة الافتراضية
  let local = null; try { local = localStorage.getItem(KEY); } catch (e) {}
  if (!(local && draw(local))) {
    fetch('data/public.json', { cache: 'no-cache' }).then(r => r.json()).then(j => { if (!draw(j)) throw 0; }).catch(() => { $('#sv').innerHTML = '<p class="empty">تعذّر تحميل المحتوى. حدّث الصفحة أو حاول لاحقًا.</p>'; });
  }
  try { new BroadcastChannel(CH).onmessage = e => draw(e.data); } catch (e) {}
  window.addEventListener('storage', e => { if (e.key === KEY && e.newValue) draw(e.newValue); });
})();
