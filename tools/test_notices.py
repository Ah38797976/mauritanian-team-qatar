# اختبار قسم «التنبيهات»: ما لم يُفتح يبقى ثابتًا (شريط لاصق + بلاطة) ويختفي بعد فتح القسم على هذا الجهاز؛ التنبيه الجديد يظهر من جديد؛ تهريب النص؛ وسلوك ما قبل 0029.
import json, sys
from playwright.sync_api import sync_playwright
B = 'http://127.0.0.1:8793'; res = []
def ck(n, c, i=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else ' | ' + str(i)))
SITE = {'team': {'name': 'فريق', 'city': 'الدوحة', 'color': '#0b6b3a'}, 'about': 'نبذة', 'announcement': '', 'sections': {'matches': True}, 'matches': []}
N = lambda i, t, b='نص', u='/#s-notices': {'id': i, 'title': t, 'body': b, 'at': '2026-11-16T15:00:00+00:00', 'url': u}
NTS = [N(12, 'تدريب غدًا', 'الساعة 7 مساءً'), N(11, '<img src=x onerror=alert(1)>', '<b>x</b>', '/#s-matches'), N(10, 'رابط غريب', 'لا زر', 'https://evil.example/')]
state = {'data': NTS, 'status': 200}
def mk(br, p):
    ctx = br.new_context(**p.devices['iPhone 13']); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route('**/rest/v1/rpc/rpc_public_site', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SITE)))
    pg.route('**/rest/v1/rpc/rpc_public_notices', lambda r: r.fulfill(status=state['status'], content_type='application/json', body=json.dumps(state['data'])))
    for f in ('rpc_public_developer', 'rpc_public_gallery', 'rpc_public_training'): pg.route('**/rest/v1/rpc/' + f, lambda r: r.fulfill(status=200, content_type='application/json', body='null'))
    pg.route('**/rest/v1/rpc/rpc_push_*', lambda r: r.fulfill(status=200, content_type='application/json', body='""'))
    return pg, errs
def vis(pg, sel): return pg.locator(sel).count() > 0 and pg.locator(sel).first.is_visible()
with sync_playwright() as p:
    br = p.chromium.launch()
    pg, errs = mk(br, p); pg.goto(B + '/index.html'); pg.wait_for_timeout(1800)
    ck('غير مفتوحة: شريط «3 تنبيهات جديدة» ظاهر ويعرض أحدثها', vis(pg, '#ntbar .nt-banner') and '3 تنبيهات جديدة' in pg.inner_text('#ntbar') and 'تدريب غدًا' in pg.inner_text('#ntbar'))
    ck('غير مفتوحة: بلاطة التنبيهات أول بلاطة', pg.locator('.tile').first.get_attribute('href') == '#s-notices')
    pg.evaluate('document.body.style.minHeight="4000px"'); pg.evaluate('window.scrollTo(0, 1500)'); pg.wait_for_timeout(300)
    top = pg.evaluate("document.querySelector('#ntbar').getBoundingClientRect().top")
    ck('الشريط ثابت: يبقى ظاهرًا أعلى الشاشة عند التمرير', top < 5 and vis(pg, '#ntbar .nt-banner'), top)
    pg.reload(); pg.wait_for_timeout(1800)
    ck('بلا فتح: بعد إعادة التحميل يبقى ثابتًا', vis(pg, '#ntbar .nt-banner') and pg.locator('#s-notices').count() == 1)
    pg.click('#ntbar .nt-banner'); pg.wait_for_timeout(600)
    ck('ضغط الشريط يفتح القسم بـ 3 بطاقات (الأحدث أولًا)', vis(pg, '#s-notices') and pg.locator('#s-notices .nt').count() == 3 and 'تدريب غدًا' in pg.inner_text('#s-notices .nt >> nth=0'))
    ck('النص يُهرَّب', pg.locator('#s-notices img').count() == 0 and '<img src=x' in pg.inner_text('#s-notices .nt >> nth=1'))
    ck('زر المسار للمعروف فقط (/#s-matches)', pg.locator('#s-notices .nt-go').count() == 1 and pg.get_attribute('#s-notices .nt-go', 'href') == '/#s-matches')
    ck('الشريط مخفي داخل القسم', not vis(pg, '#ntbar .nt-banner'))
    pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); pg.wait_for_timeout(1500)
    ck('تحديث الصفحة تلقائيًا أثناء القراءة لا يخفي البطاقات', vis(pg, '#s-notices') and pg.locator('#s-notices .nt').count() == 3)
    pg.screenshot(path='/tmp/notices.png')
    pg.click('#s-notices .sec-back'); pg.wait_for_timeout(800)
    ck('بعد فتحها والرجوع: تختفي (لا شريط ولا بلاطة ولا قسم)', not vis(pg, '#ntbar .nt-banner') and pg.locator('#s-notices').count() == 0 and pg.locator('.tile[href="#s-notices"]').count() == 0)
    pg.reload(); pg.wait_for_timeout(1800)
    ck('بعد إعادة التحميل تبقى مختفية', pg.locator('#s-notices').count() == 0 and not vis(pg, '#ntbar .nt-banner'))
    state['data'] = [N(13, 'مباراة الجمعة')] + NTS; pg.reload(); pg.wait_for_timeout(1800)
    ck('تنبيه جديد فقط يظهر ثابتًا (القديم المشاهَد لا يعود)', vis(pg, '#ntbar .nt-banner') and 'تنبيه جديد' in pg.inner_text('#ntbar') and '3' not in pg.inner_text('#ntbar') and 'مباراة الجمعة' in pg.inner_text('#ntbar'))
    pg.goto(B + '/index.html#s-notices'); pg.wait_for_timeout(1500)
    ck('فتح الرابط /#s-notices مباشرة (ضغط الإشعار) يعرض الجديد وحده', vis(pg, '#s-notices') and pg.locator('#s-notices .nt').count() == 1)
    ck('لا أخطاء JS', not errs, errs)
    # جهاز آخر (سياق جديد): يرى كل التنبيهات من جديد
    pg2, e2 = mk(br, p); pg2.goto(B + '/index.html'); pg2.wait_for_timeout(1800)
    ck('جهاز آخر: يرى كل التنبيهات الأربعة', '4 تنبيهات جديدة' in pg2.inner_text('#ntbar'))
    state['status'] = 404; pg3, e3 = mk(br, p); pg3.goto(B + '/index.html'); pg3.wait_for_timeout(1500)
    ck('قبل 0029 (خطأ): لا شريط ولا قسم والموقع يعمل', not vis(pg3, '#ntbar .nt-banner') and pg3.locator('#s-notices').count() == 0 and pg3.locator('#s-about').count() == 1 and not e3, e3)
    state['status'] = 200; state['data'] = []; pg4, e4 = mk(br, p); pg4.goto(B + '/index.html'); pg4.wait_for_timeout(1500)
    ck('بلا تنبيهات: لا شريط', not vis(pg4, '#ntbar .nt-banner') and pg4.locator('#s-notices').count() == 0 and not e4, e4)
    br.close()
print('%d/%d' % (sum(res), len(res))); sys.exit(0 if all(res) else 1)
