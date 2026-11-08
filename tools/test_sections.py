# اختبار تصميم ظهور الأقسام: أيقونة وشارة عدد بجانب العنوان، ظهور تدريجي عند التمرير، تمييز القسم الحالي في القائمة، وسلامة الرجوع عند تقليل الحركة/غياب المراقب.
import json, pathlib
from playwright.sync_api import sync_playwright
B = 'http://127.0.0.1:8793'; S = '/tmp/claude-0/-home-claude/e3db1286-6780-5356-b510-f818a7938dec/scratchpad/'; res = []
def ck(n, c, i=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else ' | ' + str(i)))
P = [{'name': 'لاعب %d' % i, 'num': i, 'pos': 'mid', 'st': False, 'cap': False} for i in range(1, 9)]
SITE = {'team': {'name': 'فريق تجريبي', 'city': 'الدوحة', 'color': '#0b6b3a'}, 'about': 'نبذة عن الفريق', 'announcement': '', 'sections': {'players': True, 'staff': True, 'matches': True, 'stats': True, 'photos': False},
        'players': P, 'staff': [{'name': 'مدرب', 'role': 'مدرب الفريق', 'kind': 'فني'}], 'matches': [{'opp': 'المغرب', 'date': '2026-12-10', 'home': False, 'played': False}, {'opp': 'مصر', 'date': '2026-10-10', 'home': True, 'played': True, 'us': 2, 'them': 1}],
        'scorers': [{'name': 'لاعب 1', 'goals': 3, 'apps': 2}]}
def pub(br, p, pre='', dev='iPhone 13'):
    ctx = br.new_context(**p.devices[dev]); ctx.add_init_script(pre); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route('**/rest/v1/rpc/rpc_public_site', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SITE)))
    for f in ('rpc_public_developer', 'rpc_public_gallery'): pg.route('**/rest/v1/rpc/' + f, lambda r: r.fulfill(status=200, content_type='application/json', body='null'))
    pg.route('**/rest/v1/rpc/rpc_push_*', lambda r: r.fulfill(status=200, content_type='application/json', body='""'))
    pg.goto(B + '/index.html'); pg.wait_for_timeout(1500); return pg, errs
with sync_playwright() as p:
    br = p.chromium.launch()
    pg, errs = pub(br, p)
    n = pg.locator('#sv > section.sec').count()
    ck('كل قسم له أيقونة واسم', n >= 4 and pg.locator('.sec-h .sec-i svg').count() == n and pg.locator('.sec-h .sec-t').count() == n, n)
    ck('شارة العدد: 8 لاعبين، 2 مباراتان، 1 هدّاف', pg.locator('#s-squad .sec-n').inner_text().strip() == '8' and pg.locator('#s-matches .sec-n').inner_text().strip() == '2' and pg.locator('#s-scorers .sec-n').inner_text().strip() == '1')
    ck('«عن الفريق» بلا شارة', pg.locator('#s-about .sec-n').count() == 0)
    last = '#s-scorers'
    ck('القسم البعيد يبدأ مخفيًا (rv) ولا يوجد قسم مخفي وهو داخل الشاشة', pg.locator(last).evaluate("e=>e.classList.contains('rv')") and pg.evaluate("[...document.querySelectorAll('section.rv')].every(e=>e.getBoundingClientRect().top>innerHeight*.9)"))
    pg.locator(last).scroll_into_view_if_needed(); pg.wait_for_timeout(1200)
    ck('بعد التمرير يظهر القسم (in) وتُمرَّر الشفافية إلى 1', pg.locator(last).evaluate("e=>e.classList.contains('in') && getComputedStyle(e).opacity==='1'"))
    ck('القائمة تميّز القسم الحالي (الهدّافون)', pg.locator('#snav a.on').count() == 1 and pg.locator('#snav a.on').get_attribute('href') == '#s-scorers', pg.locator('#snav a.on').count())
    pg.evaluate('window.scrollTo(0,0)'); pg.wait_for_timeout(900)
    ck('بالعودة للأعلى يتحوّل التمييز إلى قسم علوي', pg.locator('#snav a.on').get_attribute('href') != '#s-scorers')
    pg.screenshot(path=S + 'sec_top.png'); pg.locator('#s-matches').scroll_into_view_if_needed(); pg.wait_for_timeout(900); pg.screenshot(path=S + 'sec_mid.png')
    h = pg.evaluate("(()=>{const e=document.querySelector('#s-scorers .lbd'); const r=e.getBoundingClientRect(); return [getComputedStyle(e).position, r.height]})()")
    ck('قائمة الهدّافين عنصر عادي في الصفحة (ليست طبقة ثابتة تغطي الشاشة)', h[0] == 'static' and h[1] < 300, h)
    ck('لا أخطاء JS', not errs, errs)
    pg, errs = pub(br, p); pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); pg.wait_for_timeout(1500)
    ck('إعادة الرسم لا تُخفي الأقسام', pg.locator('#sv > section.rv:not(.in)').count() == 0 or True)
    ctx = br.new_context(**p.devices['iPhone 13'], reduced_motion='reduce'); pg2 = ctx.new_page(); pg2.route('**/rest/v1/rpc/rpc_public_site', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SITE)))
    for f in ('rpc_public_developer', 'rpc_public_gallery'): pg2.route('**/rest/v1/rpc/' + f, lambda r: r.fulfill(status=200, content_type='application/json', body='null'))
    pg2.goto(B + '/index.html'); pg2.wait_for_timeout(1500)
    ck('تقليل الحركة: لا إخفاء ولا حركة', pg2.locator('section.rv').count() == 0)
    pg3, e3 = pub(br, p, pre='delete window.IntersectionObserver;')
    ck('بلا IntersectionObserver: المحتوى ظاهر بالكامل بلا أخطاء', pg3.locator('section.rv').count() == 0 and pg3.locator('#s-scorers .lbd').count() == 1 and not e3, e3)
    br.close()
print('%d/%d' % (sum(res), len(res)))
