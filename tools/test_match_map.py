# اختبار رابط موقع الملعب في الموقع العام: رابط الخريطة المحفوظ (https) أولًا، وإلا بحث باسم الملعب، وإلا لا رابط؛ ورفض الروابط غير https
import json, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent; B = 'http://127.0.0.1:8793'; res = []
def ck(n, c, i=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else ' | ' + str(i)))
SITE = {'team': {'name': 'فريق', 'city': 'الدوحة', 'color': '#0b6b3a'}, 'about': '', 'announcement': '', 'sections': {'matches': True},
        'matches': [{'opp': 'المغرب', 'date': '2999-12-10', 'home': False, 'played': False, 'time': '19:30', 'venue': 'ملعب الدحيل', 'map': 'https://maps.app.goo.gl/abc123'},
                    {'opp': 'مصر', 'date': '2999-12-11', 'home': True, 'played': False, 'venue': 'استاد خليفة', 'map': None},
                    {'opp': 'تونس', 'date': '2999-12-12', 'home': True, 'played': False, 'venue': 'ملعب س', 'map': 'javascript:alert(1)'},
                    {'opp': 'الجزائر', 'date': '2999-12-13', 'home': True, 'played': False, 'venue': '', 'map': 'https://maps.app.goo.gl/only'},
                    {'opp': 'ليبيا', 'date': '2999-12-14', 'home': True, 'played': False},
                    {'opp': 'السودان', 'date': '2999-12-15', 'home': True, 'played': False, 'venue': 'ملعب ص', 'map': 'http://insecure.example/x'}]}
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(**p.devices['iPhone 13']); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route('**/rest/v1/rpc/rpc_public_site', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SITE)))
    for f in ('rpc_public_developer', 'rpc_public_gallery', 'rpc_public_training'): pg.route('**/rest/v1/rpc/' + f, lambda r: r.fulfill(status=200, content_type='application/json', body='null'))
    pg.route('**/rest/v1/rpc/rpc_push_*', lambda r: r.fulfill(status=200, content_type='application/json', body='""'))
    pg.goto(B + '/index.html#s-matches'); pg.wait_for_timeout(1500)
    cs = pg.eval_on_selector_all('.card.m', "els => els.map(e => { const a = e.querySelector('a.vn'); return {href: a ? a.getAttribute('href') : null, rel: a ? a.rel : null, tgt: a ? a.target : null, txt: e.querySelector('.vn') ? e.querySelector('.vn').textContent : null}; })")
    ck('6 بطاقات', len(cs) == 6, cs)
    ck('رابط الخريطة المحفوظ يُستعمل كما هو مع noopener', cs[0]['href'] == 'https://maps.app.goo.gl/abc123' and 'noopener' in cs[0]['rel'] and cs[0]['tgt'] == '_blank', cs[0])
    ck('بلا رابط: بحث خرائط باسم الملعب (+ قطر)', cs[1]['href'] and cs[1]['href'].startswith('https://www.google.com/maps/search/?api=1&query=') and '%D9%82%D8%B7%D8%B1' in cs[1]['href'], cs[1])
    ck('javascript: مرفوض ويُستبدل ببحث', cs[2]['href'] and cs[2]['href'].startswith('https://www.google.com/maps/'), cs[2])
    ck('رابط بلا اسم ملعب: نص «موقع الملعب»', cs[3]['href'] == 'https://maps.app.goo.gl/only' and 'موقع الملعب' in cs[3]['txt'], cs[3])
    ck('لا ملعب ولا رابط: لا شيء', cs[4]['txt'] is None, cs[4])
    ck('http غير آمن مرفوض', cs[5]['href'] and cs[5]['href'].startswith('https://www.google.com/maps/'), cs[5])
    pg.goto(B + '/index.html'); pg.wait_for_timeout(1500)
    h = pg.eval_on_selector('#heroNext .meta a.vl', 'a => a.getAttribute("href")')
    ck('بطاقة المباراة القادمة فيها رابط الموقع', h == 'https://maps.app.goo.gl/abc123', h)
    ck('لا أخطاء JS', not errs, errs)
    br.close()
print('%d/%d' % (sum(res), len(res)))
