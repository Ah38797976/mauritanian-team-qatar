# اختبارات الإصلاحات (Task 03) — Playwright على file:// فقط، بلا شبكة.
# تشغيل: python3 tests/run_tests_fixes.py   (لا تعدّل run_tests.py الأصلي)
# ملاحظة: حمولات الحقن هنا علامات خاملة تضبط window.__xss فقط ولا تتصل بأي خدمة.
import sys, pathlib, json
from playwright.sync_api import sync_playwright

root = pathlib.Path(__file__).resolve().parent.parent
URL = (root / 'index.html').as_uri() + '?dev=1'
SHOTS = root / 'tests' / 'screenshots'; SHOTS.mkdir(exist_ok=True)
res, reqs, errs = [], [], []

def ok(name, cond, info=''):
    res.append((name, bool(cond), info)); print(('PASS ' if cond else 'FAIL ') + name + (' | ' + str(info) if info else ''))

def info(msg): print('INFO ' + msg)

ROUTES = ['dash', 'players', 'staff', 'coach', 'matches', 'stats', 'roles', 'audit', 'settings']
PAY = ['<img src=x onerror="window.__xss=1">', '<script>window.__xss=2</script>', '"><svg onload="window.__xss=3">']
PHONE_PAY = '<i onclick="window.__xss=3">'  # ≤ 30 حرفًا حتى يقبلها Store
WEIRD_ID = 'x" onfocus="window.__xss=4" autofocus="'

