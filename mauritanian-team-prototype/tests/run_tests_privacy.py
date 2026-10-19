# اختبارات الخصوصية (Task 05) — محلية عبر file:// فقط، بلا شبكة. لا تعدّل run_tests.py ولا run_tests_fixes.py.
import pathlib, json
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parent.parent
URL = (root / 'index.html').as_uri() + '?dev=1'
res = []
def ok(name, cond, info=''):
    res.append((name, bool(cond), info)); print(('PASS ' if cond else 'FAIL ') + name + (' | ' + str(info) if info else ''))
def info(m): print('INFO ' + m)
ROLE = {'u1': 'المؤسس', 'u2': 'الإدارة', 'u3': 'الأمين', 'u4': 'المدرب', 'u5': 'مسؤول1', 'u6': 'مسؤول2', 'u7': 'الأمين المالي'}
PLAYER_CONTACT_OK = {'u1', 'u2'}      # الهاتف والبريد
STAFF_PHONE_OK = {'u1', 'u2', 'u4'}   # هواتف الطاقم (المدرب: طاقم فريقه، Task 06)
PM = ['example.invalid', '+000 00 00 ']   # علامات هاتف/بريد اللاعبين الوهمية
SM = ['+000 00 11 00']                    # علامات هواتف الطاقم الوهمية
STAFF_NAMES = ['المدرب العام', 'مساعد المدرب', 'رئيس الفريق', 'أمين الصندوق (تجريبي)']
PAGES = ['dash', 'players', 'player/p1', 'player/p5', 'staff', 'coach', 'matches', 'stats', 'roles', 'audit', 'settings']
with sync_playwright() as p:
    b = p.chromium.launch()
    reqs, errs = [], []
    def fresh():
        pg = b.new_page(viewport={'width': 1280, 'height': 800})
        pg.on('request', lambda r: reqs.append(r.url)); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(URL); return pg
    def user(pg, u): pg.evaluate(f"Store.setUser('{u}')")
    def html(pg): return pg.evaluate("document.documentElement.outerHTML")
    has = lambda h, ms: any(m in h for m in ms)

    # ===== A. الواجهة: لا تسريب في HTML الظاهر والمخفي لأي دور في أي صفحة =====
    pg = fresh()
    for u in ROLE:
        user(pg, u); bad = []
        for r in PAGES:
            pg.goto(URL + '#/' + r); pg.wait_for_timeout(40); user(pg, u); pg.wait_for_timeout(20)
            h = html(pg)
            pc = has(h, PM); sc = has(h, SM)
            show_pc = u in PLAYER_CONTACT_OK and r in ('player/p1', 'player/p5')
            show_sc = u in STAFF_PHONE_OK and r == 'staff'
            if pc != show_pc: bad.append((r, 'player-contact', pc))
            if sc != show_sc: bad.append((r, 'staff-phone', sc))
        ok(f'A[{ROLE[u]}]: الهاتف/البريد يظهران فقط للمخوّلين وفي الصفحات المخصصة (HTML كامل)', not bad, bad)
    # عنصر نصي مرئي أيضًا (لا اعتماد على display:none)
    user(pg, 'u4'); pg.goto(URL + '#/staff'); pg.wait_for_timeout(50)
    ok('A: المدرب يرى أسماء الطاقم مع هواتف طاقم فريقه (Task 06) وبلا بريد', pg.locator('#view th').count() == 5 and '+000 00 11 00 01' in pg.inner_text('#view') and '@' not in pg.inner_text('#view table'))
    user(pg, 'u3'); pg.goto(URL + '#/staff'); pg.wait_for_timeout(50)
    ok('A: الأمين يرى أسماء الطاقم بلا عمود هاتف', pg.locator('#view th').count() == 4 and 'هاتف' not in pg.inner_text('#view table') and 'المدرب العام' in pg.inner_text('#view'))
    user(pg, 'u1'); pg.goto(URL + '#/staff'); pg.wait_for_timeout(50)
    ok('A: المؤسس يرى عمود الهاتف', 'هاتف' in pg.inner_text('#view table') and '+000 00 11 00 01' in pg.inner_text('#view'))
    user(pg, 'u3'); pg.goto(URL + '#/player/p1'); pg.wait_for_timeout(50)
    ok('A: الأمين يرى بطاقة اللاعب والإحصاءات بلا هاتف/بريد وبرسالة واضحة', pg.locator('#cnote').count() == 1 and 'محمد الأمين' in pg.inner_text('#pn') and pg.inner_text('#view').count('مشاركات') == 1)
    user(pg, 'u4'); pg.goto(URL + '#/player/p1'); pg.wait_for_timeout(50)
    ok('A: المدرب يرى بيانات اللاعب الرياضية (مركز/رقم/حالة/إحصاءات) بلا اتصال', '#1' in pg.inner_text('#view') and 'حارس' in pg.inner_text('#view') and pg.locator('#cnote').count() == 1)
    pg.close()

    # ===== B. مسؤول المباراة: بيانات المباراة فقط =====
    pg = fresh()
    OUT = {'u5': ['إبراهيم فال', 'خليل الداه', 'أطار', 'كيفة', 'المدرب العام'], 'u6': ['عبد الله ولد سالم', 'إبراهيم فال', 'روصو', 'المدرب العام']}
    for u, outs in OUT.items():
        user(pg, u); leaks = []
        for r in PAGES:
            pg.goto(URL + '#/' + r); pg.wait_for_timeout(40); user(pg, u); pg.wait_for_timeout(20)
            h = html(pg)
            leaks += [(r, o) for o in outs if o in h]
        ok(f'B[{ROLE[u]}]: لا أسماء/مدن لاعبين خارج مبارياته ولا طاقم في أي صفحة', not leaks, leaks)
    user(pg, 'u5'); pg.goto(URL + '#/staff'); pg.wait_for_timeout(50)
    ok('B: صفحة الطاقم غير متاحة لمسؤول المباراة', 'غير مصرح' in pg.inner_text('#view'))
    user(pg, 'u5')
    r = pg.evaluate("""()=>({pl:Store.players(),ro:Store.roster(),st:Store.staffList(),lg:Store.logs(),p5:Store.player('p5')||null,p12:Store.player('p12')||null,p1:Store.player('p1'),lk:Store.playerLinks('p5')})""")
    ok('B: Store.players/roster/staffList/logs فارغة لمسؤول المباراة', r['pl'] == [] and r['ro'] == [] and r['st'] == [] and r['lg'] == [])
    ok('B: Store.player خارج النطاق undefined؛ داخل النطاق أساسي فقط', r['p5'] is None and r['p12'] is None and set(r['p1'].keys()) == {'id', 'teamId', 'name', 'num', 'pos', 'status'}, r['p1'])
    ok('B: playerLinks خارج النطاق أصفار', r['lk'] == {'events': 0, 'matches': 0, 'att': 0})
    pg.close()

    # ===== C. الوصول المباشر عبر Store.* لكل دور (دوال القراءة) =====
    pg = fresh()
    READ = """()=>{const o={};const ids=Store.S.players.map(p=>p.id);
      o.player=ids.map(i=>Store.player(i)||null);o.players=Store.players();o.roster=Store.roster();o.staff=Store.staffList();o.logs=Store.logs();
      o.vm=Store.visibleMatches().map(m=>({id:m.id,opp:m.opp,events:m.events}));o.rows=Store.statRows().map(r=>r.p);o.top=Store.topScorers();
      o.cand=Store.S.matches.map(m=>Store.eventCandidates(m));o.links=ids.map(i=>Store.playerLinks(i));
      return o}"""
    for u in ROLE:
        user(pg, u); s = json.dumps(pg.evaluate(READ), ensure_ascii=False)
        pc, sc = has(s, PM), has(s, SM)
        ok(f'C[{ROLE[u]}]: مخرجات دوال Store للقراءة تحوي هاتف/بريد اللاعبين فقط إن خُوّل', pc == (u in PLAYER_CONTACT_OK), pc)
        ok(f'C[{ROLE[u]}]: ولا تحوي هواتف الطاقم إلا إن خُوّل', sc == (u in STAFF_PHONE_OK), sc)
    # لا مخرجات تحمل مراجع حية للاعبين (تعديل النسخة لا يغيّر الحالة)
    user(pg, 'u1'); before = pg.evaluate("JSON.stringify(Store.S.players)")
    pg.evaluate("Store.player('p1').name='X';Store.players()[0].phone='X';Store.roster()[0].name='X';Store.staffList()[0].phone='X';Store.statRows()[0].p.name='X'")
    ok('C: القراءات نسخ — تعديلها لا يغيّر الحالة', pg.evaluate("JSON.stringify(Store.S.players)") == before and 'X' not in pg.evaluate("JSON.stringify(Store.S.staff)"))
    # الدوال المعدِّلة بحقول التواصل
    pg.goto(URL); user(pg, 'u3')
    r = pg.evaluate("""()=>{const o={};const b=JSON.stringify(Store.S.players);
      o.deny1=Store.savePlayer({id:'p1',name:'محمد الأمين',num:1,pos:'حارس',status:'نشط',city:'x',phone:'+999',email:'z@z'});o.same1=JSON.stringify(Store.S.players)===b;
      o.deny2=Store.savePlayer({name:'جديد',num:50,pos:'وسط',status:'نشط',city:'c',email:'q@q'});o.same2=JSON.stringify(Store.S.players)===b;
      const ph=Store.S.players[0].phone,em=Store.S.players[0].email;
      o.ok1=Store.savePlayer({id:'p1',name:'محمد الأمين ٢',num:1,pos:'حارس',status:'نشط',city:'x'});o.kept=Store.S.players[0].phone===ph&&Store.S.players[0].email===em;
      o.ok2=Store.savePlayer({name:'جديد',num:50,pos:'وسط',status:'نشط',city:'c'});const n=Store.S.players.at(-1);o.newEmpty=n.phone===''&&n.email==='';
      o.ok3=Store.savePlayer({id:'p1',name:'محمد الأمين ٢',num:1,pos:'حارس',status:'نشط',city:'x',phone:ph,email:em});return o}""")
    ok('C: الأمين: كتابة هاتف/بريد مرفوضة بلا تغيير', r['deny1'] != '' and r['same1'] and r['deny2'] != '' and r['same2'], r)
    ok('C: الأمين: تعديل/إضافة لاعب بدون حقول تواصل ينجح ويحفظ الهاتف والبريد القديمين (والجديد فارغ)', r['ok1'] == '' and r['kept'] and r['ok2'] == '' and r['newEmpty'], r)
    ok('C: إعادة إرسال القيم نفسها (دون تغيير) لا تُرفض', r['ok3'] == '')
    pg.goto(URL); user(pg, 'u1'); pg.evaluate("Store.setPerm('secretary','staff',true)"); user(pg, 'u3')
    r = pg.evaluate("""()=>{const o={};const b=JSON.stringify(Store.S.staff);o.deny=Store.saveStaff({id:'s1',name:'المدرب العام (تجريبي)',role:'المدرب',kind:'فني',phone:'+999'});o.same=JSON.stringify(Store.S.staff)===b;
      const ph=Store.S.staff[0].phone;o.ok=Store.saveStaff({id:'s1',name:'المدرب العام ٢',role:'المدرب',kind:'فني'});o.kept=Store.S.staff[0].phone===ph;
      o.add=Store.saveStaff({name:'جديد',role:'r',kind:'فني'});o.addEmpty=Store.S.staff.at(-1).phone==='';return o}""")
    ok('C: صاحب «إدارة الطاقم» بلا «هواتف الطاقم»: كتابة الهاتف مرفوضة، وبدونه ينجح مع حفظ الهاتف القديم', r['deny'] != '' and r['same'] and r['ok'] == '' and r['kept'] and r['add'] == '' and r['addEmpty'], r)
    pg.goto(URL); user(pg, 'u2')
    r = pg.evaluate("Store.savePlayer({id:'p1',name:'م',num:1,pos:'حارس',status:'نشط',city:'x',phone:'+777',email:'n@n'})+'|'+Store.S.players[0].phone+'|'+Store.saveStaff({id:'s1',name:'م',role:'r',kind:'فني',phone:'+888'})+'|'+Store.S.staff[0].phone")
    ok('C: الإدارة (مخوّلة) تكتب الهاتف والبريد وهاتف الطاقم', r == '|+777||+888', r)
    pg.close()

    # ===== D. تغيير الصلاحيات ديناميكيًا =====
    pg = fresh(); user(pg, 'u1')
    pg.evaluate("Store.setPerm('secretary','contactPlayers',true)"); user(pg, 'u3'); pg.goto(URL + '#/player/p1'); pg.wait_for_timeout(60); user(pg, 'u3'); pg.wait_for_timeout(30)
    ok('D: منح الأمين «هاتف وبريد اللاعبين» يظهرهما', 'example.invalid' in pg.inner_text('#view') and pg.locator('#cnote').count() == 0)
    user(pg, 'u1'); pg.evaluate("Store.setPerm('secretary','contactPlayers',false)"); user(pg, 'u3'); pg.wait_for_timeout(40)
    ok('D: سحبها يخفيهما فورًا من الصفحة المفتوحة', not has(html(pg), PM))
    user(pg, 'u1'); pg.evaluate("Store.setPerm('officer','contactPlayers',true)"); user(pg, 'u5')
    s = pg.evaluate("[Store.player('p1'),Store.player('p5')||null,Store.player('p12')||null]")
    ok('D: منح مسؤول المباراة التواصل لا يوسّع نطاقه (اللاعبون خارج مبارياته تبقى مخفية)', s[0] is not None and s[0].get('phone') and s[1] is None and s[2] is None, s)
    user(pg, 'u1'); pg.evaluate("Store.setPerm('coach','viewStaff',false)"); user(pg, 'u4'); pg.goto(URL + '#/staff'); pg.wait_for_timeout(50); user(pg, 'u4')
    ok('D: سحب «مشاهدة الطاقم» من المدرب يمنع الصفحة والقراءة', 'غير مصرح' in pg.inner_text('#view') and pg.evaluate("Store.staffList().length") == 0)
    ok('D: المؤسس وحده يغيّر الصلاحيات الجديدة', pg.evaluate("(Store.setUser('u2'),Store.setPerm('coach','contactStaff',true))") != '' and pg.evaluate("(Store.setUser('u4'),Store.setPerm('coach','contactStaff',true))") != '')
    pg.close()

    # ===== E. النماذج وتبديل الدور =====
    pg = fresh(); user(pg, 'u3'); pg.goto(URL + '#/player/p1'); pg.wait_for_timeout(50)
    pg.click('#edp'); pg.wait_for_timeout(50)
    ok('E: نموذج تعديل اللاعب للأمين بلا حقلي هاتف/بريد (لا في HTML)', pg.locator('#modal [name=phone]').count() == 0 and pg.locator('#modal [name=email]').count() == 0 and not has(html(pg), PM))
    pg.fill('#modal [name=name]', 'محمد الأمين ٣'); pg.click('#modal button[type=submit]'); pg.wait_for_timeout(80)
    ok('E: حفظ النموذج ينجح ويبقي الهاتف محفوظًا (يظهر للمؤسس)', pg.inner_text('#pn') == 'محمد الأمين ٣' and pg.evaluate("Store.S.players[0].phone") == '+000 00 00 10 00')
    pg.goto(URL + '#/players'); pg.wait_for_timeout(40); pg.click('#addp'); pg.wait_for_timeout(40)
    ok('E: نموذج الإضافة للأمين بلا حقلي هاتف/بريد', pg.locator('#modal [name=phone]').count() == 0 and pg.locator('#modal [name=email]').count() == 0); pg.click('#cx')
    user(pg, 'u1'); pg.goto(URL + '#/player/p1'); pg.wait_for_timeout(50); pg.click('#edp'); pg.wait_for_timeout(50)
    ok('E: نموذج المؤسس يحوي الهاتف والبريد', pg.locator('#modal [name=phone]').count() == 1 and has(html(pg), PM))
    user(pg, 'u5'); pg.wait_for_timeout(50)
    ok('E: تبديل الدور والنموذج مفتوح يغلقه ويُفرغه (لا بقايا بيانات الدور السابق)', pg.evaluate("document.querySelector('#modal').open") is False and not has(html(pg), PM) and pg.evaluate("document.querySelector('#modal').innerHTML") == '')
    pg.goto(URL + '#/staff'); user(pg, 'u1'); pg.wait_for_timeout(40); pg.click('[data-es=s1]'); pg.wait_for_timeout(40)
    ok('E: نموذج الطاقم للمؤسس بحقل الهاتف', pg.locator('#modal [name=phone]').count() == 1); pg.click('#cx')
    user(pg, 'u1'); pg.evaluate("Store.setPerm('coach','staff',true)"); user(pg, 'u4'); pg.wait_for_timeout(40); pg.click('[data-es=s1]'); pg.wait_for_timeout(40)
    ok('E: نموذج الطاقم لمن لا يملك كتابة هواتف الطاقم بلا حقل هاتف', pg.locator('#modal [name=phone]').count() == 0 and pg.locator('#modal [name=name]').count() == 1); pg.click('#cx')
    # تبديل الدور على صفحة مفتوحة
    user(pg, 'u1'); pg.goto(URL + '#/player/p1'); pg.wait_for_timeout(50); ok('E: المؤسس على ملف اللاعب يرى الهاتف', has(html(pg), PM))
    user(pg, 'u4'); pg.wait_for_timeout(50); ok('E: التبديل إلى المدرب على الصفحة نفسها يزيل الهاتف والبريد من HTML', not has(html(pg), PM))
    pg.close()

    # ===== F. البحث لا يكشف الهاتف/البريد =====
    pg = fresh(); user(pg, 'u4'); pg.goto(URL + '#/players'); pg.wait_for_timeout(50)
    for q in ['example', '+000', 'player3@', '00 10']:
        pg.fill('#q', q); pg.wait_for_timeout(30)
        ok(f'F: البحث «{q}» لا يطابق الهاتف/البريد', pg.locator('#plist .pc').count() == 0)
    pg.close()

    # ===== G. الصلاحيات الأصلية لم تتوسع (لقطة) =====
    pg = fresh()
    perms = pg.evaluate("Store.S.perms")
    ok('G: مسؤول المباراة ما زال ["stats"] فقط', perms['officer'] == ['stats'])
    ok('G: المدرب لا يملك contactPlayers/contactStaff/staff/players (يملك contactStaffTeam فقط)', not any(m in perms['coach'] for m in ('contactPlayers', 'contactStaff', 'staff', 'players')) and 'contactStaffTeam' in perms['coach'])
    ok('G: الأمين لا يملك contact*', not any(m in perms['secretary'] for m in ('contactPlayers', 'contactStaff')))
    ok('G: الإدارة تملك contact* و viewStaff', all(m in perms['admin'] for m in ('contactPlayers', 'contactStaff', 'viewStaff')))
    # ===== H. حدود معروفة (معلومات فقط) =====
    info("Task 06: Store.S لا يُكشف إلا مع ?dev=1 (تعتمد عليه الاختبارات)، وwindow.DATA محذوف؛ انظر run_tests_task06.py")
    ok('لا اتصالات خارجية في اختبارات الخصوصية', all(u.startswith('file://') for u in reqs), [u for u in reqs if not u.startswith('file://')][:3])
    ok('لا أخطاء JS/console', not errs, errs[:3])
    b.close()
fails = [r for r in res if not r[1]]
json.dump(res, open(root / 'tests' / 'last_results_privacy.json', 'w'), ensure_ascii=False, indent=1)
print(f"\nالإجمالي: {len(res) - len(fails)}/{len(res)} نجح")
