# اختبار شعارات الفرق المنافسة: لوحة الإدارة (قائمة الخصوم/رفع PNG مصغّر/تغيير/حذف/قبل 0028) + الموقع العام (شعار في البطاقة والمباراة القادمة، ورفض المسارات غير الصالحة، والرجوع للحروف).
import json, pathlib, sys, os
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent; B = 'http://127.0.0.1:8793'
MOCK = (ROOT / 'tools/fixtures/mock_supabase_lineup.js').read_text(encoding='utf-8')
FLAG = os.environ.get('FLAG_IMG', '/tmp/flag.png'); res = []
def ck(n, c, i=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else ' | ' + str(i)))
def mk(br, p, init):
    ctx = br.new_context(**p.devices['iPhone 13']); ctx.route('**/vendor/supabase.min.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=MOCK))
    ctx.add_init_script('window.__mockInit = ' + json.dumps(init) + ';'); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); return pg, errs
def wait(pg, sel, ms=15000):
    for _ in range(ms // 100):
        if pg.locator(sel).count() and pg.locator(sel).first.is_visible(): return True
        pg.wait_for_timeout(100)
    return False
F = {'role': 'founder', 'perms': ['settings', 'viewPlayers']}
with sync_playwright() as p:
    br = p.chromium.launch()
    pg, errs = mk(br, p, F); pg.goto(B + '/admin/live/index.html#/site')
    ck('اللوحة: يظهر قسم الشعارات بأسماء الخصوم من المباريات', wait(pg, '#logosbox [data-lgf]') and 'الريان' in pg.inner_text('#logosbox'))
    nm = pg.get_attribute('#logosbox [data-lgf]', 'data-lgf')
    pg.set_input_files('#logosbox [data-lgf]', FLAG); pg.wait_for_timeout(2500)
    up = pg.evaluate('window.__mock.uploads') or []
    ck('اللوحة: رُفع PNG واحد صغير بمسار الفريق', len(up) == 1 and up[0]['type'] == 'image/png' and up[0]['size'] < 2097152 and up[0]['path'].startswith('t1/t1/') and up[0]['path'].endswith('.png'), up)
    ck('اللوحة: بعد الرفع تظهر صورة الشعار وزر «تغيير» وزر حذف', pg.locator('#logosbox .lgav img').count() == 1 and 'تغيير' in pg.inner_text('#logosbox .lgrow') and pg.locator('#logosbox [data-lgd]').count() == 1)
    ck('اللوحة: استُدعي rpc_set_opponent_logo باسم الخصم', any(c['name'] == 'rpc_set_opponent_logo' and c['args'].get('p_name') == nm for c in pg.evaluate('window.__mock.calls')))
    pg.set_input_files('#logosbox [data-lgf]', FLAG); pg.wait_for_timeout(2500)
    ck('اللوحة: التغيير يستبدل الشعار القديم (يحذف ملفه) ولا يكرر الصف', len(pg.evaluate('window.__mock.removed') or []) == 1 and pg.locator('#logosbox .lgav img').count() == 1)
    n = pg.locator('#logosbox .lgrow').count(); pg.once('dialog', lambda d: d.accept()); pg.locator('#logosbox [data-lgd]').first.click(); pg.wait_for_timeout(1200)
    ck('اللوحة: الحذف يزيل الشعار ويبقى اسم الخصم بلا صورة', pg.locator('#logosbox .lgav img').count() == 0 and pg.locator('#logosbox .lgrow').count() == n and len(pg.evaluate('window.__mock.removed') or []) == 2)
    ck('اللوحة: لا أخطاء JS', not errs, errs)
    pg, errs = mk(br, p, {**F, 'logosMissing': True}); pg.goto(B + '/admin/live/index.html#/site'); pg.wait_for_timeout(2500)
    ck('اللوحة (قبل 0028): رسالة «غير مفعّلة» بلا أخطاء', 'غير مفعّلة' in pg.inner_text('#logosbox') and pg.locator('[data-lgf]').count() == 0 and not errs, errs)
    # العام
    TEAM = 'a0000000-0000-4000-8000-000000000001'; U = '00000000-0000-4000-8000-0000000000%02d'
    OK = '%s/%s/%s.png' % (TEAM, TEAM, U % 1)
    SITE = {'team': {'name': 'فريق', 'city': 'الدوحة', 'color': '#0b6b3a'}, 'about': '', 'announcement': '', 'sections': {'matches': True},
            'matches': [{'opp': 'غامبيا', 'date': '2999-12-10', 'home': False, 'played': False, 'time': '19:30', 'logo': OK},
                        {'opp': 'مصر', 'date': '2999-12-11', 'home': True, 'played': False, 'logo': None},
                        {'opp': 'تونس', 'date': '2999-12-12', 'home': True, 'played': False, 'logo': 'https://evil.example/x.png'},
                        {'opp': 'ليبيا', 'date': '2999-12-13', 'home': True, 'played': False, 'logo': '<img src=x onerror=alert(1)>'}]}
    ctx = br.new_context(**p.devices['iPhone 13']); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route('**/rest/v1/rpc/rpc_public_site', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SITE)))
    for f in ('rpc_public_developer', 'rpc_public_gallery', 'rpc_public_training'): pg.route('**/rest/v1/rpc/' + f, lambda r: r.fulfill(status=200, content_type='application/json', body='null'))
    pg.route('**/rest/v1/rpc/rpc_push_*', lambda r: r.fulfill(status=200, content_type='application/json', body='""'))
    pg.route('**/storage/v1/object/public/**', lambda r: r.fulfill(status=200, content_type='image/png', body=open(FLAG, 'rb').read()))
    pg.goto(B + '/index.html#s-matches'); pg.wait_for_timeout(1800)
    cs = pg.eval_on_selector_all('.card.m', "els => els.map(e => ({img: e.querySelectorAll('.tb img').length, src: e.querySelector('.tb img') ? e.querySelector('.tb img').src : null, lg: !!e.querySelector('.tb:not(.us).lg')}))")
    ck('4 بطاقات', len(cs) == 4, cs)
    ck('شعار صالح يظهر من حاوية player-photos العامة', cs[0]['img'] == 1 and cs[0]['lg'] and cs[0]['src'].endswith('/storage/v1/object/public/player-photos/' + OK), cs[0])
    ck('بلا شعار: حروف الفريق (لا صورة)', cs[1]['img'] == 0 and not cs[1]['lg'], cs[1])
    ck('رابط خارجي أو وسم في الحقل يُرفض', cs[2]['img'] == 0 and cs[3]['img'] == 0, cs)
    ck('كل بطاقة مباراة تعرض علم موريتانيا لفريقنا', pg.eval_on_selector_all('.card.m', "els => els.every(e => e.querySelectorAll('.tb.us svg').length === 1)"))
    pg.screenshot(path=os.environ.get('SHOT', '/tmp/logo_cards.png'), full_page=False)
    pg.goto(B + '/index.html'); pg.wait_for_timeout(1800)
    own = pg.locator('#heroNext .mrf')
    ck('المباراة القادمة: علم موريتانيا لفريقنا بجانب علم الخصم', own.count() == 1 and own.first.get_attribute('aria-label') == 'علم موريتانيا' and own.first.locator('svg').count() == 1)
    ck('المباراة القادمة: العلمان على جانبين مختلفين', pg.evaluate("(()=>{const o=document.querySelector('#heroNext .mrf').getBoundingClientRect(), l=document.querySelector('#heroNext img.hl').getBoundingClientRect(); return Math.abs(o.left-l.left) > 80})()"))
    ck('المباراة القادمة تعرض شعار الخصم', pg.locator('#heroNext img.hl').count() == 1 and pg.get_attribute('#heroNext img.hl', 'alt') == 'غامبيا')
    ck('لا أخطاء JS', not errs, errs)
    br.close()
print('%d/%d' % (sum(res), len(res))); sys.exit(0 if all(res) else 1)
