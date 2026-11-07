# اختبار: على جهاز لمس لا يبقى عنصر القائمة الجانبية رمادي (hover عالق) بعد لمسه.
import json, pathlib, sys
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent; B = 'http://127.0.0.1:8793'
MOCK = (ROOT / 'tools/fixtures/mock_supabase_lineup.js').read_text(encoding='utf-8'); ok = True
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(**p.devices['iPhone 13'])
    ctx.route('**/vendor/supabase.min.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=MOCK))
    ctx.add_init_script('window.__mockInit = ' + json.dumps({'role': 'founder', 'perms': ['viewPlayers', 'lineup']}) + ';')
    pg = ctx.new_page(); pg.goto(B + '/admin/live/index.html'); pg.wait_for_selector('#nav a', state='attached', timeout=15000)
    pg.evaluate("document.body.classList.add('menu-open')")
    a = pg.locator('#nav a:not(.on)').first; pg.wait_for_timeout(800); bx = a.bounding_box(); pg.mouse.move(bx['x'] + bx['width'] / 2, bx['y'] + bx['height'] / 2); pg.wait_for_timeout(500)
    bg = a.evaluate('e=>getComputedStyle(e).backgroundColor')
    ok = bg in ('rgba(0, 0, 0, 0)', 'transparent'); print(('PASS' if ok else 'FAIL'), 'العنصر الملموس لا يبقى رماديًا', bg)
    br.close()
sys.exit(0 if ok else 1)
