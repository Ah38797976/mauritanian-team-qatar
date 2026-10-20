// بيانات وهمية بالكامل — لا بيانات حقيقية ولا أرقام هواتف حقيقية
window.DATA = {
  teams: [{ id: 't1', name: 'فريق الجالية', city: 'مدينة تجريبية', color: '#0b6b3a', founded: 2020 }],
  cur: 'u1',
  site: { about: 'فريق الجالية الموريتانية لكرة القدم في قطر (نص تجريبي).', announcement: '', sections: { about: true, squad: true, staff: true, matches: true, scorers: true } },
  users: [
    { id: 'u1', name: 'المؤسس (تجريبي)', role: 'founder', teamId: 't1' },
    { id: 'u2', name: 'مدير إداري (تجريبي)', role: 'admin', teamId: 't1' },
    { id: 'u3', name: 'أمين رياضي (تجريبي)', role: 'secretary', teamId: 't1' },
    { id: 'u4', name: 'مدرب (تجريبي)', role: 'coach', teamId: 't1' },
    { id: 'u5', name: 'مسؤول مباراة 1 (تجريبي)', role: 'officer', teamId: 't1' },
    { id: 'u6', name: 'مسؤول مباراة 2 (تجريبي)', role: 'officer', teamId: 't1' },
    { id: 'u7', name: 'أمين مالي (تجريبي)', role: 'treasurer', teamId: 't1' }
  ],
  perms: {
    admin: ['viewPlayers', 'players', 'staff', 'matches', 'stats', 'settings', 'audit', 'viewStaff', 'contactPlayers', 'contactStaff'],
    secretary: ['viewPlayers', 'players', 'staff', 'matches', 'stats', 'settings', 'viewStaff'], // الأمين الرياضي: يدير اللاعبين والطاقم والمباريات والإعدادات؛ بلا هواتف/بريد ولا مالية ولا سجل ولا صلاحيات ولا مستخدمين (إدارة المستخدمين وصلاحية users للمؤسس وحده)
    coach: ['viewPlayers', 'lineup', 'viewStaff', 'contactStaffTeam'],
    officer: ['stats'],
    treasurer: ['finance', 'viewNames']
  },
  players: [
    ['p1','محمد الأمين',1,'حارس','أنواكشوط','نشط'], ['p2','سيدي أحمد',2,'مدافع','أطار','نشط'],
    ['p3','عبد الله ولد سالم',3,'مدافع','روصو','نشط'], ['p4','يحيى بابا',4,'مدافع','كيفة','نشط'],
    ['p5','إبراهيم فال',5,'مدافع','نواذيبو','مصاب'], ['p6','أحمد سالم',6,'وسط','النعمة','نشط'],
    ['p7','محمود الشيخ',8,'وسط','ألاك','نشط'], ['p8','الشيخ محمد',10,'وسط','أنواكشوط','نشط'],
    ['p9','بلال ولد عبد',13,'وسط','كيهيدي','نشط'], ['p10','سيد المختار',9,'مهاجم','زويرات','نشط'],
    ['p11','عثمان جالو',11,'مهاجم','سيلبابي','نشط'], ['p12','خليل الداه',12,'حارس','أنواكشوط','موقوف']
  ].map((a, i) => ({ id: a[0], teamId: 't1', name: a[1], num: a[2], pos: a[3], city: a[4], status: a[5], phone: '+000 00 00 ' + String(10 + i).padStart(2, '0') + ' 00', email: 'player' + (i + 1) + '@example.invalid' })),
  staff: [
    { id: 's1', teamId: 't1', name: 'المدرب العام (تجريبي)', role: 'المدرب', kind: 'فني', phone: '+000 00 11 00 01' },
    { id: 's2', teamId: 't1', name: 'مساعد المدرب (تجريبي)', role: 'مساعد مدرب', kind: 'فني', phone: '+000 00 11 00 02' },
    { id: 's3', teamId: 't1', name: 'رئيس الفريق (تجريبي)', role: 'رئيس', kind: 'إداري', phone: '+000 00 11 00 03' },
    { id: 's4', teamId: 't1', name: 'أمين الصندوق (تجريبي)', role: 'أمين الصندوق', kind: 'إداري', phone: '+000 00 11 00 04' }
  ],
  lineup: { formation: '4-4-2', starters: ['p1','p2','p3','p4','p6','p7','p8','p9','p10','p11'] },
  sessions: [
    { id: 'x1', title: 'تدريب الثلاثاء', date: '2026-10-13' },
    { id: 'x2', title: 'تدريب الخميس', date: '2026-10-15' }
  ],
  att: { x1: { p1: true, p2: true, p3: true, p4: false, p6: true, p7: true, p8: true, p9: true, p10: true, p11: true, p5: false, p12: true },
         x2: { p1: true, p2: true, p3: false, p4: true, p6: true, p7: true, p8: true, p9: false, p10: true, p11: true, p5: false, p12: true } },
  matches: [
    { id: 'm1', opp: 'نادي الصداقة', date: '2026-10-04', home: true, played: true, them: 1, officer: 'u5', players: ['p1','p2','p3','p4','p6','p7','p8','p9','p10','p11'],
      events: [{ pid: 'p10', type: 'goal', min: 23 }, { pid: 'p8', type: 'goal', min: 61 }, { pid: 'p3', type: 'yellow', min: 70 }] },
    { id: 'm2', opp: 'اتحاد الجالية الإفريقية', date: '2026-10-11', home: false, played: true, them: 2, officer: 'u6', players: ['p1','p2','p4','p6','p7','p8','p10','p11','p12'],
      events: [{ pid: 'p11', type: 'goal', min: 40 }, { pid: 'p2', type: 'yellow', min: 55 }, { pid: 'p4', type: 'red', min: 88 }] },
    { id: 'm3', opp: 'نجوم المدينة', date: '2026-10-25', home: true, played: false, them: 0, officer: 'u5', players: [], events: [] }
  ],
  logs: [{ t: '2026-10-11 20:30', who: 'مسؤول مباراة 2 (تجريبي)', role: 'officer', a: 'إدخال حدث مباراة', d: 'هدف — عثمان جالو (د 40) ضد اتحاد الجالية الإفريقية' }]
};
