// مركز المدرب (المرحلة 1 / 0014): ملعب تكتيكي تفاعلي — الخطط الأربع، سحب وإفلات بين الخانات (Pointer Events) مع بديل اللمس «اختر ثم اضغط الخانة»،
// القائد وحارس المرمى. لا يوجد وضع حر: اللاعب يوضع في خانات الخطة فقط.
// قواعد هذه الوحدة:
//   • الخادم هو الحاسم. التحقق هنا (مطابقة المركز، النشاط) لتوفير رسالة فورية فقط؛ نفس القواعد يفرضها rpc_set_lineup / rpc_set_captain / rpc_set_goalkeeper.
//   • لا نعرض «تم الحفظ» إلا بعد أن يعيد الخادم نصًا فارغًا. أثناء الحفظ تُقفل الواجهة وتظهر «جارٍ الحفظ…»، وعند الرفض تُعاد اللوحة إلى آخر حالة أكدها الخادم
//     (لا نغيّر شيئًا محليًا قبل التأكيد، فلا شيء نتراجع عنه) ونعرض رسالة الخادم كما هي.
//   • لا تُرسل أي كتابة لمن لا يملك صلاحية lineup (Store.setLineup… ترفض محليًا أيضًا) ولا تتوفر عناصر التعديل أصلًا.
//   • كل نص قادم من بيانات المستخدم يمر عبر esc() قبل دخوله HTML.
(function () {
  'use strict';
  let D = null;                        // الاعتماديات من live-app.js: { St, S, esc, num, avatar, toast, render, TD }
  let sel = '', busy = false, drag = null, justDragged = false, note = '';

  // مرآة formation_slots في 0014 (الخانة 1 دائمًا الحارس). يتحقق اختبار tools/test_lineup_contract.js من تطابقها مع ملف SQL.
  const FORMS = {
    '4-4-2':   ['gk', 'def', 'def', 'def', 'def', 'mid', 'mid', 'mid', 'mid', 'fwd', 'fwd'],
    '4-3-3':   ['gk', 'def', 'def', 'def', 'def', 'mid', 'mid', 'mid', 'fwd', 'fwd', 'fwd'],
    '3-5-2':   ['gk', 'def', 'def', 'def', 'mid', 'mid', 'mid', 'mid', 'mid', 'fwd', 'fwd'],
    '4-2-3-1': ['gk', 'def', 'def', 'def', 'def', 'mid', 'mid', 'mid', 'mid', 'mid', 'fwd']
  };
  // إحداثيات الخانات (x من اليسار %، y من الأعلى %) بترتيب الخانات 1..11. الهجوم في الأعلى والحارس في الأسفل.
  const XY = {
    '4-4-2':   [[50, 90], [12, 72], [37, 72], [63, 72], [88, 72], [12, 48], [37, 48], [63, 48], [88, 48], [33, 22], [67, 22]],
    '4-3-3':   [[50, 90], [12, 72], [37, 72], [63, 72], [88, 72], [22, 48], [50, 48], [78, 48], [18, 20], [50, 18], [82, 20]],
    '3-5-2':   [[50, 90], [22, 72], [50, 72], [78, 72], [10, 47], [30, 47], [50, 47], [70, 47], [90, 47], [35, 21], [65, 21]],
    '4-2-3-1': [[50, 91], [12, 74], [37, 74], [63, 74], [88, 74], [35, 57], [65, 57], [18, 38], [50, 38], [82, 38], [50, 17]]
  };
  const ORDER = ['4-4-2', '4-3-3', '3-5-2', '4-2-3-1'];
  const CLS = { 'حارس': 'gk', 'مدافع': 'def', 'وسط': 'mid', 'مهاجم': 'fwd' };
  const LAB = { gk: 'حارس', def: 'دفاع', mid: 'وسط', fwd: 'هجوم' };
  const MARKS = ['pk-h', 'pk-c', 'pk-cs', 'pk-pa t', 'pk-pa b', 'pk-ga t', 'pk-ga b', 'pk-ar t', 'pk-ar b', 'pk-sp t', 'pk-sp b'].map(c => `<i class="pk ${c}" aria-hidden="true"></i>`).join('');
  const ACTIVE = 'نشط';
  // مرآة app.slot_ok: الحارس صارم في الاتجاهين؛ غيره: نفس الخط أو خط وسط مجاور (دفاع↔وسط، وسط↔هجوم) ولا دفاع↔هجوم.
  const slotOk = (slotCls, posCls) => (slotCls === 'gk' || posCls === 'gk') ? slotCls === posCls : (slotCls === posCls || slotCls === 'mid' || posCls === 'mid');

  const init = deps => { D = deps; };
  const model = () => {
    const { St, S } = D, L = S.lineup, form = FORMS[L.formation] ? L.formation : '4-4-2';
    const byId = new Map(), slotOf = {};
    S.players.forEach(p => byId.set(p.id, p));
    St.roster().forEach(p => { if (!byId.has(p.id)) byId.set(p.id, p); });
    const at = {};                                        // slot -> player
    Object.entries(L.slots).forEach(([pid, s]) => { const p = byId.get(pid) || St.player(pid); if (p && s >= 1 && s <= 11) { at[s] = p; slotOf[pid] = +s; } });
    const starters = L.starters.map(id => byId.get(id) || St.player(id)).filter(Boolean);
    const unplaced = starters.filter(p => !(p.id in slotOf));
    const bench = St.roster().filter(p => !L.starters.includes(p.id)).concat(unplaced);
    return { L, form, at, slotOf, starters, bench, byId, unplaced };
  };

  // ---- تحقق وحساب الحركة (للتجربة الفورية فقط؛ الخادم يعيد التحقق) ----
  function plan(m, pid, target) {
    const p = m.byId.get(pid); if (!p) return { err: 'اللاعب غير موجود' };
    if (p.status !== ACTIVE) return { err: 'لا يمكن إضافة لاعب غير نشط إلى التشكيلة' };
    const F = FORMS[m.form], pc = CLS[p.pos], from = m.slotOf[pid], occ = m.at[target];
    if (from === target) return { noop: true };
    if (!slotOk(F[target - 1], pc)) return { err: `مركز ${p.name} لا يناسب هذه الخانة` };
    const next = { ...m.slotOf };
    if (occ && occ.id !== pid) {
      if (from) {                                                    // تبديل بين خانتين
        if (!slotOk(F[from - 1], CLS[occ.pos])) return { err: `مركز ${occ.name} لا يناسب خانة ${p.name}` };
        next[occ.id] = from;
      } else delete next[occ.id];                                    // لاعب الاحتياط يدخل ومن كان في الخانة يخرج إلى الاحتياط
    }
    next[pid] = target;
    return { slots: next };
  }
  const payload = (m, slots) => ({ formation: m.form, slots: Object.entries(slots).map(([player, slot]) => ({ slot: +slot, player })) });   // captain/goalkeeper: مفتاحان غائبان = إبقاء القائد وتحديد الحارس من الخانة 1

  // ---- الحفظ: قفل أثناء الانتظار، ولا نجاح قبل تأكيد الخادم ----
  async function commit(call, okMsg) {
    if (busy) return;
    busy = true; paint();
    let er; try { er = await call(); } catch (_) { er = 'تعذّر الاتصال بالخادم، حاول لاحقًا'; }
    busy = false; sel = '';
    if (er) D.toast(er); else D.toast(okMsg || 'تم الحفظ');
    D.render();                                                       // يعيد الرسم من ذاكرة الخادم: بعد الرفض لا يبقى أي تغيير محلي
  }
  const paint = () => { const r = document.querySelector('[data-coach]'); if (r) { r.classList.add('busy'); const s = r.querySelector('.cstat'); if (s) s.textContent = 'جارٍ الحفظ…'; } };
  function doMove(pid, target) {
    const m = model(), r = plan(m, pid, target);
    if (r.noop) { sel = ''; return D.render(); }
    if (r.err) { D.toast(r.err); return; }
    commit(() => D.St.setLineup(payload(m, r.slots)), 'تم حفظ التشكيلة');
  }
  function doBench(pid) {
    const m = model(); if (!(pid in m.slotOf)) { sel = ''; return D.render(); }
    const next = { ...m.slotOf }; delete next[pid];
    commit(() => D.St.setLineup(payload(m, next)), 'نُقل إلى الاحتياط');
  }
  function doForm(f) {
    const m = model(); if (!FORMS[f] || f === m.form) return;
    const before = new Set(m.starters.map(p => p.id)), names = id => (m.byId.get(id) || {}).name || '';
    commit(async () => {
      const er = await D.St.setFormation(f); if (er) return er;
      const after = new Set(D.S.lineup.starters), gone = [...before].filter(id => !after.has(id)).map(names).filter(Boolean);
      note = gone.length ? 'نُقل إلى الاحتياط لعدم وجود خانة مناسبة في الخطة الجديدة: ' + gone.join('، ') : '';
      return '';
    }, 'تم تغيير الخطة');
  }

  // ---- الرسم ----
  const tk = (m, p, where, ed) => {
    const { esc, num, avatar } = D, cap = m.L.captain === p.id, gk = m.L.gk === p.id, off = p.status !== ACTIVE;
    return `<button type="button" class="tk${off ? ' off' : ''}${sel === p.id ? ' sel' : ''}" data-pid="${esc(p.id)}" data-where="${where}" ${ed ? '' : 'data-ro="1"'} aria-pressed="${sel === p.id}" aria-label="${esc(p.name)}، رقم ${num(p.num)}، ${esc(p.pos)}${cap ? '، القائد' : ''}${gk ? '، الحارس الأساسي' : ''}${off ? '، غير نشط' : ''}">${avatar(p)}<b class="no">${num(p.num)}</b>${cap ? '<i class="cb" aria-hidden="true">C</i>' : ''}<span class="nm">${esc(p.name)}</span></button>`;
  };
  function html(ed) {
    const { esc, num, St } = D, m = model(), L = m.L;
    if (L.v2 === false) return null;                                  // 0014 غير مُطبَّق: تعرض الصفحة الملعب القديم
    if (L.v2 !== true) return `<div class="card" data-coach><h2>التشكيلة</h2><div class="note bad">تعذّر تحميل التشكيلة من الخادم، ولا يمكن تعديلها الآن. حاول مرة أخرى.</div><button type="button" id="coachretry">إعادة المحاولة</button></div>`;
    const canEdit = !!ed && !L.err, F = FORMS[m.form], xy = XY[m.form], selP = sel ? m.byId.get(sel) : null;
    const slots = F.map((cls, i) => {
      const n = i + 1, p = m.at[n], valid = selP && selP.status === ACTIVE && slotOk(cls, CLS[selP.pos]) && !(m.slotOf[selP.id] === n);
      return `<div class="sl${valid ? ' tgt' : ''}" data-slot="${n}" data-cls="${cls}" style="left:${xy[i][0]}%;top:${xy[i][1]}%">${p ? tk(m, p, 'slot', canEdit) : `<button type="button" class="ph" data-empty="${n}" ${canEdit ? '' : 'disabled'} aria-label="خانة فارغة — ${LAB[cls]}"><span>${LAB[cls]}</span></button>`}</div>`;
    }).join('');
    const capP = L.captain ? m.byId.get(L.captain) : null, gkP = L.gk ? m.byId.get(L.gk) : null;
    const warn = [];
    if (m.starters.length < 11) warn.push(`التشكيلة غير مكتملة (${m.starters.length}/11)`);
    if (m.starters.length && !capP) warn.push('لم يُحدَّد قائد');
    if (m.starters.length && !gkP) warn.push('لا يوجد حارس أساسي');
    if (m.unplaced.length) warn.push('لاعبون بلا خانة (يُعدّون احتياطًا): ' + m.unplaced.map(p => esc(p.name)).join('، '));
    const fmBar = `<div class="fmbar" role="group" aria-label="خطة اللعب">${ORDER.map(f => `<button type="button" class="${f === m.form ? 'on' : ''}" data-fm="${f}" aria-pressed="${f === m.form}" ${canEdit ? '' : 'disabled'}><bdi dir="ltr">${f}</bdi></button>`).join('')}</div>`;
    const selbar = selP ? (() => {
      const inSlot = selP.id in m.slotOf, active = selP.status === ACTIVE, isGk = CLS[selP.pos] === 'gk';
      return `<div class="selbar" role="group" aria-label="إجراءات ${esc(selP.name)}"><b>${esc(selP.name)}</b> <span class="tag">#${num(selP.num)}</span> <span class="tag">${esc(selP.pos)}</span>
        <div class="acts">${canEdit && inSlot && active ? (L.captain === selP.id ? '<button type="button" data-act="uncap">إلغاء القائد</button>' : '<button type="button" data-act="cap">تعيين قائدًا</button>') : ''}${canEdit && isGk && active && L.gk !== selP.id ? '<button type="button" data-act="gk">اجعله حارس المرمى الأساسي</button>' : ''}${canEdit && inSlot ? '<button type="button" class="sec" data-act="bench">إلى الاحتياط</button>' : ''}<a class="btnlink" href="#/player/${esc(selP.id)}">بطاقة اللاعب</a><button type="button" class="sec" data-act="clear">إلغاء التحديد</button></div>
        ${canEdit ? `<p class="hint">${!active ? 'اللاعب غير نشط ولا يمكن إضافته إلى الملعب.' : inSlot ? 'اضغط خانة أخرى لنقله أو لتبديله، أو اسحبه إليها.' : 'اضغط خانة مناسبة على الملعب (المضيئة) أو اسحبه إليها.'}</p>` : ''}</div>`;
    })() : (canEdit ? '<p class="hint">اسحب لاعبًا إلى خانة، أو اضغط عليه ثم اضغط الخانة. اضغط لاعبًا على الملعب لتعيينه قائدًا.</p>' : '<p class="hint">اضغط على لاعب لعرض خياراته وبطاقته.</p>');
    const bench = m.bench.length ? `<h2 class="bh">الاحتياط <span class="tag">${m.bench.length}</span></h2><div class="bench" data-bench>${m.bench.map(p => `<div class="ppw">${tk(m, p, 'bench', canEdit)}</div>`).join('')}</div>` : '<div class="bench empty" data-bench><p class="empty">لا يوجد لاعبون في الاحتياط.</p></div>';
    return `<div class="coachbox" data-coach>${L.err ? '<div class="note bad">تعذّر تحديث التشكيلة من الخادم؛ التعديل متوقف حتى نجاح التحديث.</div>' : ''}
      <div class="chead"><h2>التشكيلة الأساسية — <span id="sc">${m.starters.length}</span>/11</h2><span class="cstat" role="status" aria-live="polite"></span></div>
      ${fmBar}${warn.length ? `<div class="note" id="lnote">${warn.join(' · ')}</div>` : ''}${note ? `<div class="note bad" id="mvnote">${esc(note)}</div>` : ''}
      <div class="chips"><span class="tag">القائد: ${capP ? esc(capP.name) : '—'}</span><span class="tag">الحارس: ${gkP ? esc(gkP.name) : '—'}</span></div>
      <div class="field fx" id="pitch" data-formation="${m.form}">${MARKS}${slots}</div>
      ${selbar}${bench}</div>`;
  }

  // ---- التفاعل (نداء واحد بعد كل رسم للصفحة) ----
  function bind(root, ed) {
    const box = root.querySelector('[data-coach]'); if (!box) return;
    note = '';                                                         // الملاحظة عُرضت في هذا الرسم فقط
    const retry = box.querySelector('#coachretry'); if (retry) retry.onclick = () => D.TD.refresh();
    if (!ed || box.classList.contains('card')) return;
    if (box.querySelector('.note.bad:not(#mvnote)')) return;           // خطأ تحديث: لا تفاعل
    const hit = (x, y) => { const el = document.elementFromPoint(x, y); return el ? el.closest('.sl,[data-bench]') : null; };
    const clearDrag = () => { if (drag && drag.raf) cancelAnimationFrame(drag.raf); if (drag && drag.ghost) drag.ghost.remove(); if (drag && drag.el) drag.el.classList.remove('dragging'); box.classList.remove('dragging'); box.querySelectorAll('.hot,.badh').forEach(n => n.classList.remove('hot', 'badh')); drag = null; };
    const mark = () => {
      if (!drag || !drag.go) return;
      drag.ghost.style.left = drag.px + 'px'; drag.ghost.style.top = drag.py + 'px';
      box.querySelectorAll('.hot,.badh').forEach(n => n.classList.remove('hot', 'badh'));
      const h = hit(drag.px, drag.py); if (h && h.dataset.slot) h.classList.add(h.classList.contains('tgt') ? 'hot' : 'badh'); else if (h) h.classList.add('hot');
    };
    box.addEventListener('pointerdown', e => {
      const t = e.target.closest('.tk'); if (!t || t.dataset.ro || busy || (e.button || 0) > 0) return;
      drag = { pid: t.dataset.pid, el: t, x: e.clientX, y: e.clientY, go: false, id: e.pointerId };
      try { t.setPointerCapture(e.pointerId); } catch (_) {}
    });
    box.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.go) {
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
        drag.go = true; drag.el.classList.add('dragging'); box.classList.add('dragging');
        const g = drag.el.cloneNode(true); g.classList.add('ghost'); g.removeAttribute('data-pid'); g.setAttribute('aria-hidden', 'true'); document.body.appendChild(g); drag.ghost = g;
        const m = model(), p = m.byId.get(drag.pid);
        box.querySelectorAll('.sl').forEach(s => s.classList.toggle('tgt', !!p && p.status === ACTIVE && slotOk(s.dataset.cls, CLS[p.pos]) && m.slotOf[p.id] !== +s.dataset.slot));
      }
      drag.px = e.clientX; drag.py = e.clientY; mark();
      if (!drag.raf) { const d0 = drag, tick = () => { if (drag !== d0) return; const y = d0.py, edge = 72; if (y > innerHeight - edge) scrollBy(0, 14); else if (y < edge) scrollBy(0, -14); mark(); d0.raf = requestAnimationFrame(tick); }; d0.raf = requestAnimationFrame(tick); }   // تمرير تلقائي عند الاقتراب من حافة الشاشة (الاحتياط تحت الملعب)
    });
    box.addEventListener('pointerup', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag, went = d.go, h = went ? hit(e.clientX, e.clientY) : null; clearDrag();
      if (!went) return;                                               // نقرة عادية: يعالجها click
      justDragged = true; setTimeout(() => { justDragged = false; }, 0);
      if (h && h.dataset.slot) doMove(d.pid, +h.dataset.slot); else if (h && h.hasAttribute('data-bench')) doBench(d.pid);
    });
    box.addEventListener('pointercancel', clearDrag);
    box.addEventListener('click', e => {
      if (justDragged || busy) return;
      const f = e.target.closest('[data-fm]'); if (f) return doForm(f.dataset.fm);
      const a = e.target.closest('[data-act]');
      if (a) {
        const m = model(), id = sel;
        if (a.dataset.act === 'clear') { sel = ''; return D.render(); }
        if (!id) return;
        if (a.dataset.act === 'cap') return commit(() => D.St.setCaptain(id), 'تم تعيين القائد');
        if (a.dataset.act === 'uncap') return commit(() => D.St.setCaptain(null), 'أُلغي القائد');
        if (a.dataset.act === 'gk') return commit(() => D.St.setGoalkeeper(id), 'تم تعيين الحارس');
        if (a.dataset.act === 'bench') return doBench(id);
        return m;
      }
      const t = e.target.closest('.tk'), slot = e.target.closest('.sl'), bench = e.target.closest('[data-bench]');
      if (t && !t.dataset.ro) {
        const pid = t.dataset.pid;
        if (sel && sel !== pid && slot) return doMove(sel, +slot.dataset.slot);                      // لاعب محدد + الضغط على لاعب في خانة = نقل/تبديل
        if (sel && sel !== pid && t.dataset.where === 'bench' && sel in model().slotOf) return doBench(sel);
        sel = sel === pid ? '' : pid; return D.render();
      }
      if (slot && sel) { const n = +slot.dataset.slot; return doMove(sel, n); }
      if (bench && sel && sel in model().slotOf) return doBench(sel);
    });
    document.addEventListener('keydown', function esc(e) { if (!document.body.contains(box)) { document.removeEventListener('keydown', esc); return; } if (e.key === 'Escape' && sel && !busy) { sel = ''; D.render(); } });
  }
  const reset = () => { sel = ''; busy = false; drag = null; note = ''; };
  window.CoachUI = Object.freeze({ init, html, bind, reset, FORMS, XY, slotOk, plan: (pid, slot) => plan(model(), pid, slot), _model: model });
})();
