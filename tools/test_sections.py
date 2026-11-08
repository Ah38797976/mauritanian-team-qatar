# اختبار الصفحة الرئيسية بالخانات: بطاقات الأقسام، فتح خانة يعرض محتواها وحدها، زر الرجوع، القائمة السفلية، الرابط المباشر، وسلامة إعادة الرسم.
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
    ck('الرئيسية: خانة لكل قسم بأيقونة وعنوان', n >= 4 and pg.locator('.tiles .tile').count() == n and pg.locator('.tile .sec-i svg').count() == n, n)
    ck('الرئيسية: الخانة تعرض العدد (8 لاعبين / 2 مباراة / 1 هدّاف)', '8 لاعبًا' in pg.inner_text('.tile[href="#s-squad"]') and '2 مباراة' in pg.inner_text('.tile[href="#s-matches"]') and '1 هدّافًا' in pg.inner_text('.tile[href="#s-scorers"]'), pg.inner_text('.tile[href="#s-squad"]'))
    ck('الرئيسية: كل الأقسام مخفية والخانات والواجهة ظاهرة', pg.locator('#sv > section.sec:visible').count() == 0 and pg.locator('.tiles').is_visible() and pg.locator('.hero').is_visible())
    ck('الرئيسية: الخانات شبكة عمودين (لا عمود واحد) وبارتفاع لمس ≥ 100px', pg.evaluate("(()=>{const t=[...document.querySelectorAll('.tile')].map(e=>e.getBoundingClientRect()); return new Set(t.map(r=>Math.round(r.left))).size===2 && t.every(r=>r.height>=100 && r.width>=140)})()"))
    pg.screenshot(path=S + 'tiles_home.png', full_page=True)
    pg.click('a.tile[href="#s-squad"]'); pg.wait_for_timeout(400)
    ck('لمس خانة اللاعبين يفتح القسم وحده', pg.locator('#s-squad').is_visible() and pg.locator('#sv > section.sec:visible').count() == 1 and not pg.locator('.tiles').is_visible() and not pg.locator('.hero').is_visible())
    ck('زر «الرئيسية» ظاهر والقائمة تميّز القسم', pg.locator('#s-squad .sec-back').is_visible() and pg.locator('#snav a.on').get_attribute('href') == '#s-squad')
    pg.screenshot(path=S + 'tiles_open.png')
    pg.click('#s-squad .sec-back'); pg.wait_for_timeout(400)
    ck('زر «الرئيسية» يرجع للخانات', pg.locator('.tiles').is_visible() and pg.locator('#sv > section.sec:visible').count() == 0 and pg.locator('#snav a.on').get_attribute('href') == '#home')
    pg.click('a.tile[href="#s-scorers"]'); pg.wait_for_timeout(300); pg.go_back(); pg.wait_for_timeout(300)
    ck('زر الرجوع في المتصفح يرجع للخانات', pg.locator('.tiles').is_visible())
    pg.click('#snav a[href="#s-matches"]'); pg.wait_for_timeout(300)
    ck('القائمة السفلية تفتح القسم', pg.locator('#s-matches').is_visible() and pg.locator('#sv > section.sec:visible').count() == 1)
    pg.click('#snav a[href="#home"]'); pg.wait_for_timeout(300); ck('رابط «الرئيسية» في القائمة يرجع للخانات', pg.locator('.tiles').is_visible())
    pg.click('a.tile[href="#s-scorers"]'); pg.wait_for_timeout(300)
    h = pg.evaluate("(()=>{const e=document.querySelector('#s-scorers .lbd'); const r=e.getBoundingClientRect(); return [getComputedStyle(e).position, r.height]})()")
    ck('قائمة الهدّافين عنصر عادي (ليست طبقة ثابتة)', h[0] == 'static' and h[1] < 300, h)
    pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); pg.wait_for_timeout(1500)
    ck('إعادة الرسم تُبقي القسم المفتوح', pg.locator('#s-scorers').is_visible())
    ck('لا أخطاء JS', not errs, errs)
    ctx = br.new_context(**p.devices['iPhone 13']); pg2 = ctx.new_page(); pg2.route('**/rest/v1/rpc/rpc_public_site', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SITE)))
    for f in ('rpc_public_developer', 'rpc_public_gallery'): pg2.route('**/rest/v1/rpc/' + f, lambda r: r.fulfill(status=200, content_type='application/json', body='null'))
    pg2.goto(B + '/index.html#s-matches'); pg2.wait_for_timeout(1500)
    ck('رابط مباشر #s-matches يفتح القسم', pg2.locator('#s-matches').is_visible() and not pg2.locator('.tiles').is_visible())
    pg2.goto(B + '/index.html#s-zzz'); pg2.wait_for_timeout(1200)
    ck('رابط قسم غير موجود يعرض الخانات', pg2.locator('.tiles').is_visible())
    br.close()
print('%d/%d' % (sum(res), len(res)))
