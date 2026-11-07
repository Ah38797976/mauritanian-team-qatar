# اختبار وضع التطبيق (PWA): manifest صالح، الأيقونات موجودة، الوسوم، CSP يسمح بالـ manifest، زر التحديث يظهر في وضع التطبيق فقط.
import json, pathlib, re, sys
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent; B = 'http://127.0.0.1:8793'; res = []
def ck(n, c, i=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else ' | ' + str(i)))
cfg = json.loads((ROOT / 'vercel.json').read_text(encoding='utf-8'))
csp = lambda src: next(kv['value'] for h in cfg['headers'] if h['source'] == src for kv in h['headers'] if kv['key'] == 'Content-Security-Policy')
def allows_manifest(c):
    m = re.search(r"manifest-src ([^;]+)", c); d = re.search(r"default-src ([^;]+)", c)
    return "'self'" in (m.group(1) if m else d.group(1))
for name, path, page, scope in (('العام', 'site.webmanifest', 'index.html', '/'), ('الإدارة', 'admin/live/app.webmanifest', 'admin/live/index.html', '/admin/live/')):
    m = json.loads((ROOT / path).read_text(encoding='utf-8'))
    ck(f'{name}: display=standalone وبداية ونطاق صحيحان', m['display'] == 'standalone' and m['scope'] == scope and m['start_url'].startswith(scope))
    ck(f'{name}: ألوان الخلفية والسمة داكنة ومتطابقة مع الموقع', m['background_color'] == '#06120c' and m['theme_color'] == '#06120c')
    sizes = {(i['sizes'], i['purpose']) for i in m['icons']}; ck(f'{name}: أيقونات 192 و512 وmaskable', {('192x192', 'any'), ('512x512', 'any'), ('512x512', 'maskable')} <= sizes)
    ck(f'{name}: ملفات الأيقونات موجودة', all((ROOT / i['src'].lstrip('/')).exists() for i in m['icons']))
    h = (ROOT / page).read_text(encoding='utf-8')
    ck(f'{name}: وسوم manifest وapple-touch-icon وcapable', all(x in h for x in ('rel="manifest"', 'apple-touch-icon', 'apple-mobile-web-app-capable', 'mobile-web-app-capable', 'apple-mobile-web-app-status-bar-style')))
    ck(f'{name}: لا وسم <style> مضمّن (يحجبه الـ CSP)', '<style' not in h)
ck('CSP الصفحة العامة (/) يسمح بالـ manifest', allows_manifest(csp('/')))
ck('CSP لوحة الإدارة الحيّة يسمح بالـ manifest', allows_manifest(csp('/admin/live/(.*)')))
ck('meta CSP في صفحة الإدارة يسمح بالـ manifest', allows_manifest(re.search(r'http-equiv="Content-Security-Policy" content="([^"]+)"', (ROOT / 'admin/live/index.html').read_text(encoding='utf-8')).group(1)))
from PIL import Image
for f in ('apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'):
    im = Image.open(ROOT / 'assets/icons' / f); ck(f'{f}: بلا شفافية (شرط iOS)', im.mode == 'RGB', im.mode)
with sync_playwright() as p:
    br = p.chromium.launch()
    for standalone in (False, True):
        ctx = br.new_context(**p.devices['iPhone 13'])
        if standalone: ctx.add_init_script("Object.defineProperty(navigator,'standalone',{get:()=>true});")
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(B + '/admin/live/index.html'); pg.wait_for_timeout(700)
        link = pg.eval_on_selector('link[rel=manifest]', 'e=>e.href'); r = pg.request.get(link)
        ck(f'رابط manifest يُجلب ({"تطبيق" if standalone else "متصفح"})', r.ok and r.json()['display'] == 'standalone')
        ck(f'زر «تحديث» {"ظاهر" if standalone else "مخفي"} في وضع {"التطبيق" if standalone else "المتصفح"}', pg.eval_on_selector('#reloadBtn','e=>!e.hidden') == standalone)
        ck('لا أخطاء JS', not errs, errs)
    br.close()
print(sum(res), '/', len(res)); sys.exit(0 if all(res) else 1)
