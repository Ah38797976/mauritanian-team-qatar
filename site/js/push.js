// اشتراك الزائر في إشعارات الفريق (Web Push). اختياري تمامًا: لا يطلب إذنًا إلا بعد ضغط الزر، ولا يؤثر على باقي الموقع عند أي خطأ.
(() => {
  'use strict';
  const box = document.getElementById('pushbox'); if (!box) return;
  const CFG = window.PUBLIC_CONFIG || {}, KEY = CFG.VAPID_PUBLIC_KEY;
  const ua = navigator.userAgent || '', ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const b64 = s => { const p = '='.repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)); };
  const ab = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const rpc = (fn, body) => fetch(CFG.SUPABASE_URL + '/rest/v1/rpc/' + fn, { method: 'POST', cache: 'no-store', headers: { apikey: CFG.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => { if (!r.ok) throw 0; return r.json(); });
  let busy = false;
  const BELL = 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0';
  const svg = d => { const n = 'http://www.w3.org/2000/svg', s = document.createElementNS(n, 'svg'), p = document.createElementNS(n, 'path'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); p.setAttribute('d', d); s.appendChild(p); return s; };
  // state: off (يمكن التفعيل) | on (مفعّل) | warn (محظور/آيفون غير مثبّت)
  const draw = (msg, btn, on, state) => {
    box.hidden = false; box.textContent = ''; box.className = 'pushbox pb-' + (state || 'off');
    const ic = document.createElement('span'); ic.className = 'pb-ic'; ic.appendChild(svg(state === 'on' ? 'M20 6 9 17l-5-5' : BELL)); box.appendChild(ic);
    const body = document.createElement('div'); body.className = 'pb-body';
    const h = document.createElement('b'); h.className = 'pb-h'; h.textContent = state === 'on' ? 'التنبيهات مفعّلة' : 'تنبيهات الفريق'; body.appendChild(h);
    const p = document.createElement('span'); p.className = 'pb-t'; p.textContent = msg; body.appendChild(p);
    box.appendChild(body);
    if (btn) { const b = document.createElement('button'); b.type = 'button'; b.className = 'pb-b'; b.textContent = btn; b.disabled = busy; b.onclick = on; box.appendChild(b); }
  };
  const getSub = () => navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready).then(reg => reg.pushManager.getSubscription().then(s => ({ reg, s })));
  async function refresh() {
    if (!KEY || !CFG.SUPABASE_URL) { box.hidden = true; return; }
    if (ios && !standalone) { draw('لتصلك تنبيهات الفريق على الآيفون: أضف الموقع إلى الشاشة الرئيسية (زر المشاركة ← إضافة إلى الشاشة الرئيسية) ثم افتحه من هناك.', null, null, 'warn'); return; }
    if (!supported) { box.hidden = true; return; }
    if (Notification.permission === 'denied') { draw('التنبيهات محظورة لهذا الموقع. فعّلها من إعدادات المتصفح إن أردت.', null, null, 'warn'); return; }
    let st; try { st = await getSub(); } catch (_) { box.hidden = true; return; }
    if (st.s && Notification.permission === 'granted') draw('تنبيهات الفريق مفعّلة على هذا الجهاز.', 'إيقاف التنبيهات', off, 'on');
    else draw('فعّل التنبيهات لتصلك أخبار الفريق والمباريات.', 'تفعيل التنبيهات', on);
  }
  async function on() {
    if (busy) return; busy = true; refresh();
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw 0;
      const { reg, s } = await getSub();
      const sub = s || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(KEY) });
      const j = sub.toJSON(), k = j.keys || {};
      const r = await rpc('rpc_push_subscribe', { p: { endpoint: j.endpoint, p256dh: k.p256dh || ab(sub.getKey('p256dh')), auth: k.auth || ab(sub.getKey('auth')) } }).catch(() => 'x');
      if (r !== '') { await sub.unsubscribe().catch(() => {}); throw 0; }   // لم يُسجَّل في الخادم: لا نُبقي اشتراكًا محليًا يوهم المستخدم بأنه مفعّل
    } catch (_) { busy = false; await refresh(); const t = box.querySelector('.pb-t'); if (t && Notification.permission !== 'denied') t.textContent = 'تعذّر تفعيل التنبيهات. حاول مرة أخرى لاحقًا.'; return; }
    busy = false; refresh();
  }
  async function off() {
    if (busy) return; busy = true; refresh();
    try { const { s } = await getSub(); if (s) { const ep = s.endpoint; await s.unsubscribe(); await rpc('rpc_push_unsubscribe', { p_endpoint: ep }).catch(() => {}); } } catch (_) {}
    busy = false; refresh();
  }
  refresh();
})();
