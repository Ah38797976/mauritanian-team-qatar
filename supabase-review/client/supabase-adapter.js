// ============================================================================
// REVIEW ONLY — NOT LOADED by index.html, NOT TESTED against a real project.
// Task 07: draft data layer that would replace the in-memory Store after approval.
// Rules it enforces on the client side (the REAL enforcement is RLS/RPC on the server):
//   • only the public (anon/publishable) key may be configured — secret keys are refused;
//   • no role/team/user id is ever sent as authority: the server derives them from the session;
//   • every write returns '' on success or an Arabic error string (same contract as Store.*).
// supabase-js must be loaded from a PINNED version (see docs/02) before this file.
// ============================================================================
(function () {
  'use strict';
  const DENY = 'غير مصرح بهذه العملية لدورك الحالي', NET = 'تعذّر الاتصال بالخادم، حاول لاحقًا';
  // English DB codes <-> Arabic labels used by the UI
  const POS = { gk: 'حارس', def: 'مدافع', mid: 'وسط', fwd: 'مهاجم' }, STATUS = { active: 'نشط', injured: 'مصاب', suspended: 'موقوف', unregistered: 'غير مسجّل' };
  const KIND = { technical: 'فني', administrative: 'إداري' };
  const inv = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]));
  const POS_R = inv(POS), STATUS_R = inv(STATUS), KIND_R = inv(KIND);

  // refuse anything that looks like a secret key (sb_secret_…, or a JWT whose role is service_role)
  function assertPublicKey(k) {
    if (!k || /^__SET/.test(k)) throw new Error('المفتاح العام غير مضبوط');
    if (/^sb_secret_/i.test(k)) throw new Error('مفتاح سري ممنوع في الواجهة');
    if (k.split('.').length === 3) {
      try { const r = JSON.parse(atob(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role; if (r && r !== 'anon') throw new Error('مفتاح غير عام (' + r + ') ممنوع في الواجهة'); }
      catch (e) { if (/ممنوع/.test(e.message)) throw e; }
    }
  }

  let sb = null, S = null;
  const cache = { me: null, roster: [], players: [], contacts: {}, staff: [], matches: [], lineup: [], sessions: [], att: {}, stats: [], logs: [], perms: {} };
  const subs = [];

  const rpc = async (name, args) => {
    try { const { data, error } = await sb.rpc(name, args || {}); if (error) return error.code === '42501' ? DENY : NET; return data; }
    catch (_) { return NET; }
  };
  const write = async (name, args) => { const r = await rpc(name, args); if (typeof r === 'string') { if (r === '') await AD.refresh(); return r; } return NET; };

  const AD = {
    init(cfg) {
      assertPublicKey(cfg.SUPABASE_PUBLISHABLE_KEY);
      sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
      return AD;
    },
    on(f) { subs.push(f); },
    // ---- auth (invite-only project: public sign-ups disabled in the dashboard) ----
    async signIn(email, password) { const { error } = await sb.auth.signInWithPassword({ email, password }); return error ? 'بيانات الدخول غير صحيحة' : ''; },
    async signOut() { await sb.auth.signOut(); cache.me = null; subs.forEach(f => f()); },
    // ---- scoped reads: each query is filtered by RLS / scoped RPC on the server ----
    async refresh() {
      const [me, roster, stats] = await Promise.all([rpc('rpc_get_me'), rpc('rpc_get_roster'), rpc('rpc_get_stat_rows')]);
      if (!me || typeof me === 'string') { cache.me = null; subs.forEach(f => f()); return; }
      cache.me = me; cache.roster = Array.isArray(roster) ? roster.map(p => ({ ...p, pos: POS[p.pos], status: STATUS[p.status] })) : [];
      cache.stats = Array.isArray(stats) ? stats.map(r => ({ ...r, pos: POS[r.pos], status: STATUS[r.status] })) : [];
      const q = t => sb.from(t);
      const [pl, ct, st, mt, ls, ss, at, lg] = await Promise.all([
        q('players').select('id,name,shirt_number,position,city,status'),
        q('player_contacts').select('player_id,phone,email'),
        q('staff_members').select('id,name,title,kind,staff_contacts(phone)'),
        q('matches').select('id,opponent,match_date,is_home,played,opp_goals,officer_id,match_players(player_id),match_events(player_id,event_type,minute)').order('match_date'),
        q('lineup_starters').select('player_id'),
        q('training_sessions').select('id,title,session_date').order('session_date'),
        q('attendance').select('session_id,player_id,present'),
        q('audit_log').select('created_at,actor_name,actor_role,action,detail').order('created_at', { ascending: false }).limit(500)
      ]);
      // RLS returns [] (not an error) for what the role may not read — the UI already handles empty scopes.
      cache.players = (pl.data || []).map(p => ({ id: p.id, name: p.name, num: p.shirt_number, pos: POS[p.position], city: p.city, status: STATUS[p.status] }));
      cache.contacts = Object.fromEntries((ct.data || []).map(c => [c.player_id, c]));
      cache.staff = (st.data || []).map(s => ({ id: s.id, name: s.name, role: s.title, kind: KIND[s.kind], phone: s.staff_contacts && s.staff_contacts[0] ? s.staff_contacts[0].phone : undefined }));
      cache.matches = (mt.data || []).map(m => ({ id: m.id, opp: m.opponent, date: m.match_date, home: m.is_home, played: m.played, them: m.opp_goals, officer: m.officer_id, players: m.match_players.map(x => x.player_id), events: m.match_events.map(e => ({ pid: e.player_id, type: e.event_type, min: e.minute })) }));
      cache.lineup = (ls.data || []).map(x => x.player_id);
      cache.sessions = ss.data || [];
      cache.att = {}; (at.data || []).forEach(a => { (cache.att[a.session_id] = cache.att[a.session_id] || {})[a.player_id] = a.present; });
      cache.logs = (lg.data || []).map(l => ({ t: l.created_at, who: l.actor_name, role: l.actor_role, a: l.action, d: l.detail }));
      subs.forEach(f => f());
    },
    cache: () => cache,
    // ---- writes: thin wrappers over RPCs; the server decides everything ----
    savePlayer: p => write('rpc_save_player', { p: { ...p, pos: POS_R[p.pos], status: STATUS_R[p.status] } }),
    delPlayer: id => write('rpc_delete_player', { p_id: id }),
    unregisterPlayer: id => write('rpc_unregister_player', { p_id: id }),
    saveStaff: s => write('rpc_save_staff', { s: { ...s, kind: KIND_R[s.kind] } }),
    delStaff: id => write('rpc_delete_staff', { p_id: id }),
    saveMatch: m => write('rpc_save_match', { m }),
    addEvent: (mid, ev) => write('rpc_add_event', { p_match: mid, ev }),
    setResult: (mid, them, played) => write('rpc_set_result', { p_match: mid, p_them: them, p_played: played }),
    setStarters: ids => write('rpc_set_starters', { p_ids: ids }),
    setAtt: (sid, pid, v) => write('rpc_set_attendance', { p_session: sid, p_player: pid, p_present: v === true }),
    setPerm: (role, mod, v) => write('rpc_set_permission', { p_role: role, p_perm: mod, p_value: v }),
    saveTeam: t => write('rpc_save_team', { tm: t }),
    // ---- photos: file goes to the PRIVATE bucket first, then metadata via RPC ----
    async uploadPhoto(teamId, playerId, file, primary) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2097152) return 'نوع الصورة أو حجمها غير مقبول';
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type], path = `${teamId}/${playerId}/${crypto.randomUUID()}.${ext}`;
      const up = await sb.storage.from('player-photos').upload(path, file, { upsert: false, contentType: file.type });
      if (up.error) return up.error.statusCode === '403' ? DENY : NET;
      const r = await write('rpc_register_photo', { p_player: playerId, p_path: path, p_type: file.type, p_size: file.size, p_primary: !!primary });
      if (r !== '') await sb.storage.from('player-photos').remove([path]);   // don't leave an orphan object
      return r;
    },
    async deletePhoto(photoId, path) { const r = await write('rpc_delete_photo', { p_photo: photoId }); if (r === '' && path) await sb.storage.from('player-photos').remove([path]); return r; },
    async photoUrl(path) { const { data } = await sb.storage.from('player-photos').createSignedUrl(path, 300); return data ? data.signedUrl : ''; }
  };
  window.TeamData = Object.freeze(AD);
})();
