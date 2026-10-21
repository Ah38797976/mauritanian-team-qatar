// ============================================================================
// REVIEW ONLY — NOT LOADED by index.html, NOT TESTED against a real project.
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
  const cache = { me: null, roster: [], players: [], contacts: {}, staff: [], members: [], matches: [], lineup: [], sessions: [], att: {}, stats: [], logs: [], photos: [] };
  const subs = [], emit = () => subs.forEach(f => f());
  const reset = () => { Object.assign(cache, { me: null, roster: [], players: [], contacts: {}, staff: [], members: [], matches: [], lineup: [], sessions: [], att: {}, stats: [], logs: [], photos: [] }); };

  const rpc = async (name, args) => {
    try { const { data, error } = await sb.rpc(name, args || {}); if (error) return error.code === '42501' ? DENY : NET; return data; }
    catch (_) { return NET; }
  };
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
    async signOut() { await sb.auth.signOut(); reset(); emit(); },
    refresh() { return serial(() => AD._refresh()); },
    async _refresh() {
      const [me, roster, stats] = await Promise.all([rpc('rpc_get_me'), rpc('rpc_get_roster'), rpc('rpc_get_stat_rows')]);
      if (!me || typeof me === 'string') { reset(); emit(); return; }
      const tid = me.team && me.team.id;
      const q = t => sb.from(t);
      const [pl, ct, st, mb, mt, ls, ss, at, lg, ph] = await Promise.all([
        q('players').select('id,name,shirt_number,position,city,status'),
        q('player_contacts').select('player_id,phone,email'),
        q('staff_members').select('id,name,title,kind,staff_contacts(phone)'),
        q('team_members').select('user_id,display_name,role,active'),                                                    // [v2 F4]
        q('matches').select('id,opponent,match_date,is_home,played,opp_goals,officer_id,match_players(player_id),match_events(player_id,event_type,minute)').order('match_date'),
        q('lineup_starters').select('player_id'),
        q('training_sessions').select('id,title,session_date').order('session_date'),
        q('attendance').select('session_id,player_id,present'),
        q('audit_log').select('created_at,actor_name,actor_role,action,detail').order('created_at', { ascending: false }).limit(500),
        q('player_photos').select('id,player_id,storage_path,is_primary')
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
      cache.matches = (mt.data || []).map(m => ({ id: m.id, opp: m.opponent, date: m.match_date, home: m.is_home, played: m.played, them: m.opp_goals, officer: m.officer_id, players: m.match_players.map(x => x.player_id), events: m.match_events.map(e => ({ pid: e.player_id, type: e.event_type, min: e.minute })) }));
      cache.lineup = (ls.data || []).map(x => x.player_id);
      cache.sessions = (ss.data || []).map(s => ({ id: s.id, title: s.title, date: s.session_date }));                    // [v2 F2]
      cache.att = {}; (at.data || []).forEach(a => { (cache.att[a.session_id] = cache.att[a.session_id] || {})[a.player_id] = a.present; });
      cache.logs = (lg.data || []).map(l => ({ t: l.created_at, who: l.actor_name, role: l.actor_role, a: l.action, d: l.detail }));
      cache.photos = ph.data || [];
      emit();
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
    delStaff: id => write('rpc_delete_staff', { p_id: id }),
    saveMatch: m => write('rpc_save_match', { m }),
    addEvent: (mid, ev) => write('rpc_add_event', { p_match: mid, ev }),
    setResult: (mid, them, played) => write('rpc_set_result', { p_match: mid, p_them: them, p_played: played }),
    setStarters: ids => write('rpc_set_starters', { p_ids: ids }),
    setAtt: (sid, pid, v) => write('rpc_set_attendance', { p_session: sid, p_player: pid, p_present: v === true }),
    setPerm: (role, mod, v) => write('rpc_set_permission', { p_role: role, p_perm: mod, p_value: v }),
    saveTeam: t => write('rpc_save_team', { tm: t }),
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
    async photoUrl(path) { const { data } = await sb.storage.from('player-photos').createSignedUrl(path, 300); return data ? data.signedUrl : ''; }
  };
  window.TeamData = Object.freeze(AD);
})();
