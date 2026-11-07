// ============================================================================
// LIVE COPY of supabase-adapter.v2.js (adds getSite/saveSite). Used by admin/live only; admin/connected keeps the original.
// Phase 2A draft v2 of the data layer. Differences from supabase-adapter.js (v1) are marked [v2 Fx].
//   F-2 sessions expose `date` (UI field) instead of `session_date`
//   F-3 players/staff carry `teamId`; player contacts are merged into the player object ONLY when the server returned them
//   F-4 team members are read (RLS allows it only to roles holding matches/settings/roles) so the match form can list officers
//   F-5 roster() = exactly what rpc_get_roster() returned (the SERVER decides the scope; the UI must not re-derive it)
//        CONTRACT NOTE (F-5, docs-only; no behaviour change): this roster() is the SERVER-SCOPED list, NOT Store.roster().
//        Store.roster() is [] for a match officer (privacy test run_tests_privacy B), whereas rpc_get_roster() returns the officer's
//        own-match players (needed: RLS gives officers no direct read of `players`). Use this list to resolve player(id) /
//        match-event candidates for officers; do not use it to render the general roster. See docs/06 section 'F-5'.
//   + auth state changes (sign-out / expiry in another tab) clear or refresh the cache
//   + photo upload uses the team id from the server-provided session context, never a caller argument
//   + photo delete takes the storage path from the cache of server rows, never from the caller
//   + contact keys are sent to rpc_save_player / rpc_save_staff only if the caller explicitly supplies them (a role
//     without contact permission must not send them at all: the server now rejects their mere presence — finding S-1)
//   + writes are serialised so two refreshes cannot interleave
// The REAL enforcement is RLS/RPC on the server. Nothing here is a security boundary.
// ============================================================================
(function () {
  'use strict';
  const DENY = 'غير مصرح بهذه العملية لدورك الحالي', NET = 'تعذّر الاتصال بالخادم، حاول لاحقًا';
  const POS = { gk: 'حارس', def: 'مدافع', mid: 'وسط', fwd: 'مهاجم' }, STATUS = { active: 'نشط', injured: 'مصاب', suspended: 'موقوف', unregistered: 'غير مسجّل' };
  const KIND = { technical: 'فني', administrative: 'إداري' };
  const inv = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]));
  const POS_R = inv(POS), STATUS_R = inv(STATUS), KIND_R = inv(KIND);
  const has = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);

  function assertPublicKey(k) {
    if (!k || /^__SET/.test(k)) throw new Error('المفتاح العام غير مضبوط');
    if (/^sb_secret_/i.test(k)) throw new Error('مفتاح سري ممنوع في الواجهة');
    if (k.split('.').length === 3) {
      let role;
      try { role = JSON.parse(atob(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role; } catch (_) { role = undefined; }
      if (role && role !== 'anon') throw new Error('مفتاح غير عام (' + role + ') ممنوع في الواجهة');
    }
  }
  function assertUrl(u) { if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(u || '')) throw new Error('عنوان المشروع غير صالح'); }  // [v2] https + supabase.co only

  let sb = null, chain = Promise.resolve();
  let photoGen = 0;
  const urlCache = new Map();   // storage_path -> { url, exp } ; الروابط موقّعة لساعة، نعيد استعمالها حتى قبل انتهائها بخمس دقائق
  const cache = { me: null, roster: [], players: [], contacts: {}, staff: [], members: [], matches: [], lineup: [], lineupInfo: { v2: null, formation: '', slots: {}, captain: '', gk: '', err: '' }, sessions: [], att: {}, stats: [], logs: [], photos: [], staffPhotos: [] };
  const subs = [], emit = () => subs.forEach(f => f());
  const reset = () => { urlCache.clear(); Object.assign(cache, { me: null, roster: [], players: [], contacts: {}, staff: [], members: [], matches: [], lineup: [], lineupInfo: { v2: null, formation: '', slots: {}, captain: '', gk: '', err: '' }, sessions: [], att: {}, stats: [], logs: [], photos: [], staffPhotos: [] }); };

  // PGRST202 / 42883 = الدالة غير موجودة على الخادم (0014 غير مُطبَّق): رسالة واضحة بدل «تعذّر الاتصال»
  const FEATURE_OFF = 'هذه الميزة غير مفعّلة على الخادم بعد';
  const rpc = async (name, args) => {
    try { const { data, error } = await sb.rpc(name, args || {}); if (error) return error.code === '42501' ? DENY : (error.code === 'PGRST202' || error.code === '42883') ? FEATURE_OFF : NET; return data; }
    catch (_) { return NET; }
  };
  // قراءة التشكيلة وتمييز ثلاث حالات: (1) الأعمدة الجديدة موجودة = 0014 مُطبَّق، (2) رمز 42703 يذكر أحد الأعمدة الجديدة = 0014 غير مُطبَّق (نرجع للقراءة القديمة)،
  // (3) أي خطأ آخر (صلاحية 42501، JWT، شبكة…) لا يعني شيئًا عن 0014: نُبقي آخر حالة صحيحة معروفة ونسجّل الخطأ ولا نغيّر الوضع.
  const NEW_COLS = /\b(slot|is_captain|is_goalkeeper)\b/;
  async function readLineup() {
    const prev = cache.lineupInfo, q = t => sb.from(t);
    let r;
    try { r = await q('lineup_starters').select('player_id,slot,is_captain,is_goalkeeper'); } catch (_) { return { ...prev, err: 'net', ids: cache.lineup }; }
    if (!r.error) {
      const rows = r.data || [], slots = {}; let captain = '', gk = '';
      rows.forEach(x => { if (x.slot != null) slots[x.player_id] = x.slot; if (x.is_captain) captain = x.player_id; if (x.is_goalkeeper) gk = x.player_id; });
      let formation = '';
      try { const f = await q('lineups').select('formation'); if (!f.error && f.data && f.data[0]) formation = String(f.data[0].formation || ''); } catch (_) {}
      return { v2: true, formation, slots, captain, gk, err: '', ids: rows.map(x => x.player_id) };
    }
    if (r.error.code === '42703' && NEW_COLS.test(String(r.error.message || ''))) {
      let l; try { l = await q('lineup_starters').select('player_id'); } catch (_) { return { ...prev, err: 'net', ids: cache.lineup }; }
      if (l.error) return { ...prev, err: String(l.error.code || 'net'), ids: cache.lineup };
      return { v2: false, formation: '', slots: {}, captain: '', gk: '', err: '', ids: (l.data || []).map(x => x.player_id) };
    }
    return { ...prev, err: String(r.error.code || 'net'), ids: cache.lineup };
  }
  const serial = fn => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };
  const write = (name, args) => serial(async () => { const r = await rpc(name, args); if (typeof r !== 'string') return NET; if (r === '') await AD._refresh(); return r; });

  const AD = {
    init(cfg) {
      assertPublicKey(cfg.SUPABASE_PUBLISHABLE_KEY); assertUrl(cfg.SUPABASE_URL);
      sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
      sb.auth.onAuthStateChange((ev, session) => { if (!session) { reset(); emit(); } else if (ev === 'SIGNED_IN' || ev === 'TOKEN_REFRESHED') serial(() => AD._refresh()); });  // [v2]
      return AD;
    },
    on(f) { subs.push(f); },
    async signIn(email, password) { const { error } = await sb.auth.signInWithPassword({ email, password }); return error ? 'بيانات الدخول غير صحيحة' : ''; },
    async hasSession() { try { const { data } = await sb.auth.getSession(); return !!(data && data.session); } catch (_) { return false; } },   // جلسة محفوظة في المتصفح؟
    async signOut() { await sb.auth.signOut(); reset(); emit(); },
    refresh() { return serial(() => AD._refresh()); },
    async _refresh() {
      const [me, roster, stats] = await Promise.all([rpc('rpc_get_me'), rpc('rpc_get_roster'), rpc('rpc_get_stat_rows')]);
      // خطأ عابر (شبكة/مهلة/رمز قيد التجديد) لا يعني انتهاء الجلسة: لا نمسح الحالة ولا نُظهر شاشة الدخول؛ المستدعي يعيد المحاولة.
      if (typeof me === 'string') return 'err';
      if (!me) { reset(); emit(); return 'none'; }   // الخادم أجاب فعلًا: لا عضوية فعّالة لهذا الحساب
      const tid = me.team && me.team.id;
      const q = t => sb.from(t);
      const [pl, ct, st, mb, mt, ls, ss, at, lg, ph, sph] = await Promise.all([
        q('players').select('id,name,shirt_number,position,city,status'),
        q('player_contacts').select('player_id,phone,email'),
        q('staff_members').select('id,name,title,kind,staff_contacts(phone)'),
        q('team_members').select('user_id,display_name,role,active'),                                                    // [v2 F4]
        q('matches').select('id,opponent,match_date,is_home,played,opp_goals,officer_id,match_players(player_id,match_events(event_type,minute))').order('match_date'),
        readLineup(),
        q('training_sessions').select('id,title,session_date').order('session_date'),
        q('attendance').select('session_id,player_id,present'),
        q('audit_log').select('created_at,actor_name,actor_role,action,detail').order('created_at', { ascending: false }).limit(500),
        q('player_photos').select('id,player_id,storage_path,is_primary'),
        q('staff_photos').select('id,staff_id,storage_path')
      ]);
      cache.me = me;
      cache.roster = Array.isArray(roster) ? roster.map(p => ({ ...p, ...(p.pos ? { pos: POS[p.pos] } : {}), ...(p.status ? { status: STATUS[p.status] } : {}) })) : [];   // [v2 F5] names-only rows keep no pos/status
      cache.stats = Array.isArray(stats) ? stats.map(r => ({ ...r, pos: POS[r.pos], status: STATUS[r.status] })) : [];
      cache.contacts = Object.fromEntries((ct.data || []).map(c => [c.player_id, c]));
      cache.players = (pl.data || []).map(p => {                                                                            // [v2 F3]
        const o = { id: p.id, teamId: tid, name: p.name, num: p.shirt_number, pos: POS[p.position], city: p.city, status: STATUS[p.status] };
        const c = cache.contacts[p.id]; if (c) { o.phone = c.phone; o.email = c.email; }                                    // only when the server returned them
        return o;
      });
      cache.staff = (st.data || []).map(s => { const o = { id: s.id, teamId: tid, name: s.name, role: s.title, kind: KIND[s.kind] }; if (s.staff_contacts && s.staff_contacts[0]) o.phone = s.staff_contacts[0].phone; return o; });
      cache.members = (mb.data || []).filter(m => m.active).map(m => ({ id: m.user_id, name: m.display_name, role: m.role }));
      cache.matches = (mt.data || []).map(m => ({ id: m.id, opp: m.opponent, date: m.match_date, home: m.is_home, played: m.played, them: m.opp_goals, officer: m.officer_id, players: (m.match_players || []).map(x => x.player_id), events: (m.match_players || []).flatMap(x => (x.match_events || []).map(e => ({ pid: x.player_id, type: e.event_type, min: e.minute }))) }));   // الأحداث مرتبطة بجدول match_players فقط، لذا تُجلب متداخلة
      { const { ids, ...info } = ls; cache.lineup = ids; cache.lineupInfo = info; }
      cache.sessions = (ss.data || []).map(s => ({ id: s.id, title: s.title, date: s.session_date }));                    // [v2 F2]
      cache.att = {}; (at.data || []).forEach(a => { (cache.att[a.session_id] = cache.att[a.session_id] || {})[a.player_id] = a.present; });
      cache.logs = (lg.data || []).map(l => ({ t: l.created_at, who: l.actor_name, role: l.actor_role, a: l.action, d: l.detail }));
      cache.photos = ph.data || [];
      cache.staffPhotos = sph.data || [];
      AD._resolvePhotos();   // signed URLs are fetched after the first paint; avatars update on the next emit
      emit();
      return 'ok';
    },
    cache: () => cache,
    roster: () => cache.roster,                                         // [v2 F5] server-scoped list, used as is
    officers: () => cache.members.filter(m => m.role === 'officer' || m.role === 'secretary'),   // [v2 F4] empty for roles that may not read members
    // ---- writes ----
    savePlayer: p => {
      const x = { ...p, pos: POS_R[p.pos], status: STATUS_R[p.status] };
      if (!has(p, 'phone')) delete x.phone; if (!has(p, 'email')) delete x.email;                // never invent contact keys
      return write('rpc_save_player', { p: x });
    },
    delPlayer: id => write('rpc_delete_player', { p_id: id }),
    unregisterPlayer: id => write('rpc_unregister_player', { p_id: id }),
    saveStaff: s => { const x = { ...s, kind: KIND_R[s.kind] }; if (!has(s, 'phone')) delete x.phone; return write('rpc_save_staff', { s: x }); },
    async delStaff(id) { const old = AD.staffPhoto(id), r = await write('rpc_delete_staff', { p_id: id }); if (r === '' && old) sb.storage.from('player-photos').remove([old.storage_path]).catch(() => {}); return r; },
    saveMatch: m => write('rpc_save_match', { m }),
    addEvent: (mid, ev) => write('rpc_add_event', { p_match: mid, ev }),
    setResult: (mid, them, played) => write('rpc_set_result', { p_match: mid, p_them: them, p_played: played }),
    setStarters: ids => write('rpc_set_starters', { p_ids: ids }),
    // ---- مركز المدرب (0014): أسماء الدوال ومعاملاتها كما في ملف SQL حرفيًا؛ يتحقق منها tools/test_lineup_contract.js ----
    setFormation: f => write('rpc_set_formation', { p_formation: f }),
    setLineup: p => write('rpc_set_lineup', { p }),
    setCaptain: id => write('rpc_set_captain', { p_player: id }),
    setGoalkeeper: id => write('rpc_set_goalkeeper', { p_player: id }),
    saveSession: x => write('rpc_save_session', { s: x }),
    delSession: id => write('rpc_delete_session', { p_id: id }),
    setAtt: (sid, pid, v) => write('rpc_set_attendance', { p_session: sid, p_player: pid, p_present: v === true }),
    setPerm: (role, mod, v) => write('rpc_set_permission', { p_role: role, p_perm: mod, p_value: v }),
    saveTeam: t => write('rpc_save_team', { tm: t }),
    // ---- public-site settings (added for admin/live) ----
    // ---- roles & users (founder only; reads rely on RLS, writes on SECURITY DEFINER RPCs) ----
    async getRoles() {
      const [c, r] = await Promise.all([sb.from('permission_catalog').select('code,label_ar').order('code'), sb.from('role_permissions').select('role,permission')]);
      if (c.error || r.error) return null;
      const matrix = {}; (r.data || []).forEach(x => { (matrix[x.role] = matrix[x.role] || []).push(x.permission); });
      return { catalog: c.data || [], matrix };
    },
    async getMembers() {
      const { data, error } = await sb.from('team_members').select('user_id,display_name,role,active').order('created_at');
      return error ? null : (data || []);
    },
    setMemberRole: (uid, role) => write('rpc_set_member_role', { p_user: uid, p_role: role }),       // يتطلب 0008 (مراجعة)
    setMemberActive: (uid, active) => write('rpc_set_member_active', { p_user: uid, p_active: active === true }),
    addMemberByEmail: (email, name, role) => write('rpc_add_member_by_email', { p_email: email, p_name: name, p_role: role }),
    getSite: () => rpc('rpc_get_site'),
    getFinance: () => rpc('rpc_get_finance'),
    saveFinance: e => write('rpc_save_finance', { e }),
    delFinance: id => write('rpc_delete_finance', { p_id: id }),
    saveSite: s => write('rpc_save_site', { s }),
    // ---- بطاقة المطوّر (0017). قبل تطبيق 0017 يُرجِع getDeveloper نصًّا (FEATURE_OFF) فتعرض اللوحة رسالة بدل الأخطاء ----
    getDeveloper: () => rpc('rpc_get_developer'),
    saveDeveloper: s => write('rpc_save_developer', { s }),
    devPhotoUrl(path) { try { return path ? sb.storage.from('player-photos').getPublicUrl(path).data.publicUrl : ''; } catch (_) { return ''; } },
    async setDeveloperPhoto(file, oldPath) {
      const teamId = cache.me && cache.me.team && cache.me.team.id; if (!teamId) return DENY;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2097152) return 'نوع الصورة أو حجمها غير مقبول';
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type], path = `${teamId}/${teamId}/${crypto.randomUUID()}.${ext}`;
      const up = await sb.storage.from('player-photos').upload(path, file, { upsert: false, contentType: file.type });
      if (up.error) return String(up.error.statusCode) === '403' ? DENY : NET;
      const r = await write('rpc_set_developer_photo', { p_path: path, p_type: file.type, p_size: file.size });
      if (r !== '') await sb.storage.from('player-photos').remove([path]);
      else if (oldPath) await sb.storage.from('player-photos').remove([oldPath]);
      return r;
    },
    // ---- معرض الصور (0018) ----
    getGallery: () => rpc('rpc_get_gallery'),
    setGalleryVisible: v => write('rpc_set_gallery_visible', { p_visible: !!v }),
    async addGalleryPhoto(file, caption) {
      const teamId = cache.me && cache.me.team && cache.me.team.id; if (!teamId) return DENY;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2097152) return 'نوع الصورة أو حجمها غير مقبول';
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type], path = `${teamId}/${teamId}/${crypto.randomUUID()}.${ext}`;
      const up = await sb.storage.from('player-photos').upload(path, file, { upsert: false, contentType: file.type });
      if (up.error) return String(up.error.statusCode) === '403' ? DENY : NET;
      const r = await write('rpc_add_gallery_photo', { p_path: path, p_type: file.type, p_size: file.size, p_caption: caption || '' });
      if (r !== '') await sb.storage.from('player-photos').remove([path]);
      return r;
    },
    async deleteGalleryPhoto(id, path) {
      const r = await write('rpc_delete_gallery_photo', { p_id: id });
      if (r === '' && path) await sb.storage.from('player-photos').remove([path]);
      return r;
    },
    async delDeveloperPhoto(oldPath) {
      const r = await write('rpc_delete_developer_photo', {});
      if (r === '' && oldPath) await sb.storage.from('player-photos').remove([oldPath]);
      return r;
    },
    // ---- photos ----
    async uploadPhoto(playerId, file, primary) {
      const teamId = cache.me && cache.me.team && cache.me.team.id; if (!teamId) return DENY;                // [v2] team from the server context only
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2097152) return 'نوع الصورة أو حجمها غير مقبول';
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type], path = `${teamId}/${playerId}/${crypto.randomUUID()}.${ext}`;
      const up = await sb.storage.from('player-photos').upload(path, file, { upsert: false, contentType: file.type });
      if (up.error) return String(up.error.statusCode) === '403' ? DENY : NET;
      const r = await write('rpc_register_photo', { p_player: playerId, p_path: path, p_type: file.type, p_size: file.size, p_primary: !!primary });
      if (r !== '') await sb.storage.from('player-photos').remove([path]);
      return r;
    },
    async deletePhoto(photoId) {
      const ph = cache.photos.find(x => x.id === photoId); if (!ph) return 'الصورة غير موجودة';             // [v2] path comes from server rows
      const r = await write('rpc_delete_photo', { p_photo: photoId });
      if (r === '') await sb.storage.from('player-photos').remove([ph.storage_path]);
      return r;
    },
    staffPhoto(staffId) { return cache.staffPhotos.find(x => x.staff_id === staffId) || null; },
    async setStaffPhoto(staffId, file) {
      const teamId = cache.me && cache.me.team && cache.me.team.id; if (!teamId) return DENY;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2097152) return 'نوع الصورة أو حجمها غير مقبول';
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type], path = `${teamId}/${staffId}/${crypto.randomUUID()}.${ext}`, old = AD.staffPhoto(staffId);
      const up = await sb.storage.from('player-photos').upload(path, file, { upsert: false, contentType: file.type });
      if (up.error) return String(up.error.statusCode) === '403' ? DENY : NET;
      const r = await write('rpc_set_staff_photo', { p_staff: staffId, p_path: path, p_type: file.type, p_size: file.size });
      if (r !== '') await sb.storage.from('player-photos').remove([path]);
      else if (old) await sb.storage.from('player-photos').remove([old.storage_path]);
      return r;
    },
    async delStaffPhoto(staffId) {
      const old = AD.staffPhoto(staffId); if (!old) return '';
      const r = await write('rpc_delete_staff_photo', { p_staff: staffId });
      if (r === '') await sb.storage.from('player-photos').remove([old.storage_path]);
      return r;
    },
    async photoUrl(path) { const { data } = await sb.storage.from('player-photos').createSignedUrl(path, 3600); return data ? data.signedUrl : ''; },
    // primary photo row per player (server rows only); [] when the role may not read photos
    primaryPhoto(playerId) { const l = cache.photos.filter(x => x.player_id === playerId); return l.find(x => x.is_primary) || l[0] || null; },
    _applyPhotos() {
      const now = Date.now(), byPlayer = new Map();
      cache.photos.forEach(x => { const c = urlCache.get(x.storage_path); if (!c || c.exp < now) return; const cur = byPlayer.get(x.player_id); if (!cur || x.is_primary) byPlayer.set(x.player_id, c.url); });
      [cache.players, cache.roster].forEach(l => l.forEach(p => { if (byPlayer.has(p.id)) p.photo = byPlayer.get(p.id); }));
      cache.staffPhotos.forEach(x => { const c = urlCache.get(x.storage_path), m = cache.staff.find(y => y.id === x.staff_id); if (c && c.exp >= now && m) m.photo = c.url; });
    },
    _resolvePhotos() {
      AD._applyPhotos();                                                  // فورًا من الذاكرة: لا وميض
      const gen = ++photoGen, now = Date.now(), ids = [...new Set(cache.photos.map(x => x.player_id))];
      const need = ids.map(id => AD.primaryPhoto(id)).concat(cache.staffPhotos).filter(r => r && !(urlCache.get(r.storage_path) && urlCache.get(r.storage_path).exp - 300000 > now));
      if (!need.length) return;
      Promise.all(need.map(async r => { const u = await AD.photoUrl(r.storage_path); if (u) urlCache.set(r.storage_path, { url: u, exp: Date.now() + 3600000 }); })).then(() => {
        if (gen !== photoGen) return;                                      // تحديث أحدث حلّ محلّه
        AD._applyPhotos(); emit();
      }).catch(() => {});
    }
  };
  window.TeamData = Object.freeze(AD);
})();
