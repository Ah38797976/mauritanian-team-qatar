# تسجيل الحضور السريع: عدّاد، حضّر الجميع/إلغاء الكل، فلتر الغائبين، وعرض فقط بلا صلاحية.
import json, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent; B = 'http://127.0.0.1:8793'; res = []
MOCK = (ROOT / 'tools/fixtures/mock_supabase_lineup.js').read_text(encoding='utf-8')
def ck(n, c, i=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else ' | ' + str(i)))
with sync_playwright() as p:
    br = p.chromium.launch()
    def adm(init):
        c = br.new_context(**p.devices['iPhone 13']); c.route('**/vendor/supabase.min.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=MOCK))
        c.add_init_script('window.__mockInit = ' + json.dumps(dict({'role': 'founder', 'perms': ['viewPlayers', 'players', 'settings', 'attendance', 'lineup', 'matches']}, **init)) + ';')
        g = c.new_page(); e = []; g.on('pageerror', lambda x: e.append(str(x))); g.on('dialog', lambda d: d.accept())
        g.goto(B + '/admin/live/index.html#/coach'); g.wait_for_selector('#attc', timeout=20000); g.wait_for_timeout(800); return g, e
    g, e = adm({})
    n = g.locator('#att input[data-at]').count()
    ck('العدّاد يبدأ بصفر', g.inner_text('#attc').startswith('حاضر 0 من') and n > 0, g.inner_text('#attc'))
    g.click('#att label >> nth=0'); g.wait_for_timeout(700)
    ck('تسجيل لاعب واحد يحدّث العدّاد', g.inner_text('#attc').startswith('حاضر 1 من'), g.inner_text('#attc'))
    g.click('#attall'); g.wait_for_timeout(900)
    ck('حضّر الجميع', g.inner_text('#attc') == 'حاضر %d من %d' % (n, n) and g.locator('#att input:checked').count() == n, g.inner_text('#attc'))
    calls = g.evaluate("window.__mock.calls.filter(c => c.name === 'rpc_set_attendance').length")
    ck('الجماعي لا يرسل إلا للمختلفين (1 + n-1)', calls == n, calls)
    g.click('#attnone'); g.wait_for_timeout(900)
    ck('إلغاء الكل', g.inner_text('#attc').startswith('حاضر 0 من') and g.locator('#att input:checked').count() == 0, g.inner_text('#attc'))
    g.click('#att label >> nth=1'); g.wait_for_timeout(700); g.click('#attf'); g.wait_for_timeout(300)
    ck('فلتر الغائبين يخفي الحاضر', g.locator('#att input[data-at]').count() == n - 1, g.locator('#att input[data-at]').count())
    g.click('#attf'); g.wait_for_timeout(300)
    ck('إلغاء الفلتر يعيد الكل', g.locator('#att input[data-at]').count() == n)
    ck('لا أخطاء JS', not e, e)
    g2, e2 = adm({'role': 'coach', 'perms': ['viewPlayers']})
    ck('بلا صلاحية الحضور: لا أزرار جماعية والمربعات معطّلة', g2.locator('#attall').count() == 0 and g2.locator('#att input:not([disabled])').count() == 0, [g2.locator('#attall').count(), g2.locator('#att input:not([disabled])').count(), g2.evaluate('window.__mock.perms')])
    br.close()
print(sum(res), '/', len(res)); raise SystemExit(0 if all(res) else 1)
