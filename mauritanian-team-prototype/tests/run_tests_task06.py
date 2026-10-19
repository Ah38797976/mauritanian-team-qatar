# اختبارات Task 06 — الأمين المالي، هواتف طاقم المدرب، مسؤول المباراة بلا طاقم، visibleMatches/stats/logs، كشف Store.S وwindow.DATA.
# محلية عبر file:// فقط. الوضع الافتراضي ?dev=1 (يكشف Store.S للاختبار)؛ اختبارات الكشف تفتح الصفحة بدونه.
import pathlib, json
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parent.parent
BASE = (root / 'index.html').as_uri(); URL = BASE + '?dev=1'
res = []
def ok(name, cond, info=''):
    res.append((name, bool(cond), info)); print(('PASS ' if cond else 'FAIL ') + name + (' | ' + str(info) if info else ''))
def info(m): print('INFO ' + m)
PM = ['example.invalid', '+000 00 00 ']; SM = ['+000 00 11 00']
has = lambda h, ms: any(m in h for m in ms)
PAGES = ['dash', 'players', 'player/p1', 'staff', 'finance', 'coach', 'matches', 'stats', 'roles', 'audit', 'settings']
with sync_playwright() as p:
    b = p.chromium.launch(); reqs, errs = [], []
    def fresh(url=URL, w=1280, h=800):
        pg = b.new_page(viewport={'width': w, 'height': h})
        pg.on('request', lambda r: reqs.append(r.url)); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(url); return pg
    def user(pg, u): pg.evaluate(f"Store.setUser('{u}')"); pg.wait_for_timeout(25)
    def go(pg, u, r): pg.goto(URL + '#/' + r); user(pg, u); pg.wait_for_timeout(40)
    html = lambda pg: pg.evaluate("document.documentElement.outerHTML")

    # ===== 1. الأمين المالي =====
    pg = fresh(); user(pg, 'u7')
    ok('1: الدور «الأمين المالي» موجود ومستخدمه التجريبي', pg.evaluate("Store.ROLES.treasurer") == 'الأمين المالي' and pg.evaluate("Store.user().role") == 'treasurer')
    ok('1: صلاحياته محدودة: finance وviewNames فقط', pg.evaluate("Store.S.perms.treasurer") == ['finance', 'viewNames'])
    leaks = []
    OUT = ['إبراهيم فال', 'أنواكشوط', 'أطار', 'روصو', 'نادي الصداقة', 'نجوم المدينة', 'المدرب العام', 'أمين الصندوق (تجريبي)', 'تدريب الثلاثاء', '4-4-2']
    for r in PAGES:
        go(pg, 'u7', r); h = html(pg)
        leaks += [(r, m) for m in PM + SM + OUT if m in h and not (r == 'finance' and m == 'إبراهيم فال')]
    ok('1: لا هاتف/بريد/مدن/مباريات/طاقم/حضور في أي صفحة للأمين المالي', not leaks, leaks)
    go(pg, 'u7', 'finance'); t = pg.inner_text('#view')
    ok('1: صفحة المالية: أسماء اللاعبين فقط (12) مع إعلان غياب الوحدة المالية', pg.locator('#fnames li').count() == 12 and 'لا توجد وحدة مالية' in t and 'محمد الأمين' in t and '#1' not in t)
    go(pg, 'u7', 'dash'); ok('1: لوحة التحكم للأمين المالي تعرض ملاحظة مالية لا مؤشرات الفريق', 'لا توجد وحدة مالية' in pg.inner_text('#view') and 'مباريات لُعبت' not in pg.inner_text('#view'))
    for r in ['players', 'player/p1', 'staff', 'coach', 'matches', 'stats', 'roles', 'audit']:
        go(pg, 'u7', r); ok(f'1: صفحة {r} غير متاحة للأمين المالي', 'غير مصرح' in pg.inner_text('#view'))
    for u in ['u2', 'u3', 'u4', 'u5']:
        go(pg, u, 'finance'); ok(f'1: صفحة المالية غير متاحة للدور {u}', 'غير مصرح' in pg.inner_text('#view'))
    go(pg, 'u1', 'finance'); ok('1: المؤسس يرى صفحة المالية', pg.locator('#fnames li').count() == 12)
    user(pg, 'u7')
    r = pg.evaluate("""()=>({pl:Store.players(),st:Store.staffList(),lg:Store.logs(),vm:Store.visibleMatches(),sr:Store.statRows(),ro:Store.roster().map(p=>Object.keys(p).sort().join()),
      p1:Store.player('p1'),s1:Store.stats('p10'),top:Store.topScorers(),pc:Store.playerLinks('p1'),ig:Store.integrity()})""")
    ok('1: قراءات Store للأمين المالي: لا لاعبين/طاقم/سجل/مباريات/إحصاءات', r['pl'] == [] and r['st'] == [] and r['lg'] == [] and r['vm'] == [] and r['sr'] == [] and r['top']['players'] == [] and r['s1'] == {'apps': 0, 'goals': 0, 'yellow': 0, 'red': 0}, r)
    ok('1: القائمة والبطاقة للأمين المالي: id واسم فقط', set(r['ro']) == {'id,name'} and set(r['p1'].keys()) == {'id', 'name'} and r['pc'] == {'events': 0, 'matches': 0, 'att': 0}, r['p1'])
    ok('1: integrity ترفض الأمين المالي', r['ig'] != [] and 'غير مصرح' in r['ig'][0])
    w = pg.evaluate("""()=>{const c={savePlayer:Store.savePlayer({name:'x',num:60,pos:'وسط',status:'نشط',city:''}),del:Store.delPlayer('p1'),unreg:Store.unregisterPlayer('p1'),
      st:Store.saveStaff({name:'x',role:'r',kind:'فني'}),ds:Store.delStaff('s1'),sm:Store.saveMatch({opp:'x',date:'2026-11-01',home:true,officer:'u5'}),ev:Store.addEvent('m3',{pid:'p1',type:'goal',min:5}),
      rs:Store.setResult('m3',1,true),sl:Store.setStarters([]),sa:Store.setAtt('x1','p1',true),tm:Store.saveTeam({name:'x',city:'x',color:'#000000'}),pm:Store.setPerm('treasurer','stats',true)};return c}""")
    ok('1: كل عمليات الكتابة مرفوضة للأمين المالي', all(v != '' for v in w.values()), w)
    user(pg, 'u1'); ok('1: المؤسس يمنح/يسحب صلاحياته', pg.evaluate("Store.setPerm('treasurer','viewPlayers',true)") == '' and pg.evaluate("Store.setPerm('treasurer','viewPlayers',false)") == '')
    go(pg, 'u1', 'roles'); ok('1: صفحة الأدوار تعرض عمود الأمين المالي والصلاحيات الجديدة', 'الأمين المالي' in pg.inner_text('#view') and 'البيانات المالية' in pg.inner_text('#view') and 'هواتف طاقم الفريق' in pg.inner_text('#view'))
    ok('1: الصلاحيات الأخرى لم تتغير', pg.evaluate("[Store.S.perms.officer.join(),Store.S.perms.secretary.includes('contactPlayers'),Store.S.perms.coach.includes('contactPlayers')]") == ['stats', False, False])
    pg.close()

    # ===== 2. هاتف الطاقم للمدرب (طاقم فريقه فقط، بلا بريد) =====
    pg = fresh(); user(pg, 'u4')
    pg.evaluate("Store.S.staff.push({id:'s9',teamId:'t2',name:'طاقم فريق آخر (تجريبي)',role:'مدرب',kind:'فني',phone:'+000 00 99 00 09'})")
    sl = pg.evaluate("Store.staffList()")
    ok('2: المدرب يرى هواتف طاقم فريقه (t1) لا فريق آخر', all(('phone' in s) == (s['teamId'] == 't1') for s in sl) and len([s for s in sl if 'phone' in s]) == 4, [(s['id'], 'phone' in s) for s in sl])
    ok('2: لا بريد في أي سجل طاقم لأي دور', all('email' not in s for s in sl))
    go(pg, 'u4', 'staff'); h = html(pg)
    ok('2: صفحة الطاقم للمدرب: هواتف t1 ظاهرة وهاتف الفريق الآخر مخفي (شرطة) وبلا @', '+000 00 11 00 01' in h and '+000 00 99' not in h and '@' not in pg.inner_text('#view table') and '—' in pg.inner_text('#view table'))
    ok('2: المدرب لا يرى هاتف/بريد اللاعبين', not has(html(pg), PM))
    go(pg, 'u2', 'staff'); ok('2: الإدارة ترى هاتف الفريق الآخر أيضًا', '+000 00 99 00 09' in html(pg))
    for u in ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7']:
        user(pg, u); s = json.dumps(pg.evaluate("Store.staffList()")); ok(f'2: لا حقل email في staffList للدور {u}', 'email' not in s)
    user(pg, 'u4')
    ok('2: المدرب لا يكتب هاتف الطاقم حتى لو مُنح إدارة الطاقم', (user(pg, 'u1'), pg.evaluate("Store.setPerm('coach','staff',true)"))[1] == '' and (user(pg, 'u4'), pg.evaluate("Store.saveStaff({id:'s1',name:'x',role:'r',kind:'فني',phone:'+1'})"))[1] != '' and pg.evaluate("Store.saveStaff({id:'s1',name:'المدرب العام (تجريبي)',role:'المدرب',kind:'فني'})") == '' and pg.evaluate("Store.S.staff[0].phone") == '+000 00 11 00 01')
    user(pg, 'u1'); pg.evaluate("Store.setPerm('coach','contactStaffTeam',false)"); user(pg, 'u4'); go(pg, 'u4', 'staff')
    ok('2: سحب «هواتف طاقم الفريق» يخفيها فورًا', not has(html(pg), SM) and pg.evaluate("Store.staffList().every(s=>!('phone' in s))"))
    pg.close()

    # ===== 3. مسؤول المباراة بلا وصول إلى الطاقم =====
    pg = fresh()
    for u in ['u5', 'u6']:
        user(pg, u); leaks = []
        for r in PAGES:
            go(pg, u, r); h = html(pg); leaks += [(r, m) for m in SM + ['المدرب العام', 'مساعد المدرب', 'رئيس الفريق', 'أمين الصندوق'] if m in h]
        ok(f'3[{u}]: لا أسماء/هواتف طاقم في أي صفحة', not leaks, leaks)
        go(pg, u, 'staff'); ok(f'3[{u}]: صفحة الطاقم مرفوضة', 'غير مصرح' in pg.inner_text('#view') and pg.evaluate("Store.staffList()") == [])
    user(pg, 'u1')
    rr = [pg.evaluate(f"Store.setPerm('officer','{m}',true)") for m in ['viewStaff', 'staff', 'contactStaff', 'contactStaffTeam']]
    ok('3: لا يمكن منح مسؤول المباراة أي صلاحية طاقم', all(x != '' for x in rr), rr)
    pg.evaluate("Store.S.perms.officer.push('viewStaff','staff','contactStaff','contactStaffTeam')"); user(pg, 'u5')
    ok('3: حتى مع تعديل الصلاحيات مباشرة تبقى can() = false وstaffList فارغة وحفظ/حذف الطاقم مرفوض', pg.evaluate("['viewStaff','staff','contactStaff','contactStaffTeam'].some(m=>Store.can(m))") is False and pg.evaluate("Store.staffList()") == [] and pg.evaluate("Store.saveStaff({name:'x',role:'r',kind:'فني'})") != '' and pg.evaluate("Store.delStaff('s1')") != '')
    go(pg, 'u5', 'staff'); ok('3: وصفحة الطاقم تبقى مرفوضة بعد التعديل المباشر', 'غير مصرح' in pg.inner_text('#view') and not has(html(pg), SM))
    pg.close()

    # ===== 4. visibleMatches / stats / integrity مقيّدة ولا تعيد مراجع حية =====
    pg = fresh()
    for u in ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7']:
        user(pg, u); before = pg.evaluate("JSON.stringify(Store.S.matches)")
        pg.evaluate("""()=>{for(const m of Store.visibleMatches()){m.opp='X';m.them=99;m.played=false;m.events.push({pid:'p1',type:'goal',min:1});m.events.forEach(e=>e.min=77);m.players.push('p5');m.players.length=0;m.officer='u7'}}""")
        ok(f'4[{u}]: تعديل ما تُرجعه visibleMatches لا يغيّر الحالة', pg.evaluate("JSON.stringify(Store.S.matches)") == before)
    user(pg, 'u1'); full = pg.evaluate("[Store.stats('p3'),Store.stats('p12')]")
    user(pg, 'u5'); a = pg.evaluate("[Store.stats('p10'),Store.stats('p12'),Store.stats('p5')]")
    user(pg, 'u6'); c = pg.evaluate("[Store.stats('p3'),Store.stats('p12'),Store.stats('p11')]")
    Z = {'apps': 0, 'goals': 0, 'yellow': 0, 'red': 0}
    ok('4: Store.stats لمسؤول المباراة من مبارياته فقط (لا إحصاءات عامة عبر الدالة)', full[0]['yellow'] == 1 and a[0]['goals'] == 1 and a[1] == Z and a[2] == Z and c[0] == Z and c[1]['apps'] == 1 and c[2]['goals'] == 1, [full, a, c])
    ok('4: الإحصاءات الكاملة للمؤسس لم تتغير', pg.evaluate("(Store.setUser('u1'),Store.integrity())") == [])
    user(pg, 'u5'); ok('4: integrity مرفوضة لمسؤول المباراة', pg.evaluate("Store.integrity()")[0].startswith('غير مصرح'))
    pg.close()

    # ===== 5. سجل العمليات =====
    pg = fresh(); user(pg, 'u2')
    pg.evaluate("Store.savePlayer({id:'p2',name:'سيدي أحمد',num:2,pos:'مدافع',city:'أطار',status:'نشط',phone:'+000 77 77 77 77',email:'new.mail@example.invalid'});Store.saveStaff({id:'s1',name:'المدرب العام (تجريبي)',role:'المدرب',kind:'فني',phone:'+000 88 88 88 88'});Store.savePlayer({id:'p2',name:'سيدي أحمد',num:2,pos:'مدافع',city:'أطار',status:'نشط',phone:'+000 77 77 77 77',email:'new.mail@example.invalid'})")
    lg = json.dumps(pg.evaluate("Store.logs()"), ensure_ascii=False)
    ok('5: السجل يوثّق تغيير التواصل دون تسجيل القيم نفسها', 'تغيير بيانات التواصل' in lg and 'تغيير الهاتف' in lg and '+000 77' not in lg and 'new.mail' not in lg and '+000 88' not in lg and lg.count('تغيير بيانات التواصل') == 1, lg[:200])
    ok('5: السجل لا يحوي أي هاتف/بريد أبدًا', not has(lg, PM + SM))
    for u in ['u3', 'u4', 'u5', 'u6', 'u7']:
        user(pg, u); ok(f'5[{u}]: Store.logs فارغة وصفحة السجل مرفوضة', pg.evaluate("Store.logs()") == [] and (go(pg, u, 'audit') or 'غير مصرح' in pg.inner_text('#view')))
    user(pg, 'u1'); n0 = pg.evaluate("Store.logs().length"); pg.evaluate("Store.logs().forEach(l=>{l.d='X';l.who='X'});Store.logs().length=0")
    ok('5: نسخ السجل لا تغيّر الأصل', pg.evaluate("Store.logs().length") == n0 and 'X' not in json.dumps(pg.evaluate("Store.logs()")))
    pg.evaluate("for(let i=0;i<600;i++)Store.setAtt('x1','p1',i%2===0)")
    ok('5: سقف السجل 500 ولا يتضخم بلا حد', pg.evaluate("Store.logs().length") <= 500)
    pg.close()

    # ===== 6. كشف الحالة الخام (بدون ?dev=1) =====
    pg = fresh(BASE)
    ok('6: بدون dev: Store.S غير موجود وwindow.DATA محذوف', pg.evaluate("typeof Store.S") == 'undefined' and pg.evaluate("typeof window.DATA") == 'undefined')
    ok('6: Store مجمّد ولا يقبل استبدال الدوال', pg.evaluate("Object.isFrozen(Store)") is True and pg.evaluate("(()=>{try{Store.can=()=>true}catch(e){}Store.setUser('u5');return Store.can('players')})()") is False)
    ok('6: _bind لا تعمل ثانية (لا تسليم للحالة الخام)', pg.evaluate("(()=>{try{return Store._bind()}catch(e){return 'blocked'}})()") == 'blocked')
    pg.evaluate("Store.setUser('u5')")
    sc = pg.evaluate("""()=>{const hits=[];for(const k of Object.getOwnPropertyNames(window)){try{const v=window[k];if(v&&typeof v==='object'&&k!=='document'&&k!=='location'){const s=JSON.stringify(v);if(s&&(s.includes('example.invalid')||s.includes('+000 00'))) hits.push(k)}}catch(e){}}
      const ks=Object.keys(Store).filter(k=>typeof Store[k]!=='function');return {hits,ks}}""")
    ok('6: لا خاصية عامة في window أو Store تحمل بيانات خام (هواتف/بريد)', sc['hits'] == [] and set(sc['ks']) <= {'ROLES', 'MODS', 'STAFF_MODS', 'EV', 'POS', 'STAT', 'KIND', 'ARCH'}, sc)
    pg.evaluate("Store.setUser('u1')"); pg.goto(BASE + '#/players'); pg.wait_for_timeout(60)
    ok('6: التطبيق يعمل كاملًا بدون dev (المؤسس: 12 لاعبًا)', pg.locator('#plist .pc').count() == 12 and pg.evaluate("Store.user().role") == 'founder')
    pg.select_option('#userSel', 'u5'); pg.goto(BASE + '#/matches'); pg.wait_for_timeout(50)
    pg.select_option('[data-m=m3] [name=pid]', 'p10'); pg.fill('[data-m=m3] [name=min]', '12'); pg.click('[data-m=m3] .evf button'); pg.wait_for_timeout(60)
    ok('6: إدخال حدث مسؤول المباراة يعمل بدون dev', 'هدف' in pg.inner_text('[data-m=m3]'))
    pg.evaluate("Store.setUser('u1')")
    info('حد معروف (لا يُحتسب): Store.setUser عامة عمدًا لأنها أداة المحاكاة؛ أي سكربت في الصفحة يستطيع التحويل إلى المؤسس وقراءة كل شيء. لا حل محلي: الإنفاذ خادمي.')
    pg.close()

    # ===== 7. فحص كل الصفحات للأدوار بلا تجاوز أفقي ولا أخطاء =====
    for (w, h) in [(1280, 800), (375, 740)]:
        pg = fresh(URL, w, h); bad = []
        for u in ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7']:
            for r in PAGES + ['player/p5', 'player/p12']:
                go(pg, u, r); sw = pg.evaluate("[document.documentElement.scrollWidth, innerWidth]")
                if sw[0] > sw[1]: bad.append((u, r, sw))
        ok(f'7: لا تجاوز أفقي للصفحة لأي دور/صفحة عند {w}px', not bad, bad[:5]); pg.close()
    ok('لا اتصالات خارجية', all(u.startswith('file://') for u in reqs), [u for u in reqs if not u.startswith('file://')][:3])
    ok('لا أخطاء JS/console', not errs, errs[:3])
    b.close()
fails = [r for r in res if not r[1]]
json.dump(res, open(root / 'tests' / 'last_results_task06.json', 'w'), ensure_ascii=False, indent=1)
print(f"\nالإجمالي: {len(res) - len(fails)}/{len(res)} نجح")
