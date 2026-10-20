// الموقع العام: يعرض «لقطة عامة» فقط ولا يحتوي أي محتوى ثابت ولا يحمّل أي كود من لوحة التحكم (لا Store ولا data ولا صلاحيات).
// مصدر اللقطة: (1) إن نشرت لوحة التحكم تعديلًا في هذا المتصفح نفسه (localStorage/BroadcastChannel) فهو الأحدث، (2) وإلا data/public.json (النسخة الافتراضية للزوّار).
// كل نص يمر عبر esc() وكل رقم عبر num() قبل دخوله في HTML.
(function () {
  const KEY = 'mt.public.snapshot.v1', CH = 'mt-public-site', $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
  const num = v => Number.isFinite(+v) ? +v : 0;
  const color = c => /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#0b6b3a';
  const ini = n => esc(String(n ?? '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join(' '));
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
  // مفاتيح هذا السجل هي نفسها مفاتيح Store.SITE في لوحة التحكم؛ يتحقق منها tools/test_site_sync.js
  const R = {
    about: s => `<div class="card about"><p>${esc(s.text)}</p></div>`,
    squad: s => s.players.length ? `<div class="pgrid">${s.players.map(p => `<article class="card pc"><span class="no" aria-hidden="true">#${num(p.num)}</span><div class="av">${ini(p.name)}</div><b>${esc(p.name)}</b><span class="pos ${POSCLS[p.pos] || ''}">${esc(p.pos)}</span></article>`).join('')}</div>` : '<p class="empty">لا لاعبين بعد.</p>',
    staff: s => s.staff.length ? `<div class="sgrid">${s.staff.map(x => `<article class="card st"><div class="ic">${ini(x.name)}</div><div><b>${esc(x.name)}</b><small>${esc(x.role)} · ${esc(x.kind)}</small></div></article>`).join('')}</div>` : '<p class="empty">لا أعضاء بعد.</p>',
    matches: s => {
      const up = s.matches.filter(m => !m.played).sort((a, b) => String(a.date).localeCompare(String(b.date))), pl = s.matches.filter(m => m.played).sort((a, b) => String(b.date).localeCompare(String(a.date)));
      return (up.length ? `<h3 class="sub-h">المباريات القادمة</h3><div class="mgrid">${up.map(matchCard).join('')}</div>` : '') + (pl.length ? `<h3 class="sub-h">النتائج</h3><div class="mgrid">${pl.map(matchCard).join('')}</div>` : '') || '<p class="empty">لا مباريات بعد.</p>';
    },
    scorers: s => { const max = Math.max(1, ...s.rows.map(r => num(r.goals))); return s.rows.length ? `<div class="card lb">${s.rows.map((r, i) => `<div class="lb-r"><span class="rk">${i + 1}</span><div><div class="nm">${esc(r.name)}</div><div class="bar"><i style="width:${Math.round(num(r.goals) / max * 100)}%"></i></div></div><div class="goals">${num(r.goals)}<small>هدف · ${num(r.apps)} مشاركة</small></div></div>`).join('')}</div>` : '<p class="empty">لا أهداف بعد.</p>'; }
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
    const d = snap.data; TEAM = String(d.team.name || 'الفريق');
    document.documentElement.style.setProperty('--p', color(d.team.color));
    document.title = TEAM + ' — الجالية الموريتانية في قطر';
    ['#bname', '#tname', '#fname'].forEach(i => { $(i).textContent = TEAM; });
    $('#tcity').textContent = d.team.city || '';
    const a = $('#ann'); a.textContent = d.announcement || ''; a.hidden = !d.announcement;
    const secs = d.sections.filter(s => Object.prototype.hasOwnProperty.call(R, s.key));
    $('#snav').innerHTML = secs.map(s => `<a href="#s-${esc(s.key)}">${esc(s.label)}</a>`).join('');
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
