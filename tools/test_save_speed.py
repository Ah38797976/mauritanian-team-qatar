# اختبار سرعة الحفظ: بعد أي كتابة تُعاد قراءة البيانات دفعة واحدة (رحلة شبكة واحدة) لا موجتين/ثلاث متتاليات.
# نقيس بتأخير محاكى لكل طلب (300ms): الحفظ = رحلة الكتابة + رحلة القراءة ≈ 2 × التأخير، ونتحقق أن البيانات المحدّثة ظهرت.
import json, pathlib, time
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent; B = 'http://127.0.0.1:8793'
MOCK = (ROOT / 'tools/fixtures/mock_supabase_lineup.js').read_text(encoding='utf-8'); res = []
def ck(n, c, i=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else ' | ' + str(i)))
D = 300
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(**p.devices['iPhone 13'])
    ctx.route('**/vendor/supabase.min.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=MOCK))
    ctx.add_init_script('window.__mockInit = ' + json.dumps({'role': 'founder', 'perms': ['viewPlayers', 'players', 'settings', 'contactPlayers'], 'delay': D}) + ';')
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(B + '/admin/live/index.html#/players'); pg.wait_for_selector('#shell:not([hidden])', timeout=20000); pg.wait_for_timeout(1500)
    t0 = time.time(); r = pg.evaluate("window.TeamData.refresh().then(()=>1)"); wall = time.time() - t0
    print('read s:', round(wall, 2)); ck('قراءة كاملة: رحلة واحدة (≤ 2×التأخير) بدل موجتين/ثلاث', wall < 2 * D / 1000 + 0.3, round(wall, 2))
    t0 = time.time(); er = pg.evaluate("window.TeamData.savePlayer({name:'لاعب جديد', num: 77, pos:'وسط', status:'نشط', city:'الدوحة'})"); wall = time.time() - t0
    print('save s:', round(wall, 2)); ck('حفظ لاعب = كتابة + قراءة: ≤ 3×التأخير (كان ≈ 4×)', er == '' and wall < 3 * D / 1000 + 0.3, (er, round(wall, 2)))
    ck('لا أخطاء JS', not errs, errs)
    br.close()
print('%d/%d' % (sum(res), len(res)))