with sync_playwright() as p:
    b = p.chromium.launch()

    def newpage(w=1280, h=800, hash_=''):
        pg = b.new_page(viewport={'width': w, 'height': h})
        pg.on('request', lambda r: reqs.append(r.url)); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(URL + hash_); return pg

    def go(pg, r): pg.goto(URL + '#/' + r); pg.wait_for_timeout(40)
    def user(pg, uid): pg.evaluate("id=>Store.setUser(id)", uid); pg.wait_for_timeout(30)
    def snap(pg): return pg.evaluate("JSON.stringify(Store.S)")
    def view(pg): return pg.inner_text('#view')

    # ================= A. الشريط العلوي =================
    for (w, h) in [(1280, 800), (1280, 1200), (1920, 1080), (1024, 768)]:
        pg = newpage(w, h)
        for r in ['dash', 'coach', 'matches']:
            go(pg, r)
            th = pg.evaluate("document.querySelector('.top').getBoundingClientRect().height")
            ok(f'A: ارتفاع الشريط العلوي معقول {w}×{h} ({r})', th <= 90, round(th, 1))
        pg.close()
    pg = newpage(1280, 800); go(pg, 'dash')
    ok('A: المحتوى يبدأ بعد الشريط والتنبيه مباشرة (لا فراغ)', pg.evaluate("document.querySelector('nav').getBoundingClientRect().top - document.querySelector('#demoNote').getBoundingClientRect().bottom") <= 1)
    pg.screenshot(path=str(SHOTS / 'after_dash_1280x800.png')); pg.close()

    # ================= B. جدول الحضور على الهاتف =================
    pg = newpage(375, 740); go(pg, 'coach')
    pos = pg.evaluate("(()=>{const th=[...document.querySelectorAll('th')].find(x=>x.textContent==='حاضر');const r=th.getBoundingClientRect();return [r.left,r.right]})()")
    ok('B: عمود «حاضر» ظاهر كاملًا ضمن الشاشة عند 375px', pos[0] >= 0 and pos[1] <= 375, pos)
    cbpos = pg.evaluate("(()=>{const c=document.querySelector('[data-at=p4]');c.scrollIntoView();const r=c.getBoundingClientRect();return [r.left,r.right,r.width]})()")
    ok('B: مربع الحضور ظاهر وبحجم قابل للنقر', cbpos[0] >= 0 and cbpos[1] <= 375 and cbpos[2] >= 13, cbpos)
    was = pg.locator('[data-at=p4]').is_checked(); pg.locator('[data-at=p4]').click(); pg.wait_for_timeout(50)
    ok('B: تغيير الحضور على الهاتف يعمل', pg.locator('[data-at=p4]').is_checked() != was)
    ok('B: لا تمرير أفقي للصفحة في الحضور', pg.evaluate("document.documentElement.scrollWidth<=innerWidth"))
    pg.screenshot(path=str(SHOTS / 'after_coach_attendance_375x740.png'), full_page=True)
    for r in ['staff', 'coach', 'stats', 'roles', 'audit']:
        go(pg, r)
        bad = pg.evaluate("""()=>{const bad=[];document.querySelectorAll('.tw').forEach((c,i)=>{c.querySelectorAll('th').forEach(th=>{th.scrollIntoView({inline:'nearest',block:'nearest'});
          const a=th.getBoundingClientRect(),k=c.getBoundingClientRect();if(a.left<k.left-1||a.right>k.right+1)bad.push(i+':'+th.textContent)})});
          window.scrollTo(0,0);return bad}""")
        sc = pg.evaluate("document.documentElement.scrollWidth<=innerWidth")
        ok(f'B: كل أعمدة جدول «{r}» قابلة للوصول داخل الجدول نفسه والصفحة لا تتمرر أفقيًا', not bad and sc, bad)
    go(pg, 'staff')
    ok('B: الجداول العريضة تتمرر داخليًا (وليس الصفحة)', pg.evaluate("(()=>{const c=document.querySelector('.tw');return c.scrollWidth>c.clientWidth && getComputedStyle(c).overflowX==='auto'})()"))
    ok('B: حاويات الجداول قابلة للوصول بلوحة المفاتيح', pg.evaluate("[...document.querySelectorAll('.tw')].every(c=>c.tabIndex===0&&c.getAttribute('aria-label'))"))
    for uid in ['u1', 'u5']:
        user(pg, uid)
        for r in ROUTES:
            go(pg, r)
            w = pg.evaluate("[document.documentElement.scrollWidth, innerWidth]")
            ok(f'B: لا تمرير أفقي 375px ({uid}) {r}', w[0] <= w[1], w)
    pg.close()

    # ================= C. حذف لاعب واتساق البيانات =================
    pg = newpage()
    ok('C: بيانات البداية متسقة (integrity)', pg.evaluate("Store.integrity()") == [], pg.evaluate("Store.integrity()"))
    pg.evaluate("Store.savePlayer({name:'لاعب بلا أحداث',num:61,pos:'وسط',status:'نشط',city:'c',phone:'+000',email:'a@example.invalid'})")
    pid = pg.evaluate("Store.S.players.at(-1).id")
    pg.evaluate("(id)=>Store.setAtt('x1',id,true)", pid)
    r = pg.evaluate("(id)=>Store.delPlayer(id)", pid)
    ok('C: حذف لاعب قبل وجود أحداث ينجح', r == '' and pg.evaluate("(id)=>!Store.player(id)", pid), r)
    ok('C: حذف اللاعب يزيل سجلات حضوره ولا يترك يتيمًا', pg.evaluate("Store.integrity()") == [], pg.evaluate("Store.integrity()"))
    pg.evaluate("Store.savePlayer({name:'لاعب سيسجل هدفًا',num:62,pos:'مهاجم',status:'نشط',city:'c',phone:'+000',email:'a@example.invalid'})")
    pid = pg.evaluate("Store.S.players.at(-1).id")
    pg.evaluate("(id)=>Store.addEvent('m3',{pid:id,type:'goal',min:9})", pid)
    pg.evaluate("Store.setResult('m3',0,true)")
    before = snap(pg)
    r = pg.evaluate("(id)=>Store.delPlayer(id)", pid)
    ok('C: حذف لاعب لديه هدف مسجّل مرفوض برسالة واضحة', r != '' and 'إلغاء التسجيل' in r, r)
    ok('C: الرفض لا يغيّر أي بيانات (لا حذف صامت)', snap(pg) == before)
    go(pg, 'matches')
    ok('C: لا أحداث باسم فارغ في المباريات', pg.evaluate("[...document.querySelectorAll('[data-m] li')].every(li=>!/—\\s*$/.test(li.textContent.trim()))"))
    ok('C: نتيجة m3 ما زالت متسقة (1 - 0 مع هدف اللاعب)', pg.evaluate("Store.us(Store.S.matches.find(m=>m.id==='m3'))") == 1 and pg.evaluate("Store.integrity()") == [])
    for seed in ['p10', 'p11', 'p3']:
        b4 = snap(pg); r = pg.evaluate("id=>Store.delPlayer(id)", seed)
        ok(f'C: حذف {seed} (لديه أحداث/مشاركات) مرفوض دون تغيير', r != '' and snap(pg) == b4)
    ok('C: مجموع أهداف اللاعبين = مجموع أهداف نتائج المباريات المنتهية', pg.evaluate("Store.S.players.reduce((n,p)=>n+Store.stats(p.id).goals,0)") == pg.evaluate("Store.S.matches.filter(m=>m.played).reduce((n,m)=>n+Store.us(m),0)"))
    pg.close()
    # عبر الواجهة: لاعب مرتبط بأحداث
    pg = newpage(); pg.goto(URL + '#/player/p10'); pg.wait_for_timeout(60)
    ok('C: واجهة اللاعب المرتبط: لا زر حذف نهائي، يوجد إلغاء تسجيل وشرح السياسة', pg.locator('#delp').count() == 0 and pg.locator('#unregp').count() == 1 and 'لا يمكن حذف' in pg.inner_text('#dnote'))
    m1_before = pg.evaluate("[Store.us(Store.S.matches[0]), Store.S.matches[0].them]")
    pg.once('dialog', lambda d: d.accept()); pg.click('#unregp'); pg.wait_for_timeout(80)
    ok('C: إلغاء التسجيل يغيّر الحالة فقط ويبقي السجل', pg.evaluate("Store.player('p10').status") == 'غير مسجّل' and pg.evaluate("Store.integrity()") == [])
    go(pg, 'matches')
    ok('C: أحداث وأهداف المباراة تبقى باسم اللاعب بعد إلغاء التسجيل', 'هدف — سيد المختار' in pg.inner_text('[data-m=m1]') and pg.evaluate("[Store.us(Store.S.matches[0]), Store.S.matches[0].them]") == m1_before)
    ok('C: نتيجة m1 المعروضة ما زالت 2 - 1', pg.evaluate("[...document.querySelectorAll('[data-m=m1] .score .n')].map(e=>e.textContent)") == ['2', '1'])
    go(pg, 'stats'); row = pg.locator('tr', has_text='سيد المختار').inner_text()
    ok('C: الإحصائيات تحتفظ بأهداف اللاعب غير المسجّل وتوسمه', row.split('\t')[2].strip() == '1' and 'غير مسجّل' in row, row.replace('\t', ' | '))
    go(pg, 'coach')
    ok('C: غير المسجّل خارج اختيار التشكيلة والحضور', pg.locator('[data-st=p10]').count() == 0 and pg.locator('[data-at=p10]').count() == 0 and 'p10' not in pg.evaluate("Store.S.lineup.starters"))
    b4 = snap(pg)
    ok('C: لا يمكن تسجيل حدث جديد للاعب غير مسجّل', pg.evaluate("Store.addEvent('m3',{pid:'p10',type:'goal',min:5})") != '' and snap(pg) == b4)
    pg.close()

    # ================= D. تنبيه حفظ البيانات =================
    for (w, h) in [(1280, 800), (375, 740)]:
        pg = newpage(w, h); okc = True; det = []
        for r in ROUTES:
            go(pg, r)
            bx = pg.evaluate("(()=>{const e=document.querySelector('#demoNote');const r=e.getBoundingClientRect();return [r.width,r.height,r.left,r.right,e.innerText]})()")
            good = bx[0] > 0 and bx[1] > 10 and bx[2] >= -1 and bx[3] <= w + 1 and all(k in bx[4] for k in ['تجريبية', 'ذاكرة', 'تحديث', 'البيانات الأصلية'])
            okc &= good; det.append(r) if not good else None
        ok(f'D: التنبيه ظاهر وواضح في كل الصفحات عند {w}px', okc, det); pg.close()
    pg = newpage(); go(pg, 'players'); pg.click('#addp'); pg.fill('[name=name]', 'لاعب مؤقت للتحديث'); pg.fill('[name=num]', '88'); pg.click('#modal button[type=submit]'); pg.wait_for_timeout(100)
    ok('D: رسالة الحفظ تذكّر أن الحفظ مؤقت', 'الذاكرة' in pg.inner_text('#toast'), pg.inner_text('#toast'))
    ok('D: اللاعب المضاف ظاهر قبل التحديث', pg.locator('#plist .pc', has_text='لاعب مؤقت للتحديث').count() == 1)
    pg.reload(); go(pg, 'players')
    ok('D: تحديث الصفحة يعيد البيانات الأصلية فعلًا', pg.locator('#plist .pc', has_text='لاعب مؤقت للتحديث').count() == 0 and pg.locator('#plist .pc').count() == 12)
    pg.close()

    # ================= E. خصوصية مسؤول المباراة =================
    pg = newpage()
    names = pg.evaluate("Store.S.players.map(p=>p.name)")
    pg.select_option('#userSel', 'u5')
    go(pg, 'dash'); t = view(pg)
    ok('E: مسؤول المباراة لا يرى لوحة التحكم: #/dash يحوّل إلى المباريات ولا نص «لوحة التحكم» في الصفحة', pg.evaluate('location.hash') == '#/matches' and 'لوحة التحكم' not in pg.inner_text('body'), pg.evaluate('location.hash'))
    ok('E: شاشته: لا مؤشرات فريق ولا إحصائيات عامة (أسماء من مبارياته المكلّف بها قد تظهر كأحداث)', pg.locator('#topk').count() == 0 and 'نشطون' not in t and 'نسبة الحضور' not in t and 'آخر العمليات' not in t, t[:120].replace('\n', ' '))
    ok('E: تعرض مبارياته فقط (2 مكلّف بها)', 'المكلّف بها فقط' in t and pg.locator('[data-m]').count() == 2)
    go(pg, 'stats'); t = view(pg)
    ok('E: الإحصائيات: لا لاعبين من خارج مبارياته (p12 وp5)', 'خليل الداه' not in t and 'إبراهيم فال' not in t and pg.locator('.tw tr').count() == 11, pg.locator('.tw tr').count())
    row = pg.locator('tr', has_text='عثمان جالو').inner_text().split('\t')
    ok('E: إحصائيات اللاعب تُحسب من مبارياته المكلّف بها فقط (هدف m2 غير ظاهر)', row[2].strip() == '0' and row[1].strip() == '1', row)
    go(pg, 'matches')
    ok('E: المباريات: لا تظهر مباراة غير مكلّف بها ولا خصمها', pg.locator('[data-m=m2]').count() == 0 and 'اتحاد الجالية' not in view(pg) and pg.locator('[data-m]').count() == 2)
    opts1 = pg.evaluate("[...document.querySelectorAll('[data-m=m1] [name=pid] option')].map(o=>o.value).sort()")
    exp1 = pg.evaluate("[...Store.S.matches[0].players].sort()")
    ok('E: قائمة لاعبي الحدث لمباراة منتهية = لاعبو المباراة فقط', opts1 == exp1, opts1)
    opts3 = pg.evaluate("[...document.querySelectorAll('[data-m=m3] [name=pid] option')].map(o=>o.value).sort()")
    ok('E: قائمة لاعبي المباراة القادمة = التشكيلة الأساسية، دون المصاب/الموقوف', opts3 == sorted(pg.evaluate("Store.S.lineup.starters")) and 'p5' not in opts3 and 'p12' not in opts3, opts3)
    ok('E: لا خيارات للاعبين غير مصرح بهم في أي مكان', pg.locator('option[value=p12]').count() == 0 and pg.locator('option[value=p5]').count() == 0)
    go(pg, 'players'); ok('E: صفحة اللاعبين مرفوضة (دون تغيير)', 'غير مصرح' in view(pg) and pg.locator('#plist').count() == 0)
    go(pg, 'coach'); ok('E: لوحة المدرب مرفوضة', 'غير مصرح' in view(pg))
    go(pg, 'audit'); ok('E: السجل مرفوض', 'غير مصرح' in view(pg))
    b4 = snap(pg)
    r1 = pg.evaluate("Store.addEvent('m1',{pid:'p12',type:'goal',min:5})"); r2 = pg.evaluate("Store.addEvent('m2',{pid:'p11',type:'goal',min:5})")
    ok('E: Store: حدث للاعب خارج نطاق مباراته مرفوض', r1 != '' and snap(pg) == b4, r1)
    ok('E: Store: حدث في مباراة غير مكلّف بها مرفوض', r2 != '' and snap(pg) == b4, r2)
    ok('E: Store.visibleMatches/statRows مقيّدة بالنطاق', pg.evaluate("Store.visibleMatches().map(m=>m.id)") == ['m1', 'm3'] and 'p12' not in pg.evaluate("Store.statRows().map(r=>r.p.id)"))
    go(pg, 'stats'); pg.screenshot(path=str(SHOTS / 'after_officer_stats_1280x800.png')); go(pg, 'matches'); pg.screenshot(path=str(SHOTS / 'after_officer_matches_1280x800.png'))
    pg.set_viewport_size({'width': 375, 'height': 740}); go(pg, 'dash'); pg.screenshot(path=str(SHOTS / 'after_officer_dash_375x740.png'), full_page=True)
    pg.set_viewport_size({'width': 1280, 'height': 800})
    pg.select_option('#userSel', 'u6'); go(pg, 'matches')
    ok('E: مسؤول المباراة 2 يرى m2 فقط', pg.evaluate("[...document.querySelectorAll('[data-m]')].map(e=>e.dataset.m)") == ['m2'])
    ok('E: صلاحيات الدور لم تتوسع بالإصلاح', pg.evaluate("JSON.stringify(Store.S.perms.officer)") == '["stats"]')
    # عدم الانحدار: المدرب والأمين يرون الصورة الكاملة
    pg.select_option('#userSel', 'u4'); go(pg, 'stats')
    ok('E: المدرب ما زال يرى كل اللاعبين في الإحصائيات', pg.locator('.tw tr').count() == 13)
    go(pg, 'dash'); ok('E: المدرب لا يرى لوحة التحكم: #/dash يحوّل إلى صفحته في التطبيق', pg.evaluate('location.hash') == '#/coach' and 'لوحة التحكم' not in pg.inner_text('body'), pg.evaluate('location.hash'))
    pg.close()

    # ================= F. مصفوفة الصلاحيات عبر Store.* مباشرة =================
    MATRIX = """(uid)=>{
      const out={}; Store.setUser('u1');
      Store.savePlayer({name:'مؤقت للحذف',num:56,pos:'وسط',status:'نشط',city:'c',phone:'+000',email:'a@example.invalid'});
      const del=Store.S.players.at(-1).id; Store.setUser(uid);
      const att=!Store.S.att.x1.p1;
      const calls={
        savePlayer_new:()=>Store.savePlayer({name:'جديد',num:57,pos:'وسط',status:'نشط',city:'c'}),
        savePlayer_edit:()=>Store.savePlayer({id:'p1',name:'محمد الأمين المعدل',num:1,pos:'حارس',status:'نشط',city:'c'}),
        delPlayer:()=>Store.delPlayer(del),
        unregisterPlayer:()=>Store.unregisterPlayer('p2'),
        saveStaff_new:()=>Store.saveStaff({name:'طاقم',role:'r',kind:'فني',phone:'+000'}),
        delStaff:()=>Store.delStaff('s1'),
        saveMatch_new:()=>Store.saveMatch({opp:'خصم',date:'2026-11-05',home:true,officer:'u5'}),
        saveMatch_edit:()=>Store.saveMatch({id:'m3',opp:'خصم معدل',date:'2026-10-26',home:true,officer:'u5'}),
        addEvent_m1:()=>Store.addEvent('m1',{pid:'p10',type:'goal',min:50}),
        addEvent_m2:()=>Store.addEvent('m2',{pid:'p11',type:'goal',min:50}),
        addEvent_m3:()=>Store.addEvent('m3',{pid:'p10',type:'goal',min:50}),
        setResult_m1:()=>Store.setResult('m1',5,true),
        setResult_m2:()=>Store.setResult('m2',7,true),
        setResult_m3:()=>Store.setResult('m3',2,false),
        setStarters:()=>Store.setStarters(Store.S.lineup.starters.slice(0,-1)),
        setAtt:()=>Store.setAtt('x1','p1',att),
        saveTeam:()=>Store.saveTeam({name:'فريق جديد',city:'مدينة',color:'#112233'}),
        setPerm:()=>Store.setPerm('coach','stats',true)
      };
      for(const [k,f] of Object.entries(calls)){const b=JSON.stringify(Store.S);const r=f();out[k]=[r,JSON.stringify(Store.S)!==b]}
      return out}"""
    ALL = ['savePlayer_new', 'savePlayer_edit', 'delPlayer', 'unregisterPlayer', 'saveStaff_new', 'delStaff', 'saveMatch_new', 'saveMatch_edit', 'addEvent_m1', 'addEvent_m2', 'addEvent_m3', 'setResult_m1', 'setResult_m2', 'setResult_m3', 'setStarters', 'setAtt', 'saveTeam', 'setPerm']
    PL = ['savePlayer_new', 'savePlayer_edit', 'delPlayer', 'unregisterPlayer']; ST = ['saveStaff_new', 'delStaff']; MA = ['saveMatch_new', 'saveMatch_edit']
    SA = ['addEvent_m1', 'addEvent_m2', 'addEvent_m3', 'setResult_m1', 'setResult_m2', 'setResult_m3']; LU = ['setStarters', 'setAtt']
    EXPECT = {  # مكتوب يدويًا حسب جدول الصلاحيات في data.js (لا يُشتق من Store.can)
        'u1': set(ALL),
        'u2': set(PL + ST + MA + SA + ['saveTeam']),
        'u3': set(PL + ['delStaff'] + MA + SA + ['saveTeam']),  # saveStaff_new يتضمن هاتفًا وهو مرفوض بلا contactStaff
        'u4': set(LU),
        'u5': {'addEvent_m1', 'addEvent_m3', 'setResult_m1', 'setResult_m3'},
        'u6': {'addEvent_m2', 'setResult_m2'}}
    for uid, allowed in EXPECT.items():
        pg = newpage(); out = pg.evaluate(MATRIX, uid); pg.close()
        wrong = [k for k in ALL if (k in allowed) != (out[k][0] == '' and out[k][1])]
        bad_deny = [k for k in ALL if k not in allowed and (out[k][0] == '' or out[k][1])]
        ok(f'F: مصفوفة الصلاحيات المباشرة للمستخدم {uid}: كل عملية مسموحة تنجح وكل ممنوعة تُرفض دون تغيير', not wrong, {'wrong': wrong, 'denied_but_changed': bad_deny})
    # الرفض ليس إخفاء أزرار فقط
    pg = newpage(); user(pg, 'u4'); go(pg, 'players')
    ok('F: المدرب: لا زر إضافة لاعب في الواجهة', pg.locator('#addp').count() == 0)
    b4 = snap(pg)
    ok('F: ...ومع ذلك استدعاء Store.savePlayer مباشرة مرفوض', pg.evaluate("Store.savePlayer({name:'تجاوز',num:44,pos:'وسط',status:'نشط',city:'c',phone:'+000',email:'a@example.invalid'})") != '' and snap(pg) == b4)
    ok('F: ...وحذف لاعب مباشرة مرفوض', pg.evaluate("Store.delPlayer('p1')") != '' and snap(pg) == b4)
    ok('F: ...وتغيير الأدوار مباشرة مرفوض', pg.evaluate("Store.setPerm('coach','players',true)") != '' and snap(pg) == b4)
    # تغيير الصلاحية يؤثر على Store فورًا (منحًا وسحبًا)
    user(pg, 'u1'); pg.evaluate("Store.setPerm('coach','staff',true)"); user(pg, 'u4')
    ok('F: منح صلاحية يفتح العملية في Store', pg.evaluate("Store.delStaff('s2')") == '')
    user(pg, 'u1'); pg.evaluate("Store.setPerm('coach','staff',false)"); user(pg, 'u4')
    ok('F: سحب الصلاحية يغلقها في Store', pg.evaluate("Store.saveStaff({name:'x',role:'y',kind:'فني',phone:'+000'})") != '')
    # التحقق من المدخلات (بصفة المؤسس)
    user(pg, 'u1'); b4 = snap(pg)
    bad = {
        'مركز بحمولة': "Store.savePlayer({name:'a',num:70,pos:'" + PAY[0].replace("'", "\\'") + "',status:'نشط'})",
        'حالة غير صالحة': "Store.savePlayer({name:'a',num:70,pos:'وسط',status:'x'})",
        'رقم 0': "Store.savePlayer({name:'a',num:0,pos:'وسط',status:'نشط'})", 'رقم 100': "Store.savePlayer({name:'a',num:100,pos:'وسط',status:'نشط'})",
        'رقم كسري': "Store.savePlayer({name:'a',num:1.5,pos:'وسط',status:'نشط'})", 'رقم نصي ملوث': "Store.savePlayer({name:'a',num:'5<b>',pos:'وسط',status:'نشط'})",
        'تعديل لاعب غير موجود': "Store.savePlayer({id:'zz',name:'a',num:70,pos:'وسط',status:'نشط'})",
        'نوع طاقم غير صالح': "Store.saveStaff({name:'a',kind:'<b>'})",
        'لون بحمولة': "Store.saveTeam({name:'a',city:'b',color:'url(http://127.0.0.1:9/x)'})",
        'مسؤول مباراة غير صالح': "Store.saveMatch({opp:'a',date:'2026-11-01',home:true,officer:'u1'})", 'تاريخ غير صالح': "Store.saveMatch({opp:'a',date:'x',home:true,officer:'u5'})",
        'حدث للاعب مجهول': "Store.addEvent('m3',{pid:'zz',type:'goal',min:3})", 'نوع حدث غير صالح': "Store.addEvent('m3',{pid:'p10',type:'x',min:3})",
        'دقيقة 0': "Store.addEvent('m3',{pid:'p10',type:'goal',min:0})", 'نتيجة سالبة': "Store.setResult('m3',-1,true)",
        'دور مؤسس في setPerm': "Store.setPerm('founder','audit',false)", 'صلاحية مجهولة': "Store.setPerm('coach','zzz',true)",
        'تشكيلة 12': "Store.setStarters(['p1','p2','p3','p4','p6','p7','p8','p9','p10','p11','p5','p12'])", 'تشكيلة بمجهول': "Store.setStarters(['zz'])",
        'إضافة موقوف للتشكيلة': "Store.setStarters([...Store.S.lineup.starters,'p12'])"}
    notrej = [k for k, js in bad.items() if pg.evaluate(js) == '']
    ok('F: مدخلات غير صالحة كلها مرفوضة', not notrej, notrej)
    ok('F: ...ولا تغيّر الحالة', snap(pg) == b4)
    ok('F: الحالة متسقة بعد كل العمليات (integrity)', pg.evaluate("Store.integrity()") == [], pg.evaluate("Store.integrity()"))
    # حد معروف (للتوثيق فقط، لا يُحتسب): مستخدم يتحكم في JS يتجاوز كل شيء
    user(pg, 'u5'); pg.evaluate("Store.S.cur='u1'")
    r = pg.evaluate("Store.savePlayer({name:'تجاوز موثّق',num:45,pos:'وسط',status:'نشط',city:'c',phone:'+000',email:'a@example.invalid'})")
    info(f"حد معروف (غير محتسب): تعديل Store.S.cur مباشرة يتجاوز الصلاحيات في المتصفح → النتيجة '{r}'. لذلك الإنفاذ الحقيقي يجب أن يكون على الخادم/القاعدة.")
    pg.close()

    # ================= G. الحقن (HTML/JS) =================
    XCHK = "()=>({x:window.__xss,inj:document.querySelectorAll('#view img,#view svg,#view script,#nav img,#nav svg,#nav script,header img,header svg,header script,#toast img,#modal img,#modal svg').length,attrs:document.querySelectorAll('[onerror],[onload],[onfocus],[onclick],[autofocus]').length})"
    def clean(pg, label):
        c = pg.evaluate(XCHK); return c['x'] is None and c['inj'] == 0 and c['attrs'] == 0, c
    # مسار 1: عبر نماذج الواجهة
    pg = newpage(); go(pg, 'players'); pg.click('#addp')
    pg.fill('[name=name]', PAY[0]); pg.fill('[name=num]', '71'); pg.fill('[name=city]', PAY[1]); pg.fill('[name=phone]', PHONE_PAY); pg.fill('[name=email]', PAY[0]); pg.click('#modal button[type=submit]'); pg.wait_for_timeout(100)
    ok('G: [واجهة] تم قبول لاعب باسم/مدينة/بريد يحوي HTML كنص عادي', pg.evaluate("Store.S.players.at(-1).name") == PAY[0] and pg.evaluate("document.querySelector('#modal').open") is False)
    pg.evaluate("Store.S.players.at(-1).pos")  # المركز من قائمة ثابتة
    ok('G: Store يرفض حمولة في حقل المركز', pg.evaluate("Store.savePlayer({name:'x',num:72,pos:%s,status:'نشط'})" % json.dumps(PAY[0])) != '')
    pid = pg.evaluate("Store.S.players.at(-1).id")
    go(pg, 'staff'); pg.click('#adds'); pg.fill('[name=name]', PAY[0]); pg.fill('[name=role]', PAY[1]); pg.fill('[name=phone]', PHONE_PAY); pg.click('#modal button[type=submit]'); pg.wait_for_timeout(100)
    go(pg, 'matches'); pg.click('#addm'); pg.fill('[name=opp]', PAY[0]); pg.click('#modal button[type=submit]'); pg.wait_for_timeout(100)
    go(pg, 'settings'); pg.fill('#tf [name=name]', PAY[0]); pg.fill('#tf [name=city]', PAY[1]); pg.click('#tf button'); pg.wait_for_timeout(100)
    LIT = '<img src=x onerror='
    pages = {'players': lambda: LIT in view(pg), 'player/' + pid: lambda: LIT in view(pg), 'staff': lambda: LIT in view(pg), 'coach': lambda: LIT in view(pg),
             'matches': lambda: LIT in view(pg), 'stats': lambda: LIT in view(pg), 'dash': lambda: True, 'audit': lambda: LIT in view(pg),
             'settings': lambda: pg.input_value('#tf [name=name]') == PAY[0] and LIT in pg.inner_text('#teamName'), 'roles': lambda: True}
    for r, shown in pages.items():
        go(pg, r); c, det = clean(pg, r)
        ok(f'G: [واجهة] «{r.split("/")[0]}»: الحمولة تُعرض نصًا ولا تُنفَّذ ولا تُنشئ عناصر', c and shown(), det)
    user(pg, 'u1'); go(pg, 'coach'); pg.check(f'[data-st="{pid}"]') if pg.locator(f'[data-st="{pid}"]').count() else None; pg.wait_for_timeout(60)
    c, det = clean(pg, 'coach'); ok('G: [واجهة] اسم بحمولة داخل التشكيلة/الحضور لا يُنفَّذ', c, det)
    pg.close()
    # مسار 2: تلويث الحالة مباشرة (يتجاوز تحقق Store) لاختبار الهروب عند العرض
    pg = newpage()
    pg.evaluate("""([P,W])=>{const S=Store.S;
      S.players[0].pos=P[0];S.players[0].status=P[1];S.players[0].num=P[2];S.players[0].name=P[0];S.players[0].city=P[1];S.players[0].phone=P[2];S.players[0].email=P[0];
      S.players.push({id:W,teamId:'t1',name:P[1],num:P[0],pos:P[2],city:P[0],status:P[0],phone:P[1],email:P[2]});
      S.staff.push({id:W,name:P[0],role:P[1],kind:P[2],phone:P[0]});
      S.sessions.push({id:W,title:P[0],date:P[1]});S.att[W]={};
      S.matches[0].opp=P[0];S.matches[0].date=P[1];S.matches[0].them=P[2];S.matches[0].officer=W;S.matches[0].events.push({pid:W,type:P[0],min:P[1]});
      S.users[1].name=P[0];S.users[2].role=P[1];S.logs.push({t:P[0],who:P[1],role:P[2],a:P[0],d:P[1]});S.lineup.formation=P[2];
      S.teams[0].name=P[0];S.teams[0].city=P[1];S.teams[0].color='url(http://127.0.0.1:9/x)';Store.emit()}""", [PAY, WEIRD_ID])
    for r in ['dash', 'players', 'player/p1', 'staff', 'coach', 'matches', 'stats', 'roles', 'audit', 'settings']:
        go(pg, r); c, det = clean(pg, r)
        ok(f'G: [حالة ملوّثة] «{r}»: لا تنفيذ ولا عناصر ولا سمات حقن', c, det)
    for uid in ['u5', 'u3', 'u4']:
        user(pg, uid)
        for r in ['dash', 'matches', 'stats']:
            go(pg, r)
        c, det = clean(pg, uid); ok(f'G: [حالة ملوّثة] منظور {uid} لا يُنفّذ شيئًا', c, det)
    user(pg, 'u1'); go(pg, 'players')
    ok('G: لون الفريق الملوّث لا يصل إلى CSS (يعود للون الافتراضي)', pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--p').trim()") == '#0b6b3a')
    pg.close()

    # ================= H. الهداف عند التعادل =================
    pg = newpage(); go(pg, 'dash')
    ts = pg.evaluate("Store.topScorers().players.map(p=>p.name)")
    ok('H: تعادل ثلاثي في البيانات التجريبية: كل المتعادلين يُعرضون', len(ts) == 3 and all(n in pg.inner_text('#topk') for n in ts) and 'تعادل' in pg.inner_text('#topk'), pg.inner_text('#topk').replace('\n', ' '))
    go(pg, 'stats'); rows = pg.evaluate("[...document.querySelectorAll('.tw tr')].slice(1).map(r=>{const c=[...r.children].map(x=>x.textContent.replace(' (غير مسجّل)',''));return [c[0],+c[1],+c[2]]})")
    srt = pg.evaluate("(rows)=>{const c=new Intl.Collator('ar');return rows.slice().sort((a,b)=>b[2]-a[2]||b[1]-a[1]||c.compare(a[0],b[0])).map(r=>r[0])}", rows)
    ok('H: ترتيب جدول الإحصائيات حتمي: أهداف ثم مشاركات ثم اسم', [r[0] for r in rows] == srt, [r[0] for r in rows][:5])
    ok('H: القاعدة معلنة في الصفحة', 'الأهداف ثم المشاركات' in view(pg) and 'تعادل' in view(pg))
    pg.evaluate("Store.addEvent('m3',{pid:'p10',type:'goal',min:7});Store.setResult('m3',0,true)"); go(pg, 'dash')
    ok('H: هداف وحيد يظهر باسمه وعدد أهدافه', 'سيد المختار' in pg.inner_text('#topk') and '(2)' in pg.inner_text('#topk') and 'تعادل' not in pg.inner_text('#topk'), pg.inner_text('#topk').replace('\n', ' '))
    pg.evaluate("Store.S.matches.forEach(m=>{m.events=m.events.filter(e=>e.type!=='goal')});Store.emit()")
    ok('H: لا أهداف = لا هداف', pg.inner_text('#topk b') == '-' and 'لا أهداف' in pg.inner_text('#topk'), pg.inner_text('#topk').replace('\n', ' '))
    pg.close()

    # ================= I. التشكيلة الافتراضية =================
    pg = newpage(); go(pg, 'coach')
    act = pg.evaluate("Store.S.players.filter(p=>p.status==='نشط').length")
    ok('I: البيانات التجريبية لا تحوي 11 لاعبًا نشطًا (10 فقط) فلا يمكن اكتمال التشكيلة دون تغيير البيانات', act == 10, act)
    ok('I: الواجهة تعلن أن التشكيلة غير مكتملة (10/11) وتشرح السبب', pg.inner_text('#sc') == '10' and 'غير مكتملة' in pg.inner_text('#lnote') and 'النشطين المتاحين 10' in pg.inner_text('#lnote'), pg.inner_text('#lnote'))
    pg.screenshot(path=str(SHOTS / 'after_coach_1280x800.png'), full_page=True)
    pg.evaluate("Store.savePlayer({name:'مدافع إضافي',num:50,pos:'مدافع',status:'نشط',city:'c',phone:'+000',email:'a@example.invalid'})"); go(pg, 'coach')
    pg.locator('[data-st]:not(:checked):not([disabled])').first.click(); pg.wait_for_timeout(60)
    ok('I: عند توفر لاعب نشط إضافي تكتمل التشكيلة 11/11 وتختفي الملاحظة', pg.inner_text('#sc') == '11' and pg.locator('#lnote').count() == 0)
    pg.close()

    # ================= J. عرض النتيجة في RTL =================
    pg = newpage(); go(pg, 'matches')
    JS = """(mid)=>{const c=document.querySelector('[data-m='+mid+']');const R=e=>e.getBoundingClientRect(),X=e=>R(e).left,CX=e=>R(e).left+R(e).width/2;
      const us=c.querySelector('.tm[data-t=us]'),opp=c.querySelector('.tm[data-t=opp]'),nu=c.querySelector('.n[data-side=us]'),nt=c.querySelector('.n[data-side=them]');
      const near=(n,t)=>{const a=R(n),b=R(t);return Math.max(0,b.left-a.right,a.left-b.right)};  // الفجوة بين الحافتين
      return {usTeamRightOfOpp:X(us)>X(opp),usNumRightOfThem:X(nu)>X(nt),usNumNextToUs:near(nu,us)<near(nu,opp),themNumNextToOpp:near(nt,opp)<near(nt,us),
        scoreBetweenTeams:Math.min(X(us),X(opp))<X(c.querySelector('.score'))&&X(c.querySelector('.score'))<Math.max(X(us),X(opp)),aria:c.querySelector('.score').getAttribute('aria-label'),nums:[nu.textContent,nt.textContent]}}"""
    for mid, home in [('m1', True), ('m2', False)]:
        d = pg.evaluate(JS, mid)
        ok(f'J: {mid} ({"على الأرض" if home else "خارج الأرض"}): ترتيب الرقمين يطابق ترتيب الفريقين', d['usTeamRightOfOpp'] == d['usNumRightOfThem'] == home, d)
        ok(f'J: {mid}: كل رقم مجاور لفريقه والنتيجة بين الفريقين', d['usNumNextToUs'] and d['themNumNextToOpp'] and d['scoreBetweenTeams'], d)
        ok(f'J: {mid}: وصف النتيجة لقارئ الشاشة يحدد الفريقين', 'نحن' in d['aria'] and all(n in d['aria'] for n in d['nums']), d['aria'])
    pg.evaluate("Store.setResult('m2',10,true)"); go(pg, 'matches')
    d = pg.evaluate(JS, 'm2'); ok('J: رقمان بخانتين لا يربكان الترتيب والمجاورة', d['usTeamRightOfOpp'] == d['usNumRightOfThem'] == False and d['usNumNextToUs'] and d['themNumNextToOpp'] and d['nums'] == ['1', '10'], d)
    pg.locator('[data-m=m2]').screenshot(path=str(SHOTS / 'after_match_away_1280.png'))
    pg.close()

    # ================= K. لقطات الصفحات المهمة =================
    for (w, h, tag) in [(1280, 800, '1280x800'), (375, 740, '375x740')]:
        pg = newpage(w, h)
        for r in ['dash', 'players', 'matches', 'stats']:
            go(pg, r); pg.screenshot(path=str(SHOTS / f'after_{r}_{tag}.png'), full_page=(w == 375))
        pg.close()

    # ================= M. مراجعة Task 04: مسارات غريبة ونصوص طويلة =================
    pg = newpage(); n0 = len(errs)
    for h_ in ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'nope', '%3Cimg%20src=x%20onerror=window.__xss=1%3E']:
        pg.goto(URL + '#/' + h_); pg.wait_for_timeout(50)
        t_ = pg.inner_text('#view')
        ok(f'M: مسار غريب #{h_[:22]} يعرض لوحة التحكم دون أخطاء', 'لوحة التحكم' in t_ and '[object' not in t_ and pg.evaluate('window.__xss') is None and len(errs) == n0, t_[:30])
    pg.close()
    pg = newpage(375, 740)
    pg.evaluate("p=>Store.savePlayer(p)", {'name': 'ا' * 60, 'num': 90, 'pos': 'وسط', 'status': 'نشط', 'city': 'م' * 60, 'phone': '+' + '0' * 29, 'email': 'e' * 60 + '@example.invalid'})
    lp = pg.evaluate("Store.S.players.at(-1).id")
    for r_ in ['dash', 'players', 'player/' + lp, 'coach', 'stats', 'staff', 'matches']:
        go(pg, r_); w_ = pg.evaluate("[document.documentElement.scrollWidth, innerWidth]")
        ok(f'M: نص طويل غير مفصول على 375px بلا تمرير أفقي للصفحة ({r_.split("/")[0]})', w_[0] <= w_[1], w_)
    pg.close()

    # ================= L. شبكة وأخطاء =================
    ext = [u for u in reqs if not u.startswith('file://') and not u.startswith('data:') and not u.startswith('about:')]
    ok('L: لا اتصالات خارجية في كل اختبارات هذا الملف', not ext, ext[:5])
    ok('L: لا طلبات لمورد وهمي ناتج عن حقن (…/x)', not [u for u in reqs if u.endswith('/x')])
    ok('L: لا أخطاء JS/console', not errs, errs[:5])
    b.close()

fails = [r for r in res if not r[1]]
print(f'\nالإجمالي: {len(res)-len(fails)}/{len(res)} نجح')
json.dump(res, open(root / 'tests' / 'last_results_fixes.json', 'w'), ensure_ascii=False, indent=1)
sys.exit(1 if fails else 0)
