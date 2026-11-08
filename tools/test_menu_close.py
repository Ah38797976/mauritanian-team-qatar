# اختبار القائمة الجانبية في اللوحة (جوال): تُغلق عند اختيار صفحة (حتى الصفحة الحالية)، ولا تُغلق من تلقاء نفسها عند تحديث خلفي.
import json, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent; B = 'http://127.0.0.1:8793'
MOCK = (ROOT / 'tools/fixtures/mock_supabase_lineup.js').read_text(encoding='utf-8'); res = []
def ck(n, c, i=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else ' | ' + str(i)))
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(**p.devices['iPhone 13'])
    ctx.route('**/vendor/supabase.min.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=MOCK))
    ctx.add_init_script('window.__mockInit = ' + json.dumps({'role': 'founder', 'perms': ['viewPlayers', 'players', 'settings', 'contactPlayers', 'matches']}) + ';')
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(B + '/admin/live/index.html#/players'); pg.wait_for_selector('#shell:not([hidden])', timeout=20000); pg.wait_for_timeout(1200)
    op = lambda: pg.evaluate("document.body.classList.contains('menu-open')")
    pg.click('#menuBtn'); pg.wait_for_timeout(400); ck('القائمة تُفتح', op())
    pg.evaluate("window.TeamData.refresh()"); pg.wait_for_timeout(800)
    ck('تحديث خلفي لا يغلق القائمة المفتوحة', op())
    pg.click('#nav a[href="#/players"]'); pg.wait_for_timeout(400)
    ck('لمس الصفحة الحالية يغلق القائمة', not op())
    pg.click('#menuBtn'); pg.wait_for_timeout(400); pg.click('#nav a[href="#/matches"]'); pg.wait_for_timeout(500)
    ck('اختيار صفحة أخرى يغلق القائمة وتتغير الصفحة', not op() and pg.inner_text('#crumb').startswith('المباريات'), pg.inner_text('#crumb'))
    pg.click('#menuBtn'); pg.wait_for_timeout(400); pg.click('#scrim', position={'x': 20, 'y': 300}); pg.wait_for_timeout(300)
    ck('اللمس خارج القائمة يغلقها', not op())
    ck('لا أخطاء JS', not errs, errs)
    br.close()
print('%d/%d' % (sum(res), len(res)))
