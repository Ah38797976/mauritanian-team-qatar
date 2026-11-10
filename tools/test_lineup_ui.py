# اختبار مركز المدرب (0014) على Playwright محلي: خادم http على 127.0.0.1 فقط، وعميل Supabase وهمي (tools/fixtures/mock_supabase_lineup.js). لا شبكة ولا Supabase.
# التشغيل من جذر المشروع:  python3 tools/test_lineup_ui.py [مجلد_اللقطات]
import pathlib, subprocess, sys, time, json, re
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path('/tmp/lineup_shots'); SHOTS.mkdir(parents=True, exist_ok=True)
PORT = 8793; B = f'http://127.0.0.1:{PORT}'
MOCK = (ROOT / 'tools/fixtures/mock_supabase_lineup.js').read_text(encoding='utf-8')
res = []
def ok(name, cond, info=''):
    res.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name + (' | ' + str(info) if info else ''))
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '-d', str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
ALL_PERMS = ['viewPlayers', 'lineup', 'attendance', 'viewStaff']

def mk(br, p, init=None, mobile=True):
    kw = dict(p.devices['iPhone 13']) if mobile else dict(viewport={'width': 1280, 'height': 900})
    ctx = br.new_context(**kw)
    ctx.route('**/vendor/supabase.min.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=MOCK))
    ctx.add_init_script('window.__mockInit = ' + json.dumps(init or {}) + ';')
    pg = ctx.new_page(); pg.errs = []; pg.reqs = []
    pg.on('pageerror', lambda e: pg.errs.append(str(e))); pg.on('console', lambda m: pg.errs.append(m.text) if m.type == 'error' else None)
    pg.on('request', lambda r: pg.reqs.append(r.url))
    return ctx, pg
def open_(pg, hash_='#/pitch'):
    pg.goto(B + '/admin/live/index.html' + hash_); pg.wait_for_selector('#shell:not([hidden])'); pg.wait_for_selector('[data-coach], .field', timeout=5000); pg.wait_for_timeout(150)
def calls(pg, name=None): return [c for c in pg.evaluate('window.__mock.calls') if name is None or c['name'] == name]
def center(pg, sel):
    b = pg.locator(sel).first.bounding_box(); return b['x'] + b['width'] / 2, b['y'] + b['height'] / 2
def fit(pg, a, b):
    # يمرّر الصفحة بحيث يظهر المصدر والهدف معًا (نافذة iPhone قصيرة)؛ إن لم يتسع الاثنان معًا نترك التمرير التلقائي أثناء السحب يتكفل بالباقي
    pg.evaluate("([a,b])=>{const ys=[a,b].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return r.top+scrollY});scrollTo(0,Math.max(0,Math.min(...ys)-90))}", [a, b]); pg.wait_for_timeout(80)
def drag(pg, src, dst, shot=None):
    fit(pg, src, dst); x1, y1 = center(pg, src); x2, y2 = center(pg, dst)
    pg.mouse.move(x1, y1); pg.mouse.down(); pg.mouse.move(x1 + 12, y1 + 12, steps=3); pg.mouse.move(x2, y2, steps=8)
    if shot: pg.screenshot(path=str(SHOTS / shot))
    pg.mouse.up(); pg.wait_for_timeout(250)
def toast(pg): return pg.inner_text('#toast')
def slot_of(pg, pid): return pg.evaluate("(id)=>{const t=document.querySelector(`.sl [data-pid='${id}']`);return t?+t.closest('.sl').dataset.slot:null}", pid)
def on_bench(pg, pid): return pg.locator(f'[data-bench] [data-pid="{pid}"]').count() == 1
def shot(pg, name): pg.screenshot(path=str(SHOTS / name), full_page=True)

try:
    with sync_playwright() as p:
        br = p.chromium.launch()

        # ===== 1) 0014 مُطبَّق: الواجهة الجديدة =====
        ctx, pg = mk(br, p); open_(pg)
        ok('v2: ملعب بخانات (.field.fx) و11 خانة', pg.locator('.field.fx').count() == 1 and pg.locator('.field.fx .sl').count() == 11)
        ok('v2: 12 زر خطة', pg.locator('[data-fm]').count() == 12 and pg.locator('[data-fm].on').inner_text().strip() == '4-4-2')
        ok('v2: 11 أساسيًا على الملعب والاحتياط 5', pg.locator('.sl .tk').count() == 11 and pg.locator('[data-bench] .tk').count() == 5)
        ok('v2: شارة القائد على مدافع ١ فقط', pg.locator('.cb').count() == 1 and pg.locator('.sl:has([data-pid="d1"]) .cb').count() == 1)
        ok('v2: الحارس بالخانة 1 (أسفل الملعب)', slot_of(pg, 'gk1') == 1)
        ok('v2: لا تمرير أفقي على iPhone', pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
        ok('v2: أهداف اللمس ≥44px', pg.evaluate("[...document.querySelectorAll('.tk,.ph,.fmbar button')].every(b=>{const r=b.getBoundingClientRect();return r.width>=44&&r.height>=44})"))
        ok('v2: اتجاه RTL', pg.evaluate('document.documentElement.dir') == 'rtl')
        shot(pg, '01_pitch_442_iphone.png')
        # قراءة الأعمدة الجديدة وجدول lineups
        reads = pg.evaluate('window.__mock.reads')
        ok('v2: قراءة lineup_starters بالأعمدة الجديدة وlineups.formation', any(r['t'] == 'lineup_starters' and 'is_captain' in r['cols'] for r in reads) and any(r['t'] == 'lineups' for r in reads))

        # ===== 2) النقل باللمس: اختر ثم اضغط الخانة =====
        pg.locator('[data-bench] [data-pid="d5"]').click(); pg.wait_for_timeout(100)
        ok('اختيار لاعب احتياط يُظهر شريط الإجراءات والخانات الصالحة', pg.locator('.selbar').count() == 1 and pg.locator('.sl.tgt').count() > 0)
        shot(pg, '02_selected_bench_player.png')
        # d5 (مدافع) يدخل خانة مدافع مشغولة (3): يخرج d2 إلى الاحتياط
        pg.locator('.sl[data-slot="3"]').click(); pg.wait_for_timeout(300)
        c = calls(pg, 'rpc_set_lineup')
        ok('نقل: استُدعي rpc_set_lineup بمعامل p', len(c) == 1 and 'p' in c[0]['args'] and set(c[0]['args']['p'].keys()) == {'formation', 'slots'}, c[:1])
        ok('نقل: d5 صار بالخانة 3 وd2 بالاحتياط (بعد تأكيد الخادم)', slot_of(pg, 'd5') == 3 and on_bench(pg, 'd2'))
        ok('نقل: رسالة النجاح بعد التأكيد', 'تم حفظ التشكيلة' in toast(pg))
        ok('نقل: القائد محفوظ (d1)', pg.locator('.sl:has([data-pid="d1"]) .cb').count() == 1)

        # ===== 3) السحب والإفلات (مؤشر) =====
        n0 = len(calls(pg, 'rpc_set_lineup'))
        drag(pg, '[data-bench] [data-pid="m6"]', '.sl[data-slot="7"]', '03_dragging_over_slot.png')
        ok('سحب: m6 من الاحتياط إلى خانة وسط (7) ينفَّذ', len(calls(pg, 'rpc_set_lineup')) == n0 + 1 and slot_of(pg, 'm6') == 7 and on_bench(pg, 'm2'))
        # تبديل بين خانتين: d1 (2) ↔ d3 (4)
        n0 = len(calls(pg, 'rpc_set_lineup')); s1, s2 = slot_of(pg, 'd1'), slot_of(pg, 'd3')
        drag(pg, f'.sl[data-slot="{s1}"] .tk', f'.sl[data-slot="{s2}"]')
        ok('تبديل: d1 وd3 تبادلا الخانتين', len(calls(pg, 'rpc_set_lineup')) == n0 + 1 and slot_of(pg, 'd1') == s2 and slot_of(pg, 'd3') == s1)
        # إخراج إلى الاحتياط بالسحب
        n0 = len(calls(pg, 'rpc_set_lineup'))
        pg.evaluate('scrollTo(0,0)'); fx, fy = center(pg, '.sl .tk[data-pid="f1"]')
        pg.mouse.move(fx, fy); pg.mouse.down(); pg.mouse.move(fx + 12, fy + 40, steps=3); pg.mouse.move(195, pg.evaluate('innerHeight') - 20, steps=6)
        pg.wait_for_timeout(1500)   # التمرير التلقائي يقرّب الاحتياط
        bx, by = center(pg, '[data-bench] .tk'); pg.mouse.move(bx, by, steps=6); pg.mouse.up(); pg.wait_for_timeout(400)
        ok('سحب لاعب من الملعب إلى الاحتياط (مع التمرير التلقائي)', slot_of(pg, 'f1') is None and on_bench(pg, 'f1') and len(calls(pg, 'rpc_set_lineup')) == n0 + 1)

        # ===== 4) قواعد المراكز: لا استدعاء للخادم عند خانة غير صالحة =====
        n0 = len(calls(pg))
        drag(pg, '[data-bench] [data-pid="gk2"]', '.sl[data-slot="2"]')   # حارس إلى خانة دفاع
        ok('حارس إلى خانة دفاع: مرفوض محليًا بلا استدعاء', len(calls(pg)) == n0 and 'لا يناسب' in toast(pg), toast(pg))
        drag(pg, '.sl[data-slot="3"] .tk', '.sl[data-slot="1"]')           # مدافع إلى خانة الحارس
        ok('مدافع إلى خانة الحارس: مرفوض بلا استدعاء', len(calls(pg)) == n0)
        drag(pg, '[data-bench] [data-pid="d6"]', '.sl[data-slot="3"]')     # لاعب مصاب
        ok('لاعب غير نشط: مرفوض بلا استدعاء', len(calls(pg)) == n0 and 'غير نشط' in toast(pg), toast(pg))
        # دفاع ↔ هجوم غير مسموح (لا مجاورة)
        pg.locator('[data-bench] [data-pid="d5"]').first.click() if on_bench(pg, 'd5') else None
        pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
        ctx.close()

        # ===== 5) رفض الخادم: لا نجاح مزيّف والعودة لآخر حالة صحيحة =====
        ctx, pg = mk(br, p, {'reject': 'رفض من الخادم: اختبار'}); open_(pg)
        before = pg.evaluate("[...document.querySelectorAll('.sl')].map(s=>s.dataset.slot+':'+((s.querySelector('[data-pid]')||{dataset:{}}).dataset.pid||'')).join(',')")
        drag(pg, '[data-bench] [data-pid="m6"]', '.sl[data-slot="7"]'); pg.wait_for_timeout(200)
        after = pg.evaluate("[...document.querySelectorAll('.sl')].map(s=>s.dataset.slot+':'+((s.querySelector('[data-pid]')||{dataset:{}}).dataset.pid||'')).join(',')")
        ok('رفض الخادم: تُعرض رسالة الخادم كما هي', 'رفض من الخادم: اختبار' in toast(pg), toast(pg))
        ok('رفض الخادم: لا رسالة نجاح', 'تم' not in toast(pg))
        ok('رفض الخادم: التشكيلة كما كانت تمامًا', before == after, (before, after))
        shot(pg, '05_server_rejected.png'); ctx.close()

        # ===== 6) لا نجاح قبل تأكيد الخادم (استجابة بطيئة) =====
        ctx, pg = mk(br, p, {'delay': 0}); open_(pg)
        pg.evaluate('window.__mock.delay = 900')
        pg.locator('[data-bench] [data-pid="m6"]').click(); pg.locator('.sl[data-slot="7"]').click(); pg.wait_for_timeout(250); pg.evaluate('scrollTo(0,0)')
        ok('أثناء الحفظ: «جارٍ الحفظ…» والواجهة مقفلة', 'جارٍ الحفظ' in pg.inner_text('.cstat') and pg.locator('[data-coach].busy').count() == 1)
        ok('أثناء الحفظ: لا رسالة «تم» ولا تغيّر على الملعب', 'تم' not in toast(pg) and slot_of(pg, 'm6') is None)
        shot(pg, '06_pending_save.png')
        [pg.wait_for_timeout(250) for _ in range(40) if slot_of(pg, 'm6') != 7]; pg.wait_for_timeout(200)
        ok('بعد التأكيد: التغيير والرسالة', slot_of(pg, 'm6') == 7 and 'تم حفظ التشكيلة' in toast(pg)); ctx.close()

        # ===== 7) الخطط الأربع والقائد والحارس =====
        ctx, pg = mk(br, p); open_(pg)
        for f in ['4-3-3', '3-5-2', '4-2-3-1', '4-4-2']:
            pg.locator(f'[data-fm="{f}"]').click(); pg.wait_for_timeout(300)
            ok(f'خطة {f}: تغيّر الملعب والخادم استُدعي', pg.locator('#pitch').get_attribute('data-formation') == f and calls(pg, 'rpc_set_formation')[-1]['args'] == {'p_formation': f})
            ok(f'خطة {f}: 11 لاعبًا والحارس بالخانة 1 والقائد محفوظ', pg.locator('.sl .tk').count() == 11 and slot_of(pg, 'gk1') == 1 and pg.locator('.cb').count() == 1)
            if f != '4-4-2': shot(pg, f'07_formation_{f}.png')
        pg.locator('.sl .tk[data-pid="m1"]').click(); pg.wait_for_timeout(100)
        pg.locator('[data-act="cap"]').click(); pg.wait_for_timeout(300)
        ok('قائد: rpc_set_captain بمعامل p_player وتحول الشارة', calls(pg, 'rpc_set_captain')[-1]['args'] == {'p_player': 'm1'} and pg.locator('.sl:has([data-pid="m1"]) .cb').count() == 1 and pg.locator('.cb').count() == 1)
        pg.locator('.sl .tk[data-pid="m1"]').click(); pg.locator('[data-act="uncap"]').click(); pg.wait_for_timeout(300)
        ok('إلغاء القائد: p_player=null', calls(pg, 'rpc_set_captain')[-1]['args'] == {'p_player': None} and pg.locator('.cb').count() == 0)
        pg.locator('[data-bench] [data-pid="gk2"]').click(); pg.wait_for_timeout(100)
        shot(pg, '08_selected_goalkeeper_actions.png')
        pg.locator('[data-act="gk"]').click(); pg.wait_for_timeout(300)
        ok('حارس: rpc_set_goalkeeper بمعامل p_player وصار gk2 بالخانة 1 وgk1 بالاحتياط', calls(pg, 'rpc_set_goalkeeper')[-1]['args'] == {'p_player': 'gk2'} and slot_of(pg, 'gk2') == 1 and on_bench(pg, 'gk1'))
        ok('لا أخطاء JS', not pg.errs, pg.errs[:2]); ctx.close()

        # ===== 8) السحب باللمس الحقيقي (CDP touch على iPhone المحاكى) =====
        ctx, pg = mk(br, p); open_(pg)
        cdp = ctx.new_cdp_session(pg)
        fit(pg, '[data-bench] [data-pid="m6"]', '.sl[data-slot="7"]'); x1, y1 = center(pg, '[data-bench] [data-pid="m6"]'); x2, y2 = center(pg, '.sl[data-slot="7"]')
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x1, 'y': y1}]})
        for i in range(1, 11): cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x1 + (x2 - x1) * i / 10, 'y': y1 + (y2 - y1) * i / 10}]})
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); pg.wait_for_timeout(400)
        ok('سحب باللمس (CDP): m6 دخل الخانة 7', slot_of(pg, 'm6') == 7, calls(pg, 'rpc_set_lineup')[-1:] if calls(pg, 'rpc_set_lineup') else 'لا استدعاء'); ctx.close()

        # ===== 9) 0014 غير مُطبَّق: الواجهة القديمة كما هي =====
        ctx, pg = mk(br, p, {'v2': False}); open_(pg)
        ok('legacy: ملعب الخطوط القديم بلا .fx وبأزرار × (التشكيلة ممتلئة فلا +)', pg.locator('.field.fx').count() == 0 and pg.locator('[data-rs]').count() == 11 and pg.locator('.field .line').count() == 4)
        reads = pg.evaluate('window.__mock.reads'); ls = [r for r in reads if r['t'] == 'lineup_starters']
        ok('legacy: جرّبنا الأعمدة الجديدة أولًا ثم قرأنا player_id فقط', len(ls) >= 2 and 'slot' in ls[0]['cols'] and ls[1]['cols'] == 'player_id', ls[:2])
        ok('legacy: لا قراءة لجدول lineups ولا استدعاء دوال جديدة', not any(r['t'] == 'lineups' for r in reads) and not calls(pg))
        shot(pg, '09_legacy_pitch.png'); ctx.close()

        # ===== 10) التمييز بين غياب الأعمدة وأخطاء الصلاحيات والاتصال =====
        for label, err in [('صلاحية 42501 تذكر العمود', {'code': '42501', 'message': 'permission denied for column slot of relation lineup_starters'}),
                           ('JWT منتهٍ PGRST301', {'code': 'PGRST301', 'message': 'JWT expired'}), ('خطأ خادم 500 بلا رمز', {'message': 'Internal error'}),
                           ('42703 لعمود آخر (ليس من 0014)', {'code': '42703', 'message': 'column lineup_starters.other does not exist'})]:
            ctx, pg = mk(br, p, {'lineupReadError': err}); pg.goto(B + '/admin/live/index.html#/pitch'); pg.wait_for_selector('#shell:not([hidden])'); pg.wait_for_timeout(400)
            ok(f'خطأ قراءة [{label}]: لا نعتبره غياب 0014 (لا ملعب قديم)', pg.locator('.field').count() == 0 and pg.locator('[data-as],[data-rs]').count() == 0)
            ok(f'خطأ قراءة [{label}]: رسالة تعذّر التحميل وزر إعادة المحاولة وبلا تعديل', 'تعذّر تحميل التشكيلة' in pg.inner_text('#view') and pg.locator('#coachretry').count() == 1 and not calls(pg))
            if 'JWT' in label: shot(pg, '10_lineup_load_error.png')
            ctx.close()
        # خطأ عابر بعد نجاح سابق: لا نقلب الوضع ولا نعرض تعديلًا
        ctx, pg = mk(br, p); open_(pg)
        pg.evaluate("window.__mock.lineupReadError = {code:'PGRST301', message:'JWT expired'}"); pg.evaluate('window.TeamData.refresh()'); pg.wait_for_timeout(400)
        ok('خطأ عابر بعد نجاح: يبقى الوضع v2 مع تنبيه وتعطيل التعديل', pg.locator('.field.fx').count() == 1 and pg.locator('.note.bad').count() >= 1 and pg.locator('[data-fm]:not([disabled])').count() == 0 and pg.locator('.ph:not([disabled])').count() == 0)
        n0 = len(calls(pg)); pg.locator('[data-bench] [data-pid="m6"]').click(); pg.wait_for_timeout(100)
        ok('خطأ عابر: لا يمكن بدء نقل', len(calls(pg)) == n0 and pg.locator('.selbar').count() == 0); ctx.close()
        # دالة غير موجودة (PGRST202)
        ctx, pg = mk(br, p, {'missingRpc': True}); open_(pg)
        pg.locator('[data-fm="4-3-3"]').click(); pg.wait_for_timeout(300)
        ok('دالة غير موجودة: رسالة «غير مفعّلة على الخادم» لا «تعذّر الاتصال»', 'غير مفعّلة' in toast(pg), toast(pg)); ctx.close()

        # ===== 11) الصلاحيات: لا تجاوز من الواجهة =====
        ctx, pg = mk(br, p, {'role': 'secretary', 'perms': ['viewPlayers', 'viewStaff']}); open_(pg)
        ok('بلا lineup: أزرار الخطط معطلة والخانات الفارغة معطلة', pg.locator('[data-fm]:not([disabled])').count() == 0 and pg.locator('.ph:not([disabled])').count() == 0)
        n0 = len(calls(pg)); pg.locator('[data-bench] [data-pid="m6"]').click(); drag(pg, '.sl .tk[data-pid="m1"]', '[data-bench]'); pg.wait_for_timeout(200)
        ok('بلا lineup: لا شريط إجراءات ولا استدعاءات بالنقر أو السحب', pg.locator('[data-act]:not([data-act="clear"])').count() == 0 and len(calls(pg)) == n0)
        r = pg.evaluate("Promise.all([Store.setLineup({formation:'4-4-2',slots:[]}), Store.setFormation('4-3-3'), Store.setCaptain('d1'), Store.setGoalkeeper('gk2')])")
        ok('بلا lineup: دوال Store ترفض محليًا ولا تُرسل شيئًا', all('غير مصرح' in x for x in r) and len(calls(pg)) == n0, r); ctx.close()
        # الحضور: lineup بلا attendance
        ctx, pg = mk(br, p, {'perms': ['viewPlayers', 'lineup', 'viewStaff']}); open_(pg, '#/coach')
        ok('v2 + lineup بلا attendance: الحضور للعرض فقط', pg.locator('#addses').count() == 0 and 'لا تملك صلاحية تسجيل الحضور' in pg.inner_text('#view') or pg.locator('#addses').count() == 0); ctx.close()
        ctx, pg = mk(br, p, {'perms': ['viewPlayers', 'lineup', 'attendance']}); open_(pg, '#/coach')
        ok('v2 + attendance: زر إضافة حصة ظاهر', pg.locator('#addses').count() == 1); shot(pg, '11_coach_page.png'); ctx.close()
        ctx, pg = mk(br, p, {'v2': False, 'perms': ['viewPlayers', 'lineup']}); open_(pg, '#/coach')
        ok('legacy + lineup: الحضور يبقى متاحًا كما كان', pg.locator('#addses').count() == 1); ctx.close()
        # دور القراءة فقط يرى الملعب بلا تعديل
        ctx, pg = mk(br, p, {'role': 'secretary', 'perms': ['viewPlayers']}); open_(pg)
        shot(pg, '12_readonly_view.png'); ctx.close()

        # ===== 12) سطح المكتب =====
        ctx, pg = mk(br, p, mobile=False); open_(pg); pg.screenshot(path=str(SHOTS / '13_desktop_pitch.png'))
        ok('سطح المكتب: ملعب بنسبة صحيحة وبلا تمرير أفقي', pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1') and pg.locator('.field.fx').count() == 1)
        ext = [u for u in pg.reqs if not u.startswith(B) and not u.startswith('data:')]
        ok('لا طلبات خارجية ولا blob:', not ext and not any(u.startswith('blob:') for u in pg.reqs), ext[:3])
        ok('لا أخطاء JS/CSP على سطح المكتب', not pg.errs, pg.errs[:2]); ctx.close()

        # ===== 13) الموقع العام =====
        def public(snap):
            ctx = br.new_context(**dict(p.devices['iPhone 13']))
            ctx.route('**/rest/v1/rpc/rpc_public_site', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(snap)))
            ctx.route('**/rest/v1/rpc/rpc_public_developer', lambda r: r.fulfill(status=200, content_type='application/json', body='null'))
            ctx.route('**/rest/v1/rpc/rpc_public_gallery', lambda r: r.fulfill(status=200, content_type='application/json', body='null'))
            ctx.route('**/rest/v1/rpc/rpc_public_training', lambda r: r.fulfill(status=200, content_type='application/json', body='null'))
            pg = ctx.new_page(); pg.errs = []; pg.on('pageerror', lambda e: pg.errs.append(str(e))); pg.on('console', lambda m: pg.errs.append(m.text) if m.type == 'error' else None)
            pg.goto(B + '/#s-squad'); pg.wait_for_selector('#s-squad .pp', timeout=5000); pg.wait_for_timeout(300); return ctx, pg
        XY = json.loads(subprocess.check_output(['node', '-e', "global.window={};const s=require('fs').readFileSync('admin/live/live-coach.js','utf8');const f=new Function(s+';return window.CoachUI.XY');console.log(JSON.stringify(f()))"], cwd=ROOT).decode()) if False else None
        FM = {'4-4-2': ['gk','def','def','def','def','mid','mid','mid','mid','fwd','fwd']}
        pl = lambda i, n, pos, slot, cap=False, st=True: {'name': n, 'num': i, 'pos': pos, 'st': st, 'cap': cap, 'slot': slot}
        base_players = [pl(1, 'حارس أول', 'حارس', 1), pl(2, 'مدافع ١', 'مدافع', 2, True), pl(3, 'مدافع ٢', 'مدافع', 3), pl(4, 'مدافع ٣', 'مدافع', 4), pl(5, 'مدافع ٤', 'مدافع', 5),
                        pl(6, 'وسط ١', 'وسط', 6), pl(8, 'وسط ٢', 'وسط', 7), pl(10, 'وسط ٣', 'وسط', 8), pl(14, 'وسط ٤', 'وسط', 9), pl(9, 'مهاجم ١', 'مهاجم', 10), pl(17, 'وسط ٥', 'وسط', 11),
                        pl(12, 'حارس ثان', 'حارس', None, False, False), pl(15, 'احتياط ١', 'مدافع', None, False, False)]
        snap = {'team': {'name': 'فريق تجريبي', 'city': 'الدوحة', 'color': '#0b6b3a'}, 'about': '', 'announcement': '', 'sections': {'players': True, 'staff': False, 'matches': False, 'stats': False}, 'players': base_players, 'formation': '4-4-2'}
        ctx, pg = public(snap)
        ok('الموقع: ملعب بخانات و11 أساسيًا فقط على الملعب', pg.locator('#s-squad .field.fx .sl').count() == 11 and pg.locator('#s-squad .field .pp').count() == 11)
        ok('الموقع: شارة القائد واحدة على مدافع ١', pg.locator('#s-squad .cb').count() == 1 and pg.locator('#s-squad .sl:has(.cb) .nm').inner_text().strip() == 'مدافع ١')
        ok('الموقع: الاحتياط خارج الملعب', pg.locator('#s-squad .bench .pp').count() == 2)
        ok('الموقع: لا تقييمات ولا بيانات خاصة في HTML', not re.search(r'تقييم|rating|هاتف|بريد|@', pg.content(), re.I))
        ok('الموقع: لا تمرير أفقي', pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
        shot(pg, '14_public_pitch_442.png'); ctx.close()
        for f in ['4-3-3', '3-5-2', '4-2-3-1']:
            sl = FM = {'4-3-3': ['gk','def','def','def','def','mid','mid','mid','fwd','fwd','fwd'], '3-5-2': ['gk','def','def','def','mid','mid','mid','mid','mid','fwd','fwd'], '4-2-3-1': ['gk','def','def','def','def','mid','mid','mid','mid','mid','fwd']}[f]
            nm = {'gk': 'حارس', 'def': 'مدافع', 'mid': 'وسط', 'fwd': 'مهاجم'}
            pls = [pl(i + 1, f'لاعب {i + 1}', nm[c], i + 1, i == 1) for i, c in enumerate(sl)]
            s2 = dict(snap, players=pls, formation=f); ctx, pg = public(s2)
            ok(f'الموقع {f}: 11 خانة وقائد واحد', pg.locator('#s-squad .field.fx .sl').count() == 11 and pg.locator('#s-squad .cb').count() == 1)
            shot(pg, f'14_public_pitch_{f}.png'); ctx.close()
        # توافق رجعي: خادم قديم بلا slot/formation
        old_players = [{k: v for k, v in x.items() if k not in ('cap', 'slot')} for x in base_players]; old = {k: v for k, v in snap.items() if k != 'formation'}; old['players'] = old_players
        ctx, pg = public(old)
        ok('الموقع (خادم قديم): الرسم القديم بالخطوط بلا .fx وبلا شارة', pg.locator('#s-squad .field.fx').count() == 0 and pg.locator('#s-squad .line').count() == 4 and pg.locator('#s-squad .cb').count() == 0 and not pg.errs, pg.errs[:2])
        shot(pg, '15_public_pitch_legacy.png'); ctx.close()
        # خانات مكررة/ناقصة من الخادم: لا نرسم خانات مشوهة
        bad = dict(snap, players=[dict(x, slot=2) if x['st'] else x for x in base_players]); ctx, pg = public(bad)
        ok('الموقع: خانات مكررة تُرفض والرجوع للرسم القديم', pg.locator('#s-squad .field.fx').count() == 0 and pg.locator('#s-squad .line').count() == 4); ctx.close()
        br.close()
finally:
    srv.terminate()
print(f'\n{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
