# اختبار: تحديث الصفحة لا يُخرج المستخدم؛ الخروج فقط بزر «خروج». Playwright محلي + عميل Supabase وهمي (لا شبكة).
import json, pathlib, sys
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent; B = 'http://127.0.0.1:8793'
MOCK = (ROOT / 'tools/fixtures/mock_supabase_lineup.js').read_text(encoding='utf-8')
res = []
def ck(n, c, i=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else ' | ' + str(i)))
def mk(br, p, init):
    ctx = br.new_context(**p.devices['iPhone 13']); ctx.route('**/vendor/supabase.min.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=MOCK))
    ctx.add_init_script('window.__mockInit = ' + json.dumps(init) + ';'); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); return ctx, pg, errs
vis = lambda pg, sel: pg.locator(sel).is_visible()
def wait(pg, sel, ms=15000):
    for _ in range(ms // 100):
        if vis(pg, sel): return True
        pg.wait_for_timeout(100)
    return False
with sync_playwright() as p:
    br = p.chromium.launch()
    # 1) جلسة محفوظة والخادم سليم
    ctx, pg, e = mk(br, p, {}); pg.goto(B + '/admin/live/index.html#/coach')
    ck('1 جلسة محفوظة: تظهر اللوحة', wait(pg, '#shell'))
    ck('1 شاشة الدخول لم تظهر', not vis(pg, '#loginView') and not vis(pg, '#restoreView'))
    pg.reload(); ok = wait(pg, '#shell'); ck('1 بعد التحديث تبقى اللوحة', ok and not vis(pg, '#loginView'))
    # 2) فشل عابر مرتين ثم نجاح
    ctx, pg, e = mk(br, p, {'meFail': 2}); pg.goto(B + '/admin/live/index.html#/coach'); pg.wait_for_timeout(600)
    ck('2 أثناء الفشل: شاشة «استعادة الجلسة» لا شاشة الدخول', vis(pg, '#restoreView') and not vis(pg, '#loginView'))
    ck('2 تنتهي باللوحة بعد إعادة المحاولة (بلا خروج)', wait(pg, '#shell') and not vis(pg, '#loginView') and not pg.evaluate('!!window.__signedOut'))
    # 3) فشل دائم: تُحفظ الجلسة ويظهر زر إعادة المحاولة
    ctx, pg, e = mk(br, p, {'meFail': 'always'}); pg.goto(B + '/admin/live/index.html#/coach')
    ck('3 فشل دائم: يظهر زر إعادة المحاولة', wait(pg, '#restoreRetry', 25000))
    ck('3 لا شاشة دخول ولا خروج تلقائي', not vis(pg, '#loginView') and not pg.evaluate('!!window.__signedOut'))
    pg.evaluate('window.__mock.meFail = 0'); pg.click('#restoreRetry'); ck('3 إعادة المحاولة تنجح عند عودة الخادم', wait(pg, '#shell'))
    # 4) لا جلسة
    ctx, pg, e = mk(br, p, {'noSession': True}); pg.goto(B + '/admin/live/index.html'); pg.wait_for_timeout(600)
    ck('4 بلا جلسة: شاشة الدخول', vis(pg, '#loginView') and not vis(pg, '#restoreView'))
    # 5) حساب بلا عضوية: يُغلق
    ctx, pg, e = mk(br, p, {'noMember': True}); pg.goto(B + '/admin/live/index.html'); pg.wait_for_timeout(1500)
    ck('5 بلا عضوية: شاشة الدخول مع رسالة وإغلاق الجلسة', vis(pg, '#loginView') and pg.evaluate('!!window.__signedOut') and 'عضوية' in pg.inner_text('#loginMsg'))
    # 6) الخروج الصريح
    ctx, pg, e = mk(br, p, {}); pg.goto(B + '/admin/live/index.html#/coach'); wait(pg, '#shell'); pg.click('#signOutBtn'); pg.wait_for_timeout(500)
    ck('6 زر «خروج» يُظهر شاشة الدخول', vis(pg, '#loginView') and not vis(pg, '#shell'))
    # 7) فشل عابر أثناء العمل لا يمسح الحالة
    ctx, pg, e = mk(br, p, {}); pg.goto(B + '/admin/live/index.html#/coach'); wait(pg, '#shell')
    pg.evaluate("window.__mock.meFail='always'"); pg.evaluate('window.TeamData.refresh()'); pg.wait_for_timeout(500)
    ck('7 فشل التحديث وأنت داخل اللوحة لا يُخرجك', vis(pg, '#shell') and not vis(pg, '#loginView'))
    ck('لا أخطاء JS', not e, e)
    br.close()
print(sum(res), '/', len(res)); sys.exit(0 if all(res) else 1)
