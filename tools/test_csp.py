#!/usr/bin/env python3
"""اختبار محلي لـ vercel.json: الترويسات (CSP) وإعادة التوجيه للمجلدات الداخلية. بلا شبكة خارجية.
يشغّل خادمًا محليًا يطبّق قواعد vercel.json نفسها (محاكاة مبسّطة لمطابقة المسارات، لا Vercel الحقيقي)، ثم يتصفح الموقع واللوحة بكل المستخدمين
والمسارات وبعرضين، ويفشل عند أي مخالفة securitypolicyviolation أو خطأ وحدة تحكم. الاستعمال: python3 tools/test_csp.py"""
import sys, re, json, http.server, threading, functools, pathlib, urllib.request
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
CFG = json.loads((ROOT / 'vercel.json').read_text(encoding='utf-8'))
res = []
def ok(name, cond, info=''):
    res.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else ' | ' + str(info)))
def match(src, path):
    return bool(re.match('^' + src + '$', path)) or bool(re.match('^' + src + '$', path.rstrip('/')))

class H(http.server.SimpleHTTPRequestHandler):
    def _apply(self):
        p = self.path.split('?')[0].split('#')[0]
        for r in CFG.get('redirects', []):
            if match(r['source'], p):
                self.send_response(307); self.send_header('Location', r['destination']); self.end_headers(); return True
        return False
    def end_headers(self):
        p = self.path.split('?')[0]
        for h in CFG.get('headers', []):
            if match(h['source'], p):
                for kv in h['headers']: self.send_header(kv['key'], kv['value'])
        super().end_headers()
    def do_GET(self):
        if not self._apply(): super().do_GET()
    def log_message(self, *a): pass

class Srv(http.server.ThreadingHTTPServer):
    def handle_error(self, request, client_address): pass  # تجاهل انقطاع الاتصال عند إلغاء التصفح

srv = Srv(('127.0.0.1', 0), functools.partial(H, directory=str(ROOT))); B = f'http://127.0.0.1:{srv.server_port}'
threading.Thread(target=srv.serve_forever, daemon=True).start()

