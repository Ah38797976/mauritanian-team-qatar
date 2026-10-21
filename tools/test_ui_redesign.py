# اختبار واجهة التصميم الجديد (Playwright محلي: خادم http على 127.0.0.1 فقط، بلا شبكة خارجية)
# التشغيل من جذر المشروع:  python3 tools/test_ui_redesign.py
import pathlib, subprocess, sys, time, re
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = 8791
B = f'http://127.0.0.1:{PORT}'
res = []
def ok(name, cond, info=''):
    res.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name + (' | ' + str(info) if info else ''))
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '-d', str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
VPS = [('هاتف 390', 390, 844), ('تابلت 768', 768, 1024), ('كمبيوتر 1366', 1366, 800)]
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        for label, w, h in VPS:
            pg = br.new_page(viewport={'width': w, 'height': h})
            reqs, errs = [], []
            pg.on('request', lambda r: reqs.append(r.url)); pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
            # ---- الموقع العام ----
            pg.goto(B + '/'); pg.wait_for_selector('#s-squad .pp'); pg.wait_for_timeout(300)
            ok(f'[{label}] الموقع: RTL وlang=ar', pg.evaluate('document.documentElement.dir') == 'rtl' and pg.evaluate('document.documentElement.lang') == 'ar')
            ok(f'[{label}] الموقع: لا تمرير أفقي', pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), pg.evaluate('document.documentElement.scrollWidth'))
            ok(f'[{label}] الموقع: لاعبو التشكيلة 10 على الملعب', pg.locator('#s-squad .field .pp').count() == 10, pg.locator('#s-squad .field .pp').count())
            ok(f'[{label}] الموقع: كل لاعب له صورة/بديل مرئي', pg.locator('#s-squad .field .pp .av svg, #s-squad .field .pp .av img').count() == 10)
            ok(f'[{label}] الموقع: أزرار اللاعبين بحجم لمس ≥44', pg.evaluate("[...document.querySelectorAll('#s-squad .pp')].every(b=>{const r=b.getBoundingClientRect();return r.width>=44&&r.height>=44})"))
            ok(f'[{label}] الموقع: روابط التنقل ظاهرة', pg.locator('#snav a').count() == 5 and pg.locator('#snav a').first.is_visible())
            pg.locator('#s-squad .field .pp').first.click(); pg.wait_for_timeout(250)
            ok(f'[{label}] البطاقة تفتح عند الضغط', pg.locator('.pmodal:not([hidden]) .pm-box').count() == 1)
            t1 = pg.inner_text('#pcard-t')
            pg.click('.pm-nav [data-go="1"]'); pg.wait_for_timeout(100)
            ok(f'[{label}] البطاقة: التالي يغيّر اللاعب', pg.inner_text('#pcard-t') != t1)
            ok(f'[{label}] البطاقة: 4 إحصاءات', pg.locator('.pm-box .ps').count() == 4)
            ok(f'[{label}] البطاقة: ضمن الشاشة', pg.evaluate("(()=>{const r=document.querySelector('.pm-box').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight+1})()"))
            txt = pg.inner_text('.pm-box')
            ok(f'[{label}] البطاقة العامة بلا هاتف/بريد', not re.search(r'@|\+\d|هاتف|بريد|phone|email', txt, re.I))
            pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
            ok(f'[{label}] Esc يغلق البطاقة', pg.locator('.pmodal:not([hidden])').count() == 0)
            html = pg.content()
            ok(f'[{label}] الموقع: لا بيانات اتصال في HTML', not re.search(r'example\.invalid|\+000|"phone"|"email"', html))
            ext = [u for u in reqs if not u.startswith(B) and not u.startswith('data:')]
            ok(f'[{label}] الموقع: لا طلبات خارجية', not ext, ext[:3])
            ok(f'[{label}] الموقع: لا أخطاء JS', not errs, errs[:2])
            pg.close()
            # ---- لوحة الإدارة ----
            pg = br.new_page(viewport={'width': w, 'height': h})
            reqs, errs = [], []
            pg.on('request', lambda r: reqs.append(r.url)); pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
            for r in ['dash', 'players', 'matches', 'stats', 'pitch', 'coach', 'staff', 'users', 'roles', 'finance', 'audit', 'site', 'settings']:
                pg.goto(B + '/admin/#/' + r); pg.wait_for_timeout(120)
                ok(f'[{label}] اللوحة {r}: يظهر عنوان', len(pg.inner_text('#view h1')) > 0)
                ok(f'[{label}] اللوحة {r}: لا تمرير أفقي للصفحة', pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), pg.evaluate('document.documentElement.scrollWidth'))
            if w <= 960:
                pg.goto(B + '/admin/#/dash'); pg.click('#menuBtn'); pg.wait_for_timeout(300)
                ok(f'[{label}] اللوحة: القائمة تُفتح على الهاتف', pg.evaluate("document.body.classList.contains('menu-open')") and pg.locator('#nav a').first.is_visible())
                pg.keyboard.press('Escape')
            else:
                ok(f'[{label}] اللوحة: القائمة الجانبية ظاهرة', pg.locator('#nav a').first.is_visible())
            # تبديل الأدوار: الصفحات الظاهرة تختلف حسب الدور (الإخفاء للعرض فقط، الحماية في Store.can)
            pg.goto(B + '/admin/#/dash')
            roles = {}
            for uid in ['u1', 'u2', 'u3', 'u4', 'u5', 'u7']:
                pg.select_option('#userSel', uid); pg.wait_for_timeout(120)
                roles[uid] = pg.locator('#nav a').count()
            ok(f'[{label}] اللوحة: الأدوار تعرض قوائم مختلفة', roles['u1'] > roles['u3'] > 0 and roles['u5'] < roles['u1'], roles)
            pg.select_option('#userSel', 'u5'); pg.goto(B + '/admin/#/users'); pg.wait_for_timeout(150)
            ok(f'[{label}] اللوحة: مسؤول المباراة يُمنع من المستخدمين', 'غير مصرح' in pg.inner_text('#view') or pg.locator('#view h1').inner_text() != 'المستخدمون والأدوار (تجريبي)')
            ext = [u for u in reqs if not u.startswith(B) and not u.startswith('data:')]
            ok(f'[{label}] اللوحة: لا طلبات خارجية', not ext, ext[:3])
            ok(f'[{label}] اللوحة: لا أخطاء JS', not errs, errs[:2])
            pg.close()
        br.close()
finally:
    srv.terminate()
print(f'\nالنتيجة: {sum(res)}/{len(res)}')
sys.exit(0 if all(res) else 1)
