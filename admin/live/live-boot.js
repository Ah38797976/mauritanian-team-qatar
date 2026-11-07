// تشغيل الاتصال وتسجيل الدخول والخروج. المفتاح العام فقط من config.public.js؛ لا أسرار هنا.
(function () {
  'use strict';
  const $ = id => document.getElementById(id), TD = window.TeamData;
  const msg = (t, info) => { const m = $('loginMsg'); m.textContent = t || ''; m.hidden = !t; m.classList.toggle('info', !!info); };
  const busy = on => { const b = $('loginBtn'); b.disabled = on; b.textContent = on ? 'جارٍ الدخول…' : 'دخول'; b.setAttribute('aria-busy', on ? 'true' : 'false'); };
  const TIMEOUT = 20000;
  const withTimeout = p => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), TIMEOUT))]);
  const cfg = window.APP_CONFIG || {};
  if (!window.supabase) { msg('مكتبة الاتصال غير محمّلة.'); return; }
  try { TD.init(cfg); } catch (e) { msg('إعدادات الاتصال مرفوضة: ' + (e && e.message ? e.message : 'غير صالحة')); return; }
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('email').value.trim(), password = $('password').value; $('password').value = '';
    busy(true); msg('جارٍ تسجيل الدخول…', true);
    try {
      const err = await withTimeout(TD.signIn(email, password)); if (err) { msg(err); return; }
      await withTimeout(TD.refresh());
      if (!TD.cache().me) { await TD.signOut(); msg('لا توجد عضوية فعّالة لهذا الحساب أو تعذّر تحميل البيانات. أُغلقت الجلسة.'); return; }
      msg('');
    } catch (_) { msg('تعذّر الاتصال. حاول لاحقًا.'); } finally { busy(false); }
  });
  const pw = $('password'), tg = $('pwToggle');
  tg.addEventListener('click', () => { const show = pw.type === 'password'; pw.type = show ? 'text' : 'password'; tg.textContent = show ? 'إخفاء' : 'إظهار'; tg.setAttribute('aria-pressed', show ? 'true' : 'false'); tg.setAttribute('aria-label', show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'); pw.focus(); });
  const caps = e => { $('capsHint').hidden = !(e.getModifierState && e.getModifierState('CapsLock')); };
  pw.addEventListener('keydown', caps); pw.addEventListener('keyup', caps); pw.addEventListener('blur', () => { $('capsHint').hidden = true; });
  $('signOutBtn').addEventListener('click', () => { TD.signOut(); });
  // تحديث الصفحة لا يُخرج المستخدم: إن وُجدت جلسة محفوظة نعيد تحميل بياناته بإعادة محاولة عند الأخطاء العابرة، ولا يُغلق الحساب إلا بزر «خروج».
  const sleep = ms => new Promise(r => setTimeout(r, ms)), body = document.body, rm = $('restoreMsg'), rb = $('restoreBtns');
  async function restore() {
    let has = false; try { has = await TD.hasSession(); } catch (_) {}
    if (!has) return;                                  // لا جلسة: تبقى شاشة الدخول
    body.classList.add('restoring'); rb.hidden = true; rm.textContent = 'جارٍ استعادة جلستك…';
    let r = 'err';
    for (const wait of [0, 1500, 3000, 6000]) {
      if (wait) await sleep(wait);
      try { r = await withTimeout(TD.refresh()); } catch (_) { r = 'err'; }
      if (r === 'ok' || r === 'none') break;
    }
    if (r === 'ok') { body.classList.remove('restoring'); return; }
    if (r === 'none') { await TD.signOut(); body.classList.remove('restoring'); msg('لا توجد عضوية فعّالة لهذا الحساب. أُغلقت الجلسة.'); return; }
    rm.textContent = 'تعذّر الاتصال بالخادم. جلستك محفوظة؛ أعد المحاولة.'; rb.hidden = false;   // لا نُخرج المستخدم عند انقطاع الشبكة
  }
  $('restoreRetry').addEventListener('click', () => { restore(); });
  $('restoreOut').addEventListener('click', async () => { await TD.signOut(); body.classList.remove('restoring'); });
  restore();
})();
