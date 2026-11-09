# اختبار وقت المباراة والملعب (0021): الموقع العام (12 ساعة، تهريب النص، إخفاء الحقول الغائبة) ونموذج الإدارة (يظهر فقط بعد 0021، ويُرسل الحقلين) والرجوع للاستعلام القديم.
import json, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent; B = 'http://127.0.0.1:8793'; res = []
MOCK = (ROOT / 'tools/fixtures/mock_supabase_lineup.js').read_text(encoding='utf-8')
def ck(n, c, i=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else ' | ' + str(i)))
SITE = {'team': {'name': 'فريق', 'city': 'الدوحة', 'color': '#0b6b3a'}, 'about': '', 'announcement': '', 'sections': {'matches': True},
        'matches': [{'opp': 'المغرب', 'date': '2999-12-10', 'home': False, 'played': False, 'time': '19:30', 'venue': '<img src=x onerror=alert(1)>ملعب'},
                    {'opp': 'مصر', 'date': '2999-12-11', 'home': True, 'played': False, 'time': '00:05', 'venue': ''},
                    {'opp': 'تونس', 'date': '2999-12-12', 'home': True, 'played': False, 'time': '25:99', 'venue': None},
                    {'opp': 'الجزائر', 'date': '2999-12-13', 'home': True, 'played': False}]}
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(**p.devices['iPhone 13']); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route('**/rest/v1/rpc/rpc_public_site', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SITE)))
    for f in ('rpc_public_developer', 'rpc_public_gallery', 'rpc_public_training'): pg.route('**/rest/v1/rpc/' + f, lambda r: r.fulfill(status=200, content_type='application/json', body='null'))
    pg.route('**/rest/v1/rpc/rpc_push_*', lambda r: r.fulfill(status=200, content_type='application/json', body='""'))
    pg.goto(B + '/index.html#s-matches'); pg.wait_for_timeout(1500)
    cards = pg.eval_on_selector_all('.card.m', "els => els.map(e => ({t: e.querySelector('.tm-c') ? e.querySelector('.tm-c').textContent : null, v: e.querySelector('.vn') ? e.querySelector('.vn').textContent : null}))")
    ck('4 بطاقات', len(cards) == 4, cards)
    ck('19:30 تظهر 7:30 م', cards[0]['t'] == '7:30 م', cards[0])
    ck('اسم الملعب يظهر نصًّا (لا وسوم)', cards[0]['v'] == '<img src=x onerror=alert(1)>ملعب' and pg.locator('.card.m img').count() == 0, cards[0])
    ck('00:05 تظهر 12:05 ص بلا ملعب', cards[1]['t'] == '12:05 ص' and cards[1]['v'] is None, cards[1])
    ck('وقت غير صالح يُخفى', cards[2]['t'] is None and cards[2]['v'] is None, cards[2])
    ck('بلا حقلين: لا شارات إضافية', cards[3]['t'] is None and cards[3]['v'] is None, cards[3])
    pg.goto(B + '/index.html'); pg.wait_for_timeout(1500)
    meta = pg.inner_text('#heroNext .meta')
    ck('بطاقة المباراة القادمة تعرض الوقت والملعب', '7:30 م' in meta and 'ملعب' in meta, meta)
    ck('لا أخطاء JS (موقع)', not errs, errs)
    # --- الإدارة ---
    def adm(init):
        c = br.new_context(**p.devices['iPhone 13']); c.route('**/vendor/supabase.min.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=MOCK))
        c.add_init_script('window.__mockInit = ' + json.dumps(dict({'role': 'founder', 'perms': ['viewPlayers', 'players', 'settings', 'contactPlayers', 'matches']}, **init)) + ';')
        g = c.new_page(); e = []; g.on('pageerror', lambda x: e.append(str(x)))
        g.goto(B + '/admin/live/index.html#/matches'); g.wait_for_selector('#shell:not([hidden])', timeout=20000); g.wait_for_timeout(1200); return g, e
    g, e = adm({})
    ck('الإدارة: الوقت والملعب يظهران في بطاقة المباراة', '19:30' in g.inner_text('[data-m="m1"]') and 'ملعب الدحيل' in g.inner_text('[data-m="m1"]'), g.inner_text('[data-m="m1"]')[:120])
    g.click('[data-em="m1"]'); g.wait_for_timeout(300)
    ck('النموذج يحوي حقلي الوقت والملعب', g.locator('input[name="time"]').count() == 1 and g.locator('input[name="venue"]').count() == 1)
    g.fill('input[name="time"]', '21:15'); g.fill('input[name="venue"]', 'استاد خليفة'); g.click('dialog#modal button[type="submit"], dialog#modal form button:not(.sec)'); g.wait_for_timeout(600)
    sv = g.evaluate("window.__mock.calls.filter(c => c.name === 'rpc_save_match').map(c => c.args.m)")
    ck('الحفظ يرسل time وvenue', sv and sv[-1].get('time') == '21:15' and sv[-1].get('venue') == 'استاد خليفة', sv)
    ck('لا أخطاء JS (إدارة)', not e, e)
    g2, e2 = adm({'noMatchExt': True})
    ck('قبل 0021: الصفحة تعمل بالاستعلام القديم', g2.locator('[data-m]').count() >= 1 and not e2, e2)
    g2.click('[data-em="m1"]'); g2.wait_for_timeout(300)
    ck('قبل 0021: لا حقول الوقت والملعب', g2.locator('input[name="time"]').count() == 0 and g2.locator('input[name="venue"]').count() == 0)
    br.close()
print('%d/%d' % (sum(res), len(res)))
