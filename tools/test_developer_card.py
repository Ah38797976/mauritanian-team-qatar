# اختبار بطاقة «عن مطوّر التطبيق»: لوحة الإدارة (حفظ/رفع/حذف/وضع قديم) + الموقع العام (يظهر/يختفي/لا يتأثر عند الفشل).
import json, pathlib, sys
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent; B = 'http://127.0.0.1:8793'
MOCK = (ROOT / 'tools/fixtures/mock_supabase_lineup.js').read_text(encoding='utf-8')
IMG = '/tmp/claude-0/-home-claude/e3db1286-6780-5356-b510-f818a7938dec/scratchpad/dev.png'
SHOTS = '/tmp/claude-0/-home-claude/e3db1286-6780-5356-b510-f818a7938dec/scratchpad/dev_'
res = []
def ck(n, c, i=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else ' | ' + str(i)))
def mk(br, p, init):
    ctx = br.new_context(**p.devices['iPhone 13']); ctx.route('**/vendor/supabase.min.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=MOCK))
    ctx.add_init_script('window.__mockInit = ' + json.dumps(init) + ';'); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); return ctx, pg, errs
def wait(pg, sel, ms=15000):
    for _ in range(ms // 100):
        if pg.locator(sel).count() and pg.locator(sel).first.is_visible(): return True
        pg.wait_for_timeout(100)
    return False
FOUNDER = {'role': 'founder', 'perms': ['settings', 'viewPlayers']}
with sync_playwright() as p:
    br = p.chromium.launch()
    # ---- اللوحة
    ctx, pg, errs = mk(br, p, FOUNDER); pg.goto(B + '/admin/live/index.html#/site')
    ck('اللوحة: يظهر نموذج بطاقة المطوّر', wait(pg, '#df'))
    ck('اللوحة: الصفة الافتراضية مقترحة', 'مطوّر' in pg.input_value('#df [name=title]'))
    pg.fill('#df [name=name]', 'أحمد التجريبي'); pg.fill('#df [name=bio]', 'نبذة قصيرة'); pg.check('#df [name=visible]')
    pg.set_input_files('#df [name=photo]', IMG); pg.click('#df button'); pg.wait_for_timeout(1500)
    calls = pg.evaluate('window.__mock.calls'); names = [c['name'] for c in calls]
    sv = next((c for c in calls if c['name'] == 'rpc_save_developer'), None)
    ck('اللوحة: حُفظت البيانات بالقيم الصحيحة', sv and sv['args']['s'] == {'name': 'أحمد التجريبي', 'title': 'مطوّر ومصمم التطبيق', 'bio': 'نبذة قصيرة', 'visible': True}, sv)
    up = pg.evaluate('window.__mock.uploads') or []
    ck('اللوحة: رُفعت صورة JPEG مصغّرة إلى مسار <team>/<team>/uuid.jpg', len(up) == 1 and up[0]['type'] == 'image/jpeg' and up[0]['size'] < 2097152 and up[0]['path'].startswith('t1/t1/') and up[0]['path'].endswith('.jpg'), up)
    ck('اللوحة: سُجّلت الصورة عبر RPC بعد الرفع', 'rpc_set_developer_photo' in names and names.index('rpc_set_developer_photo') > names.index('rpc_save_developer'))
    ck('اللوحة: تظهر الصورة بعد الحفظ', wait(pg, '#df .devpic img'))
    pg.screenshot(path=SHOTS + 'admin.png', full_page=True)
    pg.check('#df [name=rmphoto]'); pg.click('#df button'); pg.wait_for_timeout(1500)
    ck('اللوحة: حذف الصورة يستدعي RPC ويزيل الملف', 'rpc_delete_developer_photo' in [c['name'] for c in pg.evaluate('window.__mock.calls')] and len(pg.evaluate('window.__mock.removed') or []) == 1)
    pg.fill('#df [name=name]', ''); pg.check('#df [name=visible]') if not pg.is_checked('#df [name=visible]') else None; pg.click('#df button'); pg.wait_for_timeout(800)
    ck('اللوحة: رفض الإظهار بلا اسم (رسالة الخادم)', 'اكتب الاسم' in pg.inner_text('#toast'))
    ck('اللوحة: لا أخطاء JS', not errs, errs)
    # وضع قديم (0017 غير مطبّق)
    ctx, pg, errs = mk(br, p, {**FOUNDER, 'devMissing': True}); pg.goto(B + '/admin/live/index.html#/site'); pg.wait_for_timeout(2500)
    ck('اللوحة (قبل 0017): رسالة «غير مفعّلة» بلا نموذج وبلا أخطاء', pg.locator('#df').count() == 0 and 'غير مفعّلة' in pg.inner_text('#devbox') and not errs, errs)
    # ---- الموقع العام
    SITE = {'team': {'name': 'فريق تجريبي', 'city': 'الدوحة', 'color': '#0b6b3a'}, 'about': 'نبذة', 'announcement': '', 'sections': {'players': False, 'staff': False, 'matches': False, 'stats': False, 'photos': False}}
    DEVJ = {'name': 'أحمد التجريبي', 'title': 'مطوّر ومصمم التطبيق', 'bio': 'نبذة قصيرة عن الدور', 'photo': None}
    def pub(dev, status=200, shot=None, scheme='light'):
        ctx = br.new_context(**p.devices['iPhone 13'], color_scheme=scheme); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.route('**/rest/v1/rpc/rpc_public_site', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SITE)))
        pg.route('**/rest/v1/rpc/rpc_public_developer', lambda r: r.fulfill(status=status, content_type='application/json', body=json.dumps(dev)))
        pg.goto(B + '/index.html#s-developer'); pg.wait_for_timeout(2500)
        if shot: pg.locator('#s-developer').scroll_into_view_if_needed() if pg.locator('#s-developer').count() else None; pg.screenshot(path=SHOTS + shot, full_page=True)
        return pg, errs
    pg, errs = pub(DEVJ, shot='public.png'); ck('العام: يظهر قسم المطوّر بالاسم والصفة والنبذة', pg.locator('#s-developer .dev-n').inner_text() == 'أحمد التجريبي' and 'مطوّر' in pg.inner_text('#s-developer .dev-t') and 'نبذة قصيرة' in pg.inner_text('#s-developer'))
    ck('العام: قسم «عن الفريق» ما زال ظاهرًا ولا أخطاء', pg.locator('#s-about').count() == 1 and not errs, errs)
    pg, errs = pub(None); ck('العام: لا قسم عندما يرجع الخادم null', pg.locator('#s-developer').count() == 0 and pg.locator('#s-about').count() == 1)
    pg, errs = pub({'message': 'x'}, status=404); ck('العام: فشل/غياب الدالة لا يكسر الموقع', pg.locator('#s-developer').count() == 0 and pg.locator('#s-about').count() == 1 and not errs, errs)
    pg, errs = pub({**DEVJ, 'name': '<img src=x onerror=alert(1)>', 'bio': '<b>x</b>'}); ck('العام: الهروب من HTML (XSS)', pg.locator('#s-developer img[src="x"]').count() == 0 and '<img' in pg.inner_text('#s-developer .dev-n'))
    pg, errs = pub(DEVJ, shot='public_dark.png', scheme='dark')
    br.close()
print(sum(res), '/', len(res)); sys.exit(0 if all(res) else 1)
