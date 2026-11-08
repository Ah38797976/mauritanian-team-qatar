# اختبار إشعارات الدفع: لوحة الإدارة (إرسال/تأكيد/أخطاء/ميزة غير مفعّلة) + الموقع العام (حالات الزر: غير مدعوم/آيفون بلا تثبيت/محظور/اشتراك/إلغاء) + sw.js.
import json, pathlib, subprocess
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent; B = 'http://127.0.0.1:8793'
MOCK = (ROOT / 'tools/fixtures/mock_supabase_lineup.js').read_text(encoding='utf-8'); res = []
def ck(n, c, i=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else ' | ' + str(i)))
def mk(br, p, init):
    ctx = br.new_context(**p.devices['iPhone 13']); ctx.route('**/vendor/supabase.min.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=MOCK))
    ctx.add_init_script('window.__mockInit = ' + json.dumps(init) + ';'); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); return pg, errs
def wait(pg, sel, ms=15000):
    for _ in range(ms // 100):
        if pg.locator(sel).count() and pg.locator(sel).first.is_visible(): return True
        pg.wait_for_timeout(100)
    return False
F = {'role': 'founder', 'perms': ['settings']}
with sync_playwright() as p:
    br = p.chromium.launch()
    # ---- اللوحة ----
    pg, errs = mk(br, p, {**F, 'pushSubs': 7, 'pushRecent': [{'title': '<b>x</b>', 'body': 'سابق', 'at': '2026-11-01T10:00:00Z', 'sent': 5, 'failed': 1, 'by': 'أحمد'}]}); pg.goto(B + '/admin/live/index.html#/site')
    ck('اللوحة: يظهر نموذج الإرسال وعدد المشتركين 7', wait(pg, '#pf') and '7 جهازًا' in pg.inner_text('#pushadm'))
    ck('اللوحة: السجل يعرض آخر تنبيه ويهرب HTML', 'سابق' in pg.inner_text('#pushadm') and pg.locator('#pushadm li b b').count() == 0)
    pg.screenshot(path='/tmp/claude-0/-home-claude/e3db1286-6780-5356-b510-f818a7938dec/scratchpad/push_admin.png', full_page=True)
    pg.fill('#pf [name=ptitle]', 'مباراة الجمعة'); pg.fill('#pf [name=pbody]', 'ننطلق 6 مساءً'); pg.select_option('#pf [name=purl]', '/#s-matches')
    msgs = []; pg.on('dialog', lambda d: (msgs.append(d.message), d.dismiss()))
    pg.click('#pf button'); pg.wait_for_timeout(500)
    ck('اللوحة: التأكيد يذكر العدد والإلغاء لا يرسل', msgs and '7' in msgs[0] and not (pg.evaluate('window.__mock.invokes') or []), msgs)
    pg2, errs2 = mk(br, p, {**F}); pg2.goto(B + '/admin/live/index.html#/site'); wait(pg2, '#pf')
    pg2.fill('#pf [name=ptitle]', 'مباراة الجمعة'); pg2.fill('#pf [name=pbody]', 'ننطلق 6 مساءً'); pg2.select_option('#pf [name=purl]', '/#s-matches')
    pg2.once('dialog', lambda d: d.accept()); pg2.click('#pf button'); pg2.wait_for_timeout(800)
    inv = pg2.evaluate('window.__mock.invokes') or []
    ck('اللوحة: الإرسال يستدعي push-send بالعنوان والنص والرابط', len(inv) == 1 and inv[0]['n'] == 'push-send' and inv[0]['body'] == {'title': 'مباراة الجمعة', 'body': 'ننطلق 6 مساءً', 'url': '/#s-matches'}, inv)
    ck('اللوحة: رسالة النتيجة (وصل 2 / فشل 1)', 'وصل 2' in pg2.inner_text('#toast') and 'فشل 1' in pg2.inner_text('#toast'))
    ck('اللوحة: لا أخطاء JS', not errs and not errs2, errs + errs2)
    pg3, e3 = mk(br, p, {**F, 'invokeErr': 'انتظر قليلًا قبل إرسال تنبيه آخر'}); pg3.goto(B + '/admin/live/index.html#/site'); wait(pg3, '#pf')
    pg3.fill('#pf [name=ptitle]', 'a'); pg3.fill('#pf [name=pbody]', 'b'); pg3.once('dialog', lambda d: d.accept()); pg3.click('#pf button'); pg3.wait_for_timeout(800)
    ck('اللوحة: خطأ الخادم يظهر للمستخدم والزر يعود', 'انتظر قليلًا' in pg3.inner_text('#toast') and pg3.locator('#pf button').is_enabled(), pg3.inner_text('#toast'))
    pg4, e4 = mk(br, p, {**F, 'pushMissing': True}); pg4.goto(B + '/admin/live/index.html#/site'); pg4.wait_for_timeout(2500)
    ck('اللوحة (قبل 0019): رسالة «غير مفعّلة» بلا نموذج', pg4.locator('#pf').count() == 0 and 'غير مفعّلة' in pg4.inner_text('#pushadm') and not e4, e4)
    pg5, e5 = mk(br, p, {'role': 'coach', 'perms': ['lineup']}); pg5.goto(B + '/admin/live/index.html#/site'); pg5.wait_for_timeout(2000)
    ck('اللوحة: من بلا صلاحية settings لا يرى نموذج الإرسال', pg5.locator('#pf').count() == 0)
    # ---- العام ----
    SITE = {'team': {'name': 'فريق تجريبي', 'city': 'الدوحة', 'color': '#0b6b3a'}, 'about': 'نبذة', 'announcement': '', 'sections': {'players': False, 'staff': False, 'matches': False, 'stats': False, 'photos': False}}
    FAKE = """
    window.__log = {subs: [], unsub: 0, perm: 'default', ask: 0};
    const st = window.__st || {};
    const mkSub = () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'BPk', auth: 'au' } }; }, unsubscribe: async () => { window.__log.unsub++; window.__have = false; return true; } });
    if (window.__noSW) { try { delete window.PushManager; } catch (_) {} }
    if (!window.__noSW) {
      window.PushManager = function(){};
      window.Notification = { get permission() { return window.__perm || 'default'; }, requestPermission: async () => { window.__log.ask++; window.__perm = window.__grant === false ? 'denied' : 'granted'; return window.__perm; } };
      const reg = { pushManager: { getSubscription: async () => window.__have ? mkSub() : null, subscribe: async o => { window.__log.key = o.applicationServerKey.length; window.__have = true; return mkSub(); } } };
      Object.defineProperty(navigator, 'serviceWorker', { value: { register: async u => { window.__log.sw = u; return reg; }, ready: Promise.resolve(reg) }, configurable: true });
    }
    """
    def pub(pre='', ua=None, standalone=False, sub_status=200):
        ctx = br.new_context(**(p.devices['iPhone 13'] if ua else p.devices['Pixel 7']))
        ctx.add_init_script(pre + FAKE + (";Object.defineProperty(navigator,'standalone',{value:true});" if standalone else ''))
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); calls = []
        pg.route('**/rest/v1/rpc/rpc_public_site', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SITE)))
        pg.route('**/rest/v1/rpc/rpc_public_developer', lambda r: r.fulfill(status=200, content_type='application/json', body='null'))
        pg.route('**/rest/v1/rpc/rpc_public_gallery', lambda r: r.fulfill(status=200, content_type='application/json', body='null'))
        def h(r): calls.append((r.request.url.split('/')[-1], r.request.post_data)); r.fulfill(status=sub_status, content_type='application/json', body='""')
        pg.route('**/rest/v1/rpc/rpc_push_*', h)
        pg.goto(B + '/index.html'); pg.wait_for_timeout(1500); return pg, errs, calls
    IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    pg, errs, calls = pub(ua=IOS)
    ck('العام (آيفون في سفاري): رسالة «أضف إلى الشاشة الرئيسية» بلا زر', 'الشاشة الرئيسية' in pg.inner_text('#pushbox') and pg.locator('#pushbox button').count() == 0)
    pg, errs, calls = pub(pre='window.__noSW=true;')
    ck('العام (متصفح لا يدعم): الصندوق مخفي', pg.locator('#pushbox').is_hidden() and not errs, errs)
    pg, errs, calls = pub(pre='window.__perm="denied";')
    ck('العام (محظور): رسالة بلا زر', 'محظورة' in pg.inner_text('#pushbox') and pg.locator('#pushbox button').count() == 0)
    pg, errs, calls = pub()
    ck('العام: يظهر زر «تفعيل التنبيهات» ولا يُطلب إذن قبل الضغط', pg.locator('#pushbox .pb-b').inner_text() == 'تفعيل التنبيهات' and pg.evaluate('window.__log.ask') == 0)
    pg.screenshot(path='/tmp/claude-0/-home-claude/e3db1286-6780-5356-b510-f818a7938dec/scratchpad/push_public.png', full_page=True)
    pg.click('#pushbox .pb-b'); pg.wait_for_timeout(800)
    sub = [c for c in calls if c[0] == 'rpc_push_subscribe']
    body = json.loads(sub[0][1]) if sub else {}
    ck('العام: الضغط يطلب الإذن ويشترك ويرسل endpoint والمفاتيح', pg.evaluate('window.__log.ask') == 1 and body.get('p', {}).get('endpoint', '').startswith('https://fcm') and body['p']['p256dh'] == 'BPk' and pg.evaluate('window.__log.key') == 65, (calls, pg.evaluate('window.__log')))
    ck('العام: تسجيل sw.js من الجذر', pg.evaluate('window.__log.sw') == '/sw.js')
    ck('العام: الحالة «مفعّلة» مع زر إيقاف', 'مفعّلة' in pg.inner_text('#pushbox') and pg.locator('#pushbox .pb-b').inner_text() == 'إيقاف التنبيهات')
    pg.click('#pushbox .pb-b'); pg.wait_for_timeout(600)
    ck('العام: الإيقاف يلغي الاشتراك ويستدعي rpc_push_unsubscribe', pg.evaluate('window.__log.unsub') == 1 and any(c[0] == 'rpc_push_unsubscribe' for c in calls) and pg.locator('#pushbox .pb-b').inner_text() == 'تفعيل التنبيهات')
    pg, errs, calls = pub(pre='window.__grant=false;'); pg.click('#pushbox .pb-b'); pg.wait_for_timeout(600)
    ck('العام: رفض الإذن لا يرسل شيئًا للخادم', not [c for c in calls if c[0] == 'rpc_push_subscribe'] and not errs, errs)
    pg, errs, calls = pub(sub_status=500); pg.click('#pushbox .pb-b'); pg.wait_for_timeout(800)
    ck('العام: فشل الخادم يلغي الاشتراك المحلي ويعرض رسالة', pg.evaluate('window.__log.unsub') == 1 and 'تعذّر' in pg.inner_text('#pushbox') and not errs, (pg.inner_text('#pushbox'), errs))
    pg, errs, calls = pub(standalone=True, ua=IOS); ck('العام (آيفون مثبّت): يظهر زر التفعيل', pg.locator('#pushbox .pb-b').count() == 1)
    ck('العام: بقية الموقع سليم', pg.locator('#s-about').count() == 1)
    # ---- sw.js ----
    sw = (ROOT / 'sw.js').read_text(encoding='utf-8')
    ck('sw.js: بلا fetch handler ولا cache', "'fetch'" not in sw and 'caches.' not in sw)
    pg = br.new_page(); pg.goto(B + '/index.html'); pg.wait_for_timeout(300)
    out = pg.evaluate("""async () => { const src = await (await fetch('/sw.js')).text(); const shown = []; const H = {};
      const self = { addEventListener: (n, f) => { H[n] = f; }, registration: { showNotification: async (t, o) => { shown.push([t, o]); } }, skipWaiting() {}, clients: { claim() {}, matchAll: async () => [], openWindow: async u => { shown.push(['open', u]); } }, location: { origin: location.origin } };
      new Function('self', src)(self);
      const run = d => H.push({ data: { json: () => d }, waitUntil: p => p }); await run({ title: 'T', body: 'B', url: '/#s-matches' }); await run({ title: 'T2', body: 'B2', url: 'https://evil.com' });
      const nc = { notification: { close() {}, data: shown[1][1].data }, waitUntil: p => p }; await H.notificationclick(nc);
      return shown; }""")
    ck('sw.js: يعرض الإشعار بعنوانه ونصه ورابطه الآمن', out[0][0] == 'T' and out[0][1]['data']['url'] == '/#s-matches' and out[1][1]['data']['url'] == '/', out)
    ck('sw.js: النقر يفتح الرابط الآمن داخل الموقع', out[2][0] == 'open' and out[2][1].endswith('/'), out)
    br.close()
print('%d/%d' % (sum(res), len(res)))
