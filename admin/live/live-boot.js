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
  TD.refresh().catch(() => {});   // جلسة محفوظة إن وُجدت؛ بدونها تبقى شاشة الدخول
})();
