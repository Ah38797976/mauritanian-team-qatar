# اختبار قسم «التنبيهات» في الموقع العام: يظهر عند وجود تنبيهات، يُفتح بالرابط /#s-notices (وجهة الضغط على الإشعار)، يهرّب النص، زر المسار الداخلي المعروف فقط، ولا يظهر قبل 0029 أو عند الفراغ.
import json, sys
from playwright.sync_api import sync_playwright
B = 'http://127.0.0.1:8793'; res = []
def ck(n, c, i=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else ' | ' + str(i)))
SITE = {'team': {'name': 'فريق', 'city': 'الدوحة', 'color': '#0b6b3a'}, 'about': 'نبذة', 'announcement': '', 'sections': {'matches': True}, 'matches': []}
NTS = [{'title': 'تدريب غدًا', 'body': 'الساعة 7 مساءً في الاكاديمية', 'at': '2026-11-16T15:00:00+00:00', 'url': '/#s-notices'},
       {'title': '<img src=x onerror=alert(1)>', 'body': '<b>x</b>', 'at': '2026-11-15T10:00:00+00:00', 'url': '/#s-matches'},
       {'title': 'رابط غريب', 'body': 'لا زر', 'at': '2026-11-14T10:00:00+00:00', 'url': 'https://evil.example/'}]
def page(br, p, nts, status=200):
    ctx = br.new_context(**p.devices['iPhone 13']); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route('**/rest/v1/rpc/rpc_public_site', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SITE)))
    pg.route('**/rest/v1/rpc/rpc_public_notices', lambda r: r.fulfill(status=status, content_type='application/json', body=json.dumps(nts)))
    for f in ('rpc_public_developer', 'rpc_public_gallery', 'rpc_public_training'): pg.route('**/rest/v1/rpc/' + f, lambda r: r.fulfill(status=200, content_type='application/json', body='null'))
    pg.route('**/rest/v1/rpc/rpc_push_*', lambda r: r.fulfill(status=200, content_type='application/json', body='""'))
    return pg, errs
with sync_playwright() as p:
    br = p.chromium.launch()
    pg, errs = page(br, p, NTS); pg.goto(B + '/index.html#s-notices'); pg.wait_for_timeout(1800)
    ck('قسم التنبيهات يظهر في الأقسام وأول بلاطة', pg.locator('#s-notices').count() == 1 and pg.locator('.tile').first.get_attribute('href') == '#s-notices')
    ck('فتح /#s-notices يعرض القسم (وجهة الإشعار)', pg.locator('#s-notices').is_visible() and pg.locator('#s-notices .nt').count() == 3)
    ck('الأحدث أولًا مع الوقت', 'تدريب غدًا' in pg.inner_text('#s-notices .nt >> nth=0') and pg.locator('#s-notices .nt time').first.inner_text().strip() != '')
    ck('النص يُهرَّب (لا وسوم ولا صور)', pg.locator('#s-notices img').count() == 0 and '<img src=x' in pg.inner_text('#s-notices .nt >> nth=1'))
    ck('زر «المباريات والنتائج» للمسار المعروف فقط', pg.locator('#s-notices .nt-go').count() == 1 and pg.get_attribute('#s-notices .nt-go', 'href') == '/#s-matches')
    pg.screenshot(path='/tmp/notices.png')
    ck('لا أخطاء JS', not errs, errs)
    pg, errs = page(br, p, NTS, status=404); pg.goto(B + '/index.html'); pg.wait_for_timeout(1500)
    ck('قبل 0029 (خطأ): لا قسم ولا أخطاء والموقع يعمل', pg.locator('#s-notices').count() == 0 and pg.locator('#s-about').count() == 1 and not errs, errs)
    pg, errs = page(br, p, []); pg.goto(B + '/index.html'); pg.wait_for_timeout(1500)
    ck('بلا تنبيهات: لا يظهر القسم', pg.locator('#s-notices').count() == 0 and not errs, errs)
    br.close()
print('%d/%d' % (sum(res), len(res))); sys.exit(0 if all(res) else 1)
