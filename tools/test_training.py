# التدريب القادم (0022): إدارة (تفاصيل الحصة، تعديل، ردود اللاعبين، زر الاستدعاء، الرجوع للاستعلام القديم) + الموقع العام (قسم التدريب).
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
    ck('ردود اللاعبين: حاضر/معتذر/لم يرد', all(x in g.inner_text('#rsvp') for x in ('حاضر (1)', 'معتذر (1)', 'لم يردّ (1)', 'لاعب ٣')), g.inner_text('#rsvp'))
    g.click('#edses'); g.wait_for_timeout(300)
    ck('نموذج التعديل فيه الوقت والملعب والخريطة', all(g.locator('input[name="%s"]' % n).count() == 1 for n in ('time', 'venue', 'map')))
    g.fill('input[name="time"]', '21:30'); g.fill('input[name="venue"]', 'ملعب جديد'); g.click('dialog#modal form button:not(.sec)'); g.wait_for_timeout(600)
    sv = g.evaluate("window.__mock.calls.filter(c => c.name === 'rpc_save_session').map(c => c.args.s)")
    ck('الحفظ يرسل id وtime وvenue وmap', sv and sv[-1].get('id') == 'ts1' and sv[-1].get('time') == '21:30' and sv[-1].get('venue') == 'ملعب جديد' and 'map' in sv[-1], sv)
    g.click('#callup'); g.wait_for_timeout(600)
    inv = g.evaluate("window.__mock.invokes")
    ck('زر الاستدعاء يرسل تنبيهًا برابط قسم التدريب', inv and inv[-1]['body']['url'] == '/#s-training' and inv[-1]['body']['title'] == 'استدعاء للتدريب' and '8:00' in inv[-1]['body']['body'], inv)
    ck('لا أخطاء JS (إدارة)', not e, e)
    g2, e2 = adm({'noTrainExt': True})
    ck('قبل 0022: الصفحة تعمل ولا تفاصيل ولا ردود ولا استدعاء', g2.locator('#tinfo').count() == 0 and g2.locator('#rsvp').count() == 0 and g2.locator('#callup').count() == 0 and g2.locator('#edses').count() == 0 and not e2, e2)
    g3, e3 = adm({})   # الحصة الافتراضية ماضية: لا زر استدعاء
    ck('حصة ماضية: لا زر استدعاء', g3.locator('#callup').count() == 0 and g3.locator('#rsvp').count() == 1)

    # --- الموقع العام ---
    SITE = {'team': {'name': 'فريق', 'city': 'الدوحة', 'color': '#0b6b3a'}, 'about': 'نبذة', 'announcement': '', 'sections': {}}
    TR = {'id': '11111111-1111-4111-8111-111111111111', 'title': '<b>تدريب</b>', 'date': '2999-12-10', 'time': '20:00', 'venue': 'ملعب <i>س</i>', 'map': 'https://maps.app.goo.gl/abc', 'yes': 5, 'no': 2, 'total': 22, 'me': None}
    state = {'tr': TR, 'rsvp': [], 'fail': False}
    def pubpage():
        c = br.new_context(**p.devices['iPhone 13']); g = c.new_page(); e = []; g.on('pageerror', lambda x: e.append(str(x)))
        g.route('**/rest/v1/rpc/rpc_public_site', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SITE)))
        for f in ('rpc_public_developer', 'rpc_public_gallery'): g.route('**/rest/v1/rpc/' + f, lambda r: r.fulfill(status=200, content_type='application/json', body='null'))
        g.route('**/rest/v1/rpc/rpc_push_*', lambda r: r.fulfill(status=200, content_type='application/json', body='""'))
        def trn(r):
            body = json.loads(r.request.post_data or '{}')
            if state['fail']: return r.fulfill(status=404, content_type='application/json', body='{}')
            t = dict(state['tr']); code = body.get('p_code')
            if code == 'ABCDEFGH': t['me'] = {'name': 'محمد الأمين', 'status': state.get('mystatus')}
            r.fulfill(status=200, content_type='application/json', body=json.dumps(t))
        g.route('**/rest/v1/rpc/rpc_public_training', trn)
        def rs(r):
            state['rsvp'].append(json.loads(r.request.post_data)); state['mystatus'] = state['rsvp'][-1]['p']['status']; r.fulfill(status=200, content_type='application/json', body='""')
        g.route('**/rest/v1/rpc/rpc_training_rsvp', rs)
        return g, e
    g, e = pubpage(); g.goto(B + '/index.html'); g.wait_for_timeout(1500)
    ck('بطاقة قسم التدريب في الرئيسية', 'التدريب' in g.inner_text('.tiles') and '5 حاضر' in g.inner_text('.tiles'), g.inner_text('.tiles'))
    g.goto(B + '/index.html#s-training'); g.wait_for_timeout(1200)
    txt = g.inner_text('#s-training')
    ck('القسم: العنوان والوقت والملعب والأعداد', all(x in txt for x in ('8:00 م', 'ملعب <i>س</i>', '<b>تدريب</b>', '5 حاضر', '2 معتذر', 'من 22')), txt)
    ck('لا حقن HTML', g.locator('#s-training .trn b:has-text("تدريب") i, #s-training .trn-t b, #s-training .vn i').count() == 0)
    ck('رابط الخريطة آمن', g.get_attribute('#s-training .tr-map', 'rel') == 'noopener noreferrer' and g.get_attribute('#s-training .tr-map', 'href') == 'https://maps.app.goo.gl/abc')
    ck('بلا رمز: حقل الرمز ظاهر ولا أزرار رد', g.locator('#trcode').count() == 1 and g.locator('[data-rsvp]').count() == 0)
    g.fill('#trcode', 'BADCODE1'); g.click('#trgo'); g.wait_for_timeout(500)
    ck('رمز خاطئ: رسالة ولا يُحفظ', 'غير صحيح' in g.inner_text('.tr-msg') and g.evaluate("localStorage.getItem('pushcode')") is None)
    g.fill('#trcode', 'abcdefgh'); g.click('#trgo'); g.wait_for_timeout(1200)
    ck('رمز صحيح: يظهر الاسم وأزرار الرد ويُحفظ', 'محمد الأمين' in g.inner_text('#s-training') and g.locator('[data-rsvp]').count() == 2 and g.evaluate("localStorage.getItem('pushcode')") == 'ABCDEFGH', g.inner_text('#s-training')[:200])
    ck('بقي القسم مفتوحًا بعد التحديث', g.evaluate("location.hash") == '#s-training' and g.locator('#s-training.cur').count() == 1)
    g.click('[data-rsvp="yes"]'); g.wait_for_timeout(1200)
    ck('الرد يُرسل الرمز والحالة والحصة', state['rsvp'] and state['rsvp'][-1]['p'] == {'code': 'ABCDEFGH', 'status': 'yes', 'session': TR['id']}, state['rsvp'])
    ck('الزر المختار مميّز وتظهر رسالة التأكيد', g.locator('[data-rsvp="yes"].on').count() == 1 and 'تم تسجيل ردّك' in g.inner_text('#s-training'))
    ck('لا أخطاء JS (موقع)', not e, e)
    # رابط خريطة غير آمن + فشل الدالة (قبل 0022)
    state['tr'] = dict(TR, map='javascript:alert(1)'); g2, e2 = pubpage(); g2.goto(B + '/index.html#s-training'); g2.wait_for_timeout(1200)
    ck('رابط javascript: لا يُعرض', g2.locator('.tr-map').count() == 0)
    state['fail'] = True; g3, e3 = pubpage(); g3.goto(B + '/index.html'); g3.wait_for_timeout(1200)
    ck('قبل 0022: لا قسم تدريب والموقع سليم', g3.locator('#s-training').count() == 0 and 'عن الفريق' in g3.inner_text('.tiles') and not e3, e3)
    br.close()
print('%d/%d' % (sum(res), len(res)))
