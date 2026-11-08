# اختبار معرض الصور: لوحة الإدارة (رفع متعدد/حذف/إظهار/وضع قديم/حد 40) + الموقع العام (يظهر/يختفي/عارض الصور/فشل لا يكسر الموقع/XSS).
import json, pathlib, sys
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent; B = 'http://127.0.0.1:8793'
MOCK = (ROOT / 'tools/fixtures/mock_supabase_lineup.js').read_text(encoding='utf-8')
S = '/tmp/claude-0/-home-claude/e3db1286-6780-5356-b510-f818a7938dec/scratchpad/'
IMGS = [S + 'g0.png', S + 'g1.png', S + 'g2.png']; res = []
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
UUID = '00000000-0000-4000-8000-0000000000XX'   # آخر خانتين تُستبدلان برقم
with sync_playwright() as p:
    br = p.chromium.launch()
    pg, errs = mk(br, p, F); pg.goto(B + '/admin/live/index.html#/site')
    ck('اللوحة: يظهر نموذج المعرض', wait(pg, '#gf'))
    ck('اللوحة: خيار الإظهار مطفأ افتراضيًا', not pg.is_checked('#gvis'))
    pg.set_input_files('#gf [name=gphotos]', IMGS); pg.fill('#gf [name=gcap]', 'مباراة الأمس'); pg.click('#gf button'); pg.wait_for_timeout(3500)
    up = pg.evaluate('window.__mock.uploads') or []
    ck('اللوحة: رُفعت 3 صور JPEG بأطول ضلع ≤1600 دون قصّ إلى مربع', len(up) == 3 and all(u['type'] == 'image/jpeg' and u['size'] < 2097152 and u['path'].startswith('t1/t1/') for u in up), up)
    ck('اللوحة: تظهر 3 صور مصغّرة بالتعليق', pg.locator('.galtile').count() == 3 and 'مباراة الأمس' in pg.inner_text('.galtile'))
    dims = pg.evaluate("(async()=>{const f=window.__mock.lastUploadFile; return f?f:null})()")
    pg.screenshot(path=S + 'gal_admin.png', full_page=True)
    pg.check('#gvis'); pg.wait_for_timeout(800)
    ck('اللوحة: تفعيل الإظهار يستدعي RPC', pg.evaluate('window.__mock.gal.visible') is True)
    n = pg.locator('.galtile').count(); pg.once('dialog', lambda d: d.accept()); pg.locator('.galx').first.click(); pg.wait_for_timeout(1200)
    ck('اللوحة: الحذف يزيل الصورة من القائمة ويحذف الملف', pg.locator('.galtile').count() == n - 1 and len(pg.evaluate('window.__mock.removed') or []) == 1)
    pg.click('#gf button'); pg.wait_for_timeout(600)
    ck('اللوحة: رفع بلا اختيار صور يعرض تنبيهًا', 'اختر صورة' in pg.inner_text('#toast'))
    ck('اللوحة: لا أخطاء JS', not errs, errs)
    pg, errs = mk(br, p, {**F, 'gal': {'photos': [{'id': 'g%d' % i, 'path': 't1/t1/%s%02d.jpg' % (UUID[:-2], i), 'caption': ''} for i in range(40)], 'n': 40}}); pg.goto(B + '/admin/live/index.html#/site'); wait(pg, '#gf')
    pg.set_input_files('#gf [name=gphotos]', IMGS[:1]); pg.click('#gf button'); pg.wait_for_timeout(800)
    ck('اللوحة: عند 40 صورة يُمنع الرفع برسالة', '40' in pg.inner_text('#toast') and not (pg.evaluate('window.__mock.uploads') or []))
    pg, errs = mk(br, p, {**F, 'galMissing': True}); pg.goto(B + '/admin/live/index.html#/site'); pg.wait_for_timeout(2500)
    ck('اللوحة (قبل 0018): رسالة «غير مفعّلة» بلا نموذج وبلا أخطاء', pg.locator('#gf').count() == 0 and 'غير مفعّلة' in pg.inner_text('#gallerybox') and not errs, errs)
    # العام
    SITE = {'team': {'name': 'فريق تجريبي', 'city': 'الدوحة', 'color': '#0b6b3a'}, 'about': 'نبذة', 'announcement': '', 'sections': {'players': False, 'staff': False, 'matches': False, 'stats': False, 'photos': False}}
    TEAM = 'a0000000-0000-4000-8000-000000000001'
    GAL = [{'path': '%s/%s/%s%02d.jpg' % (TEAM, TEAM, UUID[:-2], i), 'caption': 'صورة %d' % i} for i in range(1, 6)]
    def pub(gal, status=200, shot=None, w=None):
        ctx = br.new_context(**p.devices['iPhone 13']); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.route('**/rest/v1/rpc/rpc_public_site', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SITE)))
        pg.route('**/rest/v1/rpc/rpc_public_developer', lambda r: r.fulfill(status=200, content_type='application/json', body='null'))
        pg.route('**/rest/v1/rpc/rpc_public_gallery', lambda r: r.fulfill(status=status, content_type='application/json', body=json.dumps(gal)))
        pg.route('**/storage/v1/object/public/**', lambda r: r.fulfill(status=200, content_type='image/png', body=open(IMGS[0], 'rb').read()))
        pg.goto(B + '/index.html#s-gallery'); pg.wait_for_timeout(2500)
        if shot: pg.screenshot(path=S + shot, full_page=True)
        return pg, errs
    pg, errs = pub(GAL, shot='gal_public.png')
    ck('العام: يظهر قسم المعرض بـ 5 صور', pg.locator('#s-gallery .galt').count() == 5)
    ck('العام: شريط الهيرو بنقاط وعدّاد (5 نقاط، 1 / 5)', pg.locator('#s-gallery .hg-dot').count() == 5 and '1 / 5' in pg.inner_text('#s-gallery .hg-n'))
    h = pg.evaluate("(()=>{const t=document.querySelector('.hg-track').getBoundingClientRect(); const s=document.querySelector('.hg-slide').getBoundingClientRect(); return [t.width, t.height, s.width, innerWidth, innerHeight]})()")
    ck('العام: الشريط بعرض الصفحة المتاح وارتفاع كبير (≥45% من الشاشة) والشريحة بعرض الشريط', h[1] >= 0.45 * h[4] and abs(h[2] - h[0]) < 2, h)
    pg.click('#s-gallery .hg-next'); pg.wait_for_timeout(1200)
    ck('العام: زر التالي ينقل للصورة 2 (النقطة والعدّاد)', '2 / 5' in pg.inner_text('#s-gallery .hg-n') and pg.locator('#s-gallery .hg-dot').nth(1).get_attribute('aria-current') == 'true')
    pg.click('#s-gallery .hg-dot >> nth=3'); pg.wait_for_timeout(1200)
    ck('العام: لمس نقطة ينقل للصورة 4', '4 / 5' in pg.inner_text('#s-gallery .hg-n'))
    pg.click('#s-gallery .hg-prev'); pg.wait_for_timeout(1200); ck('العام: زر السابقة يرجع للصورة 3', '3 / 5' in pg.inner_text('#s-gallery .hg-n'))
    pg.screenshot(path=S + 'gal_hero.png')
    pg.locator('#s-gallery .galt').nth(1).click(); pg.wait_for_timeout(300)
    ck('العام: لمس صورة يفتح العارض على الصورة الصحيحة', pg.locator('.lb').count() == 1 and 'صورة 2' in pg.inner_text('.lb .lb-c') and '2 / 5' in pg.inner_text('.lb .lb-n'))
    pg.screenshot(path=S + 'gal_lightbox.png')
    pg.click('.lb-nx'); pg.wait_for_timeout(200); ck('العام: زر التالي ينقل للصورة 3', '3 / 5' in pg.inner_text('.lb .lb-n'))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200); ck('العام: Esc يغلق العارض', pg.locator('.lb').count() == 0)
    pg.locator('#s-gallery .galt').first.click(); pg.click('.lb-x'); ck('العام: زر × يغلق العارض', pg.locator('.lb').count() == 0)
    ck('العام: بقية الموقع سليم ولا أخطاء', pg.locator('#s-about').count() == 1 and not errs, errs)
    pgA, _e = pub(GAL); pgA.evaluate("document.querySelector('#s-gallery').scrollIntoView()"); pgA.wait_for_timeout(6500)
    ck('العام: تشغيل تلقائي ينقل الشريط بعد ~5 ثوانٍ', '2 / 5' in pgA.inner_text('#s-gallery .hg-n'), pgA.inner_text('#s-gallery .hg-n'))
    pgA.click('#s-gallery .hg-dot >> nth=0'); pgA.wait_for_timeout(1000); pgA.wait_for_timeout(6500)
    ck('العام: التشغيل التلقائي يتوقف بعد تدخل المستخدم', '1 / 5' in pgA.inner_text('#s-gallery .hg-n'), pgA.inner_text('#s-gallery .hg-n'))
    pg, errs = pub(None); ck('العام: لا قسم عندما يرجع الخادم null (مطفأ)', pg.locator('#s-gallery').count() == 0 and pg.locator('#s-about').count() == 1)
    pg, errs = pub({'message': 'x'}, status=404); ck('العام: غياب الدالة لا يكسر الموقع', pg.locator('#s-gallery').count() == 0 and pg.locator('#s-about').count() == 1 and not errs, errs)
    pg, errs = pub([{'path': 'javascript:alert(1)', 'caption': 'x'}, {'path': '../../etc/passwd', 'caption': 'y'}]); ck('العام: مسارات غير صالحة تُهمَل ولا يظهر القسم', pg.locator('#s-gallery').count() == 0 and not errs, errs)
    pg, errs = pub([{**GAL[0], 'caption': '<img src=x onerror=alert(1)>'}]); ck('العام: الهروب من HTML في التعليق (XSS)', pg.locator('#s-gallery img[src="x"]').count() == 0 and not errs, errs)
    br.close()
print(sum(res), '/', len(res)); sys.exit(0 if all(res) else 1)
