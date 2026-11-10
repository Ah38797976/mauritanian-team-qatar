# التدريب القادم (0022): إدارة (تفاصيل الحصة، تعديل، زر الاستدعاء، الرجوع للاستعلام القديم) .
import json, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent; B = 'http://127.0.0.1:8793'; res = []
MOCK = (ROOT / 'tools/fixtures/mock_supabase_lineup.js').read_text(encoding='utf-8')
def ck(n, c, i=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else ' | ' + str(i)))
with sync_playwright() as p:
    br = p.chromium.launch()
    def adm(init):
        c = br.new_context(**p.devices['iPhone 13']); c.route('**/vendor/supabase.min.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=MOCK))
        c.add_init_script('window.__mockInit = ' + json.dumps(dict({'role': 'founder', 'perms': ['viewPlayers', 'players', 'settings', 'attendance', 'lineup', 'contactPlayers', 'matches']}, **init)) + ';')
        g = c.new_page(); e = []; g.on('pageerror', lambda x: e.append(str(x))); g.on('dialog', lambda d: d.accept())
        g.goto(B + '/admin/live/index.html#/coach'); g.wait_for_selector('#shell:not([hidden])', timeout=20000); g.wait_for_timeout(1500); return g, e
    g, e = adm({'upSession': True})
    ck('الإدارة: تفاصيل الحصة (وقت وملعب وخريطة)', all(x in g.inner_text('#tinfo') for x in ('8:00 م', 'ملعب التدريب', 'الخريطة')), g.inner_text('#tinfo') if g.locator('#tinfo').count() else 'no tinfo')
    ck('رابط الخريطة آمن', g.get_attribute('#tinfo a', 'rel') == 'noopener noreferrer' and g.get_attribute('#tinfo a', 'href').startswith('https://'))
    g.click('#edses'); g.wait_for_timeout(300)
    ck('نموذج التعديل فيه الوقت والملعب والخريطة', all(g.locator('input[name="%s"]' % n).count() == 1 for n in ('time', 'venue', 'map')))
    g.fill('input[name="time"]', '21:30'); g.fill('input[name="venue"]', 'ملعب جديد'); g.click('dialog#modal form button:not(.sec)'); g.wait_for_timeout(600)
    sv = g.evaluate("window.__mock.calls.filter(c => c.name === 'rpc_save_session').map(c => c.args.s)")
    ck('الحفظ يرسل id وtime وvenue وmap', sv and sv[-1].get('id') == 'ts1' and sv[-1].get('time') == '21:30' and sv[-1].get('venue') == 'ملعب جديد' and 'map' in sv[-1], sv)
    g.click('#callup'); g.wait_for_timeout(600)
    inv = g.evaluate("window.__mock.invokes")
    ck('زر الاستدعاء يرسل تنبيهًا برابط الصفحة الرئيسية', inv and inv[-1]['body']['url'] == '/' and inv[-1]['body']['title'] == 'استدعاء للتدريب' and '8:00' in inv[-1]['body']['body'], inv)
    ck('لا أخطاء JS (إدارة)', not e, e)
    g2, e2 = adm({'noTrainExt': True})
    ck('قبل 0022: الصفحة تعمل ولا تفاصيل ولا ردود ولا استدعاء', g2.locator('#tinfo').count() == 0 and g2.locator('#callup').count() == 0 and g2.locator('#edses').count() == 0 and not e2, e2)
    g3, e3 = adm({})   # الحصة الافتراضية ماضية: لا زر استدعاء
    ck('حصة ماضية: لا زر استدعاء', g3.locator('#callup').count() == 0)

    br.close()
print(sum(res), '/', len(res))
raise SystemExit(0 if all(res) else 1)
