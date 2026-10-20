// الموقع العام: يعرض اللقطة فقط ولا يحتوي أي محتوى ثابت. كل قسم يظهر لأن لوحة التحكم فعّلته، ويتحدّث فور تغيّر اللقطة.
(function () {
  const KEY = 'mt.public.snapshot.v1', CH = 'mt-public-site', $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
  const num = v => Number.isFinite(+v) ? +v : 0;
  const color = c => /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#0b6b3a';
  const tbl = (h, rows) => `<div class="tw"><table><tr>${h.map(x => `<th>${esc(x)}</th>`).join('')}</tr>${rows.join('')}</table></div>`;
  // مفاتيح هذا السجل هي نفسها مفاتيح Store.SITE؛ يتحقق منها tools/test_site_sync.js
  const R = {
    about: s => `<p>${esc(s.text)}</p>`,
    squad: s => tbl(['الرقم', 'الاسم', 'المركز'], s.players.map(p => `<tr><td>${num(p.num)}</td><td>${esc(p.name)}</td><td>${esc(p.pos)}</td></tr>`)),
    staff: s => tbl(['الاسم', 'الدور'], s.staff.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(x.role)}</td></tr>`)),
    matches: s => tbl(['التاريخ', 'المباراة', 'النتيجة'], s.matches.map(m => `<tr><td><bdi>${esc(m.date)}</bdi></td><td>${esc(m.home ? 'نحن × ' + m.opp : m.opp + ' × نحن')}</td><td>${m.played ? `<b>${num(m.us)} - ${num(m.them)}</b>` : 'قادمة'}</td></tr>`)),
    scorers: s => s.rows.length ? tbl(['اللاعب', 'الأهداف', 'المشاركات'], s.rows.map(r => `<tr><td>${esc(r.name)}</td><td>${num(r.goals)}</td><td>${num(r.apps)}</td></tr>`)) : '<p>لا أهداف بعد.</p>'
  };
  function draw(raw) {
    let snap; try { snap = JSON.parse(raw); } catch (e) { return; }
    if (!snap || snap.v !== 1 || !snap.data) return;
    const d = snap.data;
    document.documentElement.style.setProperty('--p', color(d.team && d.team.color));
    $('#tname').textContent = d.team.name; $('#tcity').textContent = d.team.city; document.title = d.team.name;
    const a = $('#ann'); a.textContent = d.announcement || ''; a.hidden = !d.announcement;
    const secs = d.sections.filter(s => Object.prototype.hasOwnProperty.call(R, s.key));
    $('#snav').innerHTML = secs.map(s => `<a href="#s-${esc(s.key)}">${esc(s.label)}</a>`).join('');
    $('#sv').innerHTML = secs.length ? secs.map(s => `<section id="s-${esc(s.key)}"><h2>${esc(s.label)}</h2>${R[s.key](s)}</section>`).join('') : '<p>لا توجد أقسام ظاهرة حاليًا.</p>';
    $('#stamp').textContent = 'آخر تحديث: ' + new Date(snap.t).toLocaleTimeString('ar');
  }
  let first = null; try { first = localStorage.getItem(KEY); } catch (e) {}
  if (first) draw(first); else $('#sv').innerHTML = '<p>لا يوجد محتوى بعد. افتح لوحة التحكم (index.html) في هذا المتصفح عبر خادم محلي ثم حدّث هذه الصفحة.</p>';
  try { new BroadcastChannel(CH).onmessage = e => draw(e.data); } catch (e) {}
  window.addEventListener('storage', e => { if (e.key === KEY && e.newValue) draw(e.newValue); });
})();