class NoRedir(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
op = urllib.request.build_opener(NoRedir)
def get(path):
    try: r = op.open(B + path); return r.status, dict(r.headers)
    except urllib.error.HTTPError as e: return e.code, dict(e.headers)

# ---- 1) ترويسات التطبيق ----
CSP = next(kv['value'] for h in CFG['headers'] for kv in h['headers'] if kv['key'] == 'Content-Security-Policy')
for d in ["default-src 'self'", "script-src 'self'", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'"]: ok('CSP يحوي ' + d, d in CSP)
ok("CSP بلا 'unsafe-eval' ولا 'unsafe-inline' في script-src/style-src", not re.search(r"(script-src|style-src)\s[^;]*'unsafe-(eval|inline)'", CSP))
ok("CSP: 'unsafe-inline' محصور في style-src-attr", "style-src-attr 'unsafe-inline'" in CSP)
ok('CSP بلا أي نطاق خارجي (http/https/wss)', not re.search(r'https?:|wss?:|\*', CSP))
for path in ['/', '/admin/', '/site/js/site.js', '/site/css/site.css', '/admin/js/app.js', '/data/public.json', '/assets/logo.png']:
    st, h = get(path); h = {k.lower(): v for k, v in h.items()}
    ok(f'{path}: 200 وفيه CSP وnosniff وno-referrer', st == 200 and h.get('content-security-policy') == CSP and h.get('x-content-type-options') == 'nosniff' and h.get('referrer-policy') == 'no-referrer', (st, list(h)))
st, h = get('/admin/'); h = {k.lower(): v for k, v in h.items()}
ok('/admin/: noindex وno-store ما زالا مضبوطين', 'noindex' in h.get('x-robots-tag', '') and h.get('cache-control') == 'no-store')

# ---- 2) حجب المجلدات الداخلية (محاكاة قواعد vercel.json؛ يلزم تأكيد سلوك Vercel الفعلي على معاينة) ----
for d in ['mauritanian-team-prototype', 'supabase-review', 'verification', 'phase1-results', 'phase2a-results', 'tools', 'docs']:
    for path in [f'/{d}', f'/{d}/', f'/{d}/x/y.html']:
        st, h = get(path); ok(f'{path} يُعاد توجيهه إلى /', st in (301, 302, 307, 308) and {k.lower(): v for k, v in h.items()}.get('location') == '/', (st, h.get('Location')))
for path in ['/', '/admin/', '/site/js/site.js', '/admin/js/store.js', '/assets/logo.png', '/data/public.json']:
    ok(f'{path} لا يُعاد توجيهه', get(path)[0] == 200)
ok('الملفات الداخلية موجودة على القرص (لم تُحذف)', all((ROOT / d).is_dir() for d in ['mauritanian-team-prototype', 'supabase-review', 'verification', 'phase1-results', 'phase2a-results', 'tools', 'docs']))

# ---- 3) المتصفح: لا مخالفات CSP في الموقع واللوحة ----
viol, errs = [], []
INIT = "window.__v=[];document.addEventListener('securitypolicyviolation',e=>window.__v.push(e.violatedDirective+' | '+e.blockedURI+' | '+(e.sample||'')))"
routes = ['dash', 'players', 'matches', 'stats', 'pitch', 'coach', 'staff', 'users', 'roles', 'finance', 'audit', 'site', 'settings', 'player/p1', 'staff/s1', 'match/m1']
with sync_playwright() as p:
    br = p.chromium.launch()
    for w, h in ((1366, 800), (375, 740)):
        pg = br.new_page(viewport={'width': w, 'height': h}); pg.add_init_script(INIT)
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
        pg.goto(B + '/'); pg.wait_for_timeout(500)
        ok(f'[{w}] الموقع العام يعرض محتوى', pg.evaluate("document.querySelectorAll('#sv > *').length") > 0 and 'جارٍ التحميل' not in pg.inner_text('#sv') and pg.evaluate("document.querySelectorAll('#snav a').length") > 0)
        viol += [(w, '/', v) for v in pg.evaluate('window.__v')]
        pg.goto(B + '/admin/'); pg.wait_for_timeout(300)
        users = pg.eval_on_selector_all('#userSel option', 'o=>o.map(x=>x.value)'); filled = 0
        for u in users:
            pg.select_option('#userSel', u)
            for r in routes:
                pg.goto(B + '/admin/#/' + r); pg.wait_for_timeout(50)
                if pg.eval_on_selector('#userSel', 'e=>e.value') != u: pg.select_option('#userSel', u)
                filled += 1 if pg.evaluate("document.querySelector('#view').innerText.trim().length") > 0 else 0
            viol += [(w, 'admin:' + u, v) for v in pg.evaluate('window.__v')]; pg.evaluate('window.__v.length=0')
        ok(f'[{w}] اللوحة: {len(users)} مستخدمين × {len(routes)} مسارًا كلها تعرض محتوى', filled == len(users) * len(routes), filled)
        # اختبار سلبي: سكربت مضمّن يجب أن يُحجب فعلًا (يثبت أن السياسة مفعّلة)
        pg.goto(B + '/'); pg.evaluate("(()=>{const s=document.createElement('script');s.textContent='window.__pwn=1';document.head.appendChild(s)})()"); pg.wait_for_timeout(100)
        ok(f'[{w}] اختبار سلبي: سكربت مضمّن محجوب', pg.evaluate('window.__pwn') is None and any('script-src' in v for v in pg.evaluate('window.__v')))
        pg.close()
    br.close()
ok('لا مخالفات CSP (securitypolicyviolation) في الموقع واللوحة', not viol, viol[:3])
# أخطاء الوحدة المتوقعة الوحيدة هي رسالة الحجب الناتجة عن الاختبار السلبي (سكربت مضمّن واحد لكل عرض)
ok('لا أخطاء وحدة تحكم غير متوقعة', len([e for e in errs if not ('Content Security Policy' in e and 'script-src' in e)]) == 0, [e[:120] for e in errs][:3])
print(f'\nالإجمالي: {sum(res)}/{len(res)} نجح'); sys.exit(0 if all(res) else 1)
