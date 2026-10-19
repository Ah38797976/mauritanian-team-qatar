# اختبارات محلية عبر Playwright (file:// فقط) — لا شبكة
import sys, pathlib, json
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parent.parent
URL = (root / 'index.html').as_uri() + '?dev=1'
res = []
def ok(name, cond, info=''):
    res.append((name, bool(cond), info)); print(('PASS ' if cond else 'FAIL ') + name + (' | ' + str(info) if info else ''))
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    reqs, errs = [], []
    pg.on('request', lambda r: reqs.append(r.url)); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto(URL)
    ok('RTL وlang=ar', pg.evaluate("document.documentElement.dir")=='rtl' and pg.evaluate("document.documentElement.lang")=='ar')
    routes = ['dash','players','staff','coach','matches','stats','roles','audit','settings']
    for r in routes:
        pg.goto(URL + '#/' + r); pg.wait_for_timeout(50)
        h = pg.inner_text('#view h1')
        ok('تنقل: ' + r, len(h) > 0, h)
    # بحث وتصفية
    pg.goto(URL + '#/players'); pg.fill('#q', 'سيد')
    ok('بحث بالاسم', pg.locator('#plist .pc').count() == 2, pg.locator('#plist .pc').count())  # سيد المختار + سيدي أحمد
    pg.fill('#q', ''); pg.select_option('#fp', 'حارس')
    ok('تصفية بالمركز', pg.locator('#plist .pc').count() == 2)
    pg.select_option('#fp', ''); pg.select_option('#fs', 'مصاب')
    ok('تصفية بالحالة', pg.locator('#plist .pc').count() == 1); pg.select_option('#fs', '')
    # إضافة لاعب
    pg.click('#addp'); pg.fill('[name=name]', 'لاعب تجريبي جديد'); pg.fill('[name=num]', '77'); pg.select_option('[name=pos]', 'مهاجم'); pg.click('#modal button[type=submit]')
    pg.wait_for_timeout(100)
    ok('إضافة لاعب تظهر في القائمة', pg.locator('#plist .pc', has_text='لاعب تجريبي جديد').count() == 1)
    pg.click('#addp'); pg.fill('[name=name]', 'مكرر'); pg.fill('[name=num]', '77'); pg.click('#modal button[type=submit]')
    ok('منع تكرار رقم القميص', 'مستخدم' in pg.inner_text('#err')); pg.click('#cx')
    # البطاقة والتعديل
    pg.click('#plist .pc >> text=لاعب تجريبي جديد'); pg.wait_for_timeout(50)
    ok('بطاقة اللاعب', pg.inner_text('#pn') == 'لاعب تجريبي جديد' and '#77' in pg.inner_text('#view'))
    pg.click('#edp'); pg.fill('[name=name]', 'لاعب معدّل'); pg.fill('[name=num]', '78'); pg.click('#modal button[type=submit]'); pg.wait_for_timeout(100)
    ok('تعديل اللاعب ينعكس في البطاقة', pg.inner_text('#pn') == 'لاعب معدّل' and '#78' in pg.inner_text('#view'))
    pg.goto(URL + '#/players')
    ok('اتساق: القائمة بعد التعديل', pg.locator('#plist .pc', has_text='لاعب معدّل').count() == 1 and pg.locator('#plist .pc', has_text='#78').count() == 1)
    pg.goto(URL + '#/coach')
    ok('اتساق: اللاعب المعدّل في خيارات التشكيلة', pg.locator('label', has_text='لاعب معدّل').count() == 1)
    # التشكيلة: حد 11
    n0 = pg.locator('#view [data-st]:checked').count()
    pg.locator('#view [data-st]:not(:checked):not([disabled])').first.click(); pg.wait_for_timeout(50)
    ok('التشكيلة: اختيار لاعب 11', pg.inner_text('#sc') == '11', pg.inner_text('#sc'))
    pg.evaluate("document.querySelector('[data-st=p12]').removeAttribute('disabled')")  # لاختبار الحد فقط
    pg.click('[data-st=p12]'); pg.wait_for_timeout(50)
    ok('التشكيلة: منع تجاوز 11', pg.inner_text('#sc') == '11')
    # الحضور
    pg.select_option('#ses', 'x2'); cb = pg.locator('[data-at="p4"]'); was = cb.is_checked(); cb.click(); pg.wait_for_timeout(50)
    ok('الحضور يتغير ويُسجّل', pg.locator('[data-at="p4"]').is_checked() != was)
    # حذف
    pg.goto(URL + '#/players'); pg.click('#plist .pc >> text=لاعب معدّل'); pg.once('dialog', lambda d: d.accept()); pg.click('#delp'); pg.wait_for_timeout(100)
    ok('حذف لاعب', pg.locator('#plist .pc', has_text='لاعب معدّل').count() == 0)
    # الطاقم
    pg.goto(URL + '#/staff'); pg.click('#adds'); pg.fill('[name=name]', 'عضو جديد'); pg.fill('[name=role]', 'مدلك'); pg.click('#modal button[type=submit]'); pg.wait_for_timeout(100)
    ok('إضافة عضو طاقم', 'عضو جديد' in pg.inner_text('#view'))
    # المباريات: مسؤول مباراة
    pg.select_option('#userSel', 'u5'); pg.goto(URL + '#/matches'); pg.wait_for_timeout(50)
    ok('مسؤول المباراة 1: نموذج الإحصائيات لمبارياته فقط', pg.locator('.evf').count() == 2 and pg.locator('[data-m=m1] .evf').count() == 1 and pg.locator('[data-m=m3] .evf').count() == 1 and pg.locator('[data-m=m2] .evf').count() == 0)
    pg.select_option('[data-m=m3] [name=pid]', 'p10'); pg.select_option('[data-m=m3] [name=type]', 'goal'); pg.fill('[data-m=m3] [name=min]', '12'); pg.click('[data-m=m3] .evf button'); pg.wait_for_timeout(100)
    ok('إدخال حدث', 'هدف — سيد المختار' in pg.inner_text('[data-m=m3]'))
    pg.click('[data-pl=m3]'); pg.wait_for_timeout(100)
    pg.goto(URL + '#/stats'); row = pg.locator('tr', has_text='سيد المختار').inner_text()
    ok('الإحصائيات: الأهداف محدّثة (هدف m1 + هدف m3 = 2)', row.split('\t')[2].strip() == '2', row.replace('\t', ' | '))
    pg.select_option('#userSel', 'u1'); pg.goto(URL + '#/audit')
    ok('سجل العمليات يوثق المنفّذ', 'مسؤول مباراة 1 (تجريبي)' in pg.inner_text('#view') and 'هدف — سيد المختار' in pg.inner_text('#view'))
    # الصلاحيات
    pg.select_option('#userSel', 'u5'); pg.goto(URL + '#/players')
    ok('مسؤول المباراة لا يرى ملفات اللاعبين', 'غير مصرح' in pg.inner_text('#view') and pg.locator('#plist').count() == 0)
    pg.goto(URL + '#/roles'); ok('الأدوار للمؤسس فقط', 'غير مصرح' in pg.inner_text('#view'))
    pg.select_option('#userSel', 'u1'); pg.goto(URL + '#/roles'); pg.click('[data-pm="coach|viewPlayers"]'); pg.select_option('#userSel', 'u4'); pg.goto(URL + '#/players')
    ok('تغيير صلاحية يؤثر فورًا', 'غير مصرح' in pg.inner_text('#view'))
    pg.select_option('#userSel', 'u1')
    # الإعدادات
    pg.goto(URL + '#/settings'); pg.fill('#tf [name=name]', 'فريق معدّل'); pg.click('#tf button'); pg.wait_for_timeout(100)
    ok('إعدادات الفريق تنعكس', pg.inner_text('#teamName') == 'فريق معدّل')
    # الهاتف
    pg.set_viewport_size({'width': 375, 'height': 740})
    for r in routes:
        pg.goto(URL + '#/' + r); pg.wait_for_timeout(50)
        w = pg.evaluate("[document.documentElement.scrollWidth, window.innerWidth]")
        ok('هاتف 375px بلا تمرير أفقي للصفحة: ' + r, w[0] <= w[1], w)
    # شبكة وأخطاء
    ext = [u for u in reqs if not u.startswith('file://') and not u.startswith('data:')]
    ok('لا اتصالات خارجية', not ext, ext)
    ok('لا أخطاء JS/console', not errs, errs)
    b.close()
fails = [r for r in res if not r[1]]
print(f'\nالإجمالي: {len(res)-len(fails)}/{len(res)} نجح'); json.dump(res, open(root / 'tests' / 'last_results.json', 'w'), ensure_ascii=False, indent=1)
sys.exit(1 if fails else 0)
