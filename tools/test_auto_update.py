# اختبار التحديث التلقائي: تغيّر ملف → الموقع العام يعيد التحميل، واللوحة تعرض شريط «تحديث الآن»؛ بلا تغيير → لا شيء.
import os, pathlib, sys, time
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent; B = 'http://127.0.0.1:8793'; res = []
def ck(n, c, i=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else ' | ' + str(i)))
def bump(rel):
    p = ROOT / rel; t = os.stat(p).st_mtime; os.utime(p, (t + 5, t + 5)); return p, t
def fire(pg): pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(**p.devices['iPhone 13'])
    # اللوحة
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(B + '/admin/live/index.html'); pg.wait_for_timeout(1200)
    fire(pg); pg.wait_for_timeout(800)
    ck('اللوحة: لا شريط عند عدم وجود تحديث', pg.locator('.upd-bar').count() == 0)
    f, t = bump('admin/live/live-app.js')
    try:
        fire(pg); pg.wait_for_timeout(1200)
        ck('اللوحة: يظهر شريط «تحديث الآن» بعد تغيّر ملف', pg.locator('.upd-bar').count() == 1 and 'تحديث' in pg.inner_text('.upd-bar button'))
        ck('اللوحة: لا يعيد التحميل تلقائيًا (لحماية العمل غير المحفوظ)', pg.evaluate('performance.getEntriesByType("navigation").length') == 1)
    finally: os.utime(f, (t, t))
    ck('اللوحة: لا أخطاء JS', not errs, errs)
    # الموقع العام
    pg2 = ctx.new_page(); pg2.goto(B + '/index.html'); pg2.wait_for_timeout(1500)
    pg2.evaluate('window.__marker = 1'); fire(pg2); pg2.wait_for_timeout(600)
    ck('العام: لا إعادة تحميل بلا تغيير', pg2.evaluate('window.__marker') == 1)
    f, t = bump('site/js/site.js')
    try:
        fire(pg2); pg2.wait_for_timeout(2500)
        ck('العام: يعيد التحميل تلقائيًا بعد تغيّر ملف', pg2.evaluate('window.__marker') is None)
    finally: os.utime(f, (t, t))
    br.close()
print(sum(res), '/', len(res)); sys.exit(0 if all(res) else 1)
