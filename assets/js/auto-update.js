/* تحديث تلقائي: يقارن بصمة (ETag) الملفات الأساسية عند العودة للتطبيق وكل 5 دقائق.
   mode=reload: يعيد تحميل الصفحة تلقائيًا (الموقع العام). mode=banner: يعرض شريط «تحديث الآن» حتى لا يضيع عمل غير محفوظ (اللوحة). */
(function () {
  'use strict';
  var s = document.currentScript; if (!s || !window.fetch) return;
  var files = (s.getAttribute('data-files') || '').split(',').filter(Boolean), mode = s.getAttribute('data-mode') || 'banner';
  if (!files.length) return;
  var base = null, busy = false, shown = false;
  function sig() {
    return Promise.all(files.map(function (f) {
      return fetch(f, { method: 'HEAD', cache: 'no-store', credentials: 'omit' }).then(function (r) { return r.ok ? (r.headers.get('etag') || r.headers.get('last-modified') || '') : ''; });
    })).then(function (a) { return a.join('|'); });
  }
  function banner() {
    if (shown) return; shown = true;
    var d = document.createElement('div'); d.className = 'upd-bar'; d.setAttribute('role', 'status');
    var t = document.createElement('span'); t.textContent = 'يتوفر تحديث جديد';
    var b = document.createElement('button'); b.type = 'button'; b.textContent = 'تحديث الآن'; b.addEventListener('click', function () { location.reload(); });
    d.appendChild(t); d.appendChild(b); document.body.appendChild(d);
  }
  function check() {
    if (busy || shown || document.visibilityState === 'hidden') return; busy = true;
    sig().then(function (v) {
      busy = false; if (!v || /^\|*$/.test(v)) return;
      if (base === null) { base = v; return; }
      if (v !== base) { if (mode === 'reload') location.reload(); else banner(); }
    }, function () { busy = false; });
  }
  check();
  document.addEventListener('visibilitychange', check);
  window.addEventListener('pageshow', check);
  setInterval(check, 300000);
})();
