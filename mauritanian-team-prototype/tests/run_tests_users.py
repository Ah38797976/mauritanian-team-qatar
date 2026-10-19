# اختبارات إدارة المستخدمين (محلية عبر Playwright، file:// فقط)
import pathlib
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parent.parent
URL = (root / 'index.html').as_uri() + '?dev=1'
res = []
def ok(n, c, i=''):
    res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + (' | ' + str(i) if i else ''))
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    def newpage(w=1280):
        pg = b.new_page(viewport={'width': w, 'height': 800}); pg.on('pageerror', lambda e: errs.append(str(e))); pg.goto(URL); return pg
    pg = newpage(); ev = pg.evaluate
    # المؤسس يضيف إداريًا فيظهر في قائمة المستخدم التجريبي
    ev("Store.setUser('u1')")
    ok('U1: المؤسس يضيف إداريًا', ev("Store.saveUser({name:'إداري جديد',role:'admin'})") == '' and ev("Store.S.users.some(u=>u.name==='إداري جديد'&&u.role==='admin')"))
    pg.goto(URL + '#/users'); pg.wait_for_timeout(80)
    ok('U2: صفحة المستخدمين تعرض الإداري الجديد ويظهر في قائمة التبديل', 'إداري جديد' in pg.inner_text('#view') and pg.locator('#userSel option', has_text='إداري جديد').count() == 1)
    pg.click('#addu'); pg.fill('[name=name]', 'مدرب من الواجهة'); pg.select_option('[name=role]', 'coach'); pg.click('#modal button[type=submit]'); pg.wait_for_timeout(80)
    ok('U3: الإضافة من الواجهة تعمل', ev("Store.S.users.some(u=>u.name==='مدرب من الواجهة'&&u.role==='coach')"))
    # الأمين الرياضي يدير المستخدمين واللاعبين (رقم القميص واللاعب)
    ev("Store.setUser('u3')")
    ok('U4: الأمين الرياضي يضيف مستخدمًا', ev("Store.saveUser({name:'مسؤول جديد',role:'officer'})") == '')
    ok('U5: الأمين الرياضي يضيف لاعبًا برقم ومركز', ev("Store.savePlayer({name:'لاعب جديد',num:44,pos:'وسط',city:'مدينة',status:'نشط'})") == '' and ev("Store.S.players.some(p=>p.name==='لاعب جديد'&&p.num===44)"))
    ok('U6: الأمين لا يعدّل الصلاحيات (للمؤسس فقط)', ev("Store.setPerm('coach','stats',true)") != '')
    ok('U7: لا يمكن تعديل المؤسس ولا حذفه ولا إنشاء مؤسس', ev("Store.saveUser({id:'u1',name:'x',role:'admin'})") != '' and ev("Store.delUser('u1')") != '' and ev("Store.saveUser({name:'م',role:'founder'})") != '')
    ok('U8: لا يحذف مسؤولًا مكلّفًا بمباريات', ev("Store.delUser('u5')") != '')
    ok('U9: اسم فارغ أو طويل ودور غير صالح مرفوضة', all(ev(f"Store.saveUser({x})") != '' for x in ["{name:'',role:'admin'}", "{name:'" + 'ا' * 61 + "',role:'admin'}", "{name:'س',role:'xx'}"]))
    # الأدوار الأخرى ممنوعة
    for uid in ['u2', 'u4', 'u5', 'u7']:
        ev(f"Store.setUser('{uid}')")
        before = ev("JSON.stringify(Store.S.users)")
        ok(f'U10[{uid}]: ممنوع من إدارة المستخدمين دون تغيير', ev("Store.saveUser({name:'متسلل',role:'admin'})") != '' and ev("Store.delUser('u6')") != '' and ev("JSON.stringify(Store.S.users)") == before)
    pg.close()
    pg = newpage(); pg.select_option('#userSel', 'u4'); pg.goto(URL + '#/users'); pg.wait_for_timeout(80)
    ok('U11: المدرب لا يرى زر الإضافة ولا قائمة المستخدمين', pg.locator('#addu').count() == 0 and 'غير مصرح' in pg.inner_text('#view'))
    ok('U12: المدرب لا يرى رابط المستخدمين ولا «لوحة التحكم»', 'المستخدمون' not in pg.inner_text('#nav') and 'لوحة التحكم' not in pg.inner_text('body'))
    ok('U13: لا أخطاء صفحة', not errs, errs)
    b.close()
print(f"{sum(res)}/{len(res)}")
raise SystemExit(0 if all(res) else 1)
