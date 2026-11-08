// MOCK of the Supabase JS client for the offline UI test (tools/test_lineup_ui.py). Not shipped; never talks to a network.
// It re-implements the 0014 lineup rules only as far as needed to exercise the UI; the REAL rules are tested in SQL (60_lineup_advanced.sql).
(function () {
  const init = window.__mockInit || {};
  const M = window.__mock = Object.assign({ role: 'coach', perms: ['viewPlayers', 'lineup', 'attendance', 'viewStaff'], v2: true, delay: 0, reject: null, lineupReadError: null, calls: [], reads: [] }, init);
  const F = { '4-4-2': 'gk,def,def,def,def,mid,mid,mid,mid,fwd,fwd', '4-3-3': 'gk,def,def,def,def,mid,mid,mid,fwd,fwd,fwd', '3-5-2': 'gk,def,def,def,mid,mid,mid,mid,mid,fwd,fwd', '4-2-3-1': 'gk,def,def,def,def,mid,mid,mid,mid,mid,fwd' };
  const slots = f => F[f].split(',');
  const ok = (sc, pc) => (sc === 'gk' || pc === 'gk') ? sc === pc : (sc === pc || sc === 'mid' || pc === 'mid');
  const P = [['gk1', 'حارس أول', 1, 'gk'], ['gk2', 'حارس ثان', 12, 'gk'], ['d1', 'مدافع ١', 2, 'def'], ['d2', 'مدافع ٢', 3, 'def'], ['d3', 'مدافع ٣', 4, 'def'], ['d4', 'مدافع ٤', 5, 'def'], ['d5', 'مدافع ٥', 15, 'def'], ['d6', 'مدافع ٦ (مصاب)', 16, 'def', 'injured'],
    ['m1', 'وسط ١', 6, 'mid'], ['m2', 'وسط ٢', 8, 'mid'], ['m3', 'وسط ٣', 10, 'mid'], ['m4', 'وسط ٤', 14, 'mid'], ['m5', 'وسط ٥', 17, 'mid'], ['m6', 'وسط ٦', 18, 'mid'], ['m7', 'وسط ٧', 19, 'mid'], ['f1', 'مهاجم ١', 9, 'fwd']];
  const DB = M.db = { formation: init.formation || '4-4-2', players: P.map(([id, name, n, pos, st]) => ({ id, name, shirt_number: n, position: pos, city: 'الدوحة', status: st || 'active' })),
    starters: init.starters || [['gk1', 1], ['d1', 2], ['d2', 3], ['d3', 4], ['d4', 5], ['m1', 6], ['m2', 7], ['m3', 8], ['m4', 9], ['f1', 10], ['m5', 11]].map(([player_id, slot]) => ({ player_id, slot, is_captain: player_id === 'd1', is_goalkeeper: player_id === 'gk1' })) };
  const DEV = M.dev = Object.assign({ name: '', title: '', bio: '', photo: null, visible: false }, init.dev || {});
  const GAL = M.gal = { visible: false, n: 0, photos: [], ...(init.gal || {}) };
  const pl = id => DB.players.find(p => p.id === id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rows = t => {
    if (t === 'players') return DB.players;
    if (t === 'lineups') return [{ formation: DB.formation }];
    if (t === 'matches') return [{ id: 'm1', opponent: 'نادي الريان للجاليات', match_date: '2026-11-10', is_home: true, played: false, opp_goals: null, officer_id: 'u3', match_players: [{ player_id: 'gk1', match_events: [] }, { player_id: 'd1', match_events: [] }] }, { id: 'm2', opponent: 'فريق السودان', match_date: '2026-10-27', is_home: false, played: true, opp_goals: 1, officer_id: null, match_players: [{ player_id: 'm1', match_events: [{ event_type: 'goal', minute: 61 }] }, { player_id: 'f1', match_events: [{ event_type: 'goal', minute: 23 }] }] }];
    if (t === 'staff_members') return [{ id: 's1', name: 'المدرب العام (تجريبي)', title: 'مدرب', kind: 'coach', staff_contacts: [{ phone: '+97450000000' }] }, { id: 's2', name: 'مدير إداري (تجريبي)', title: 'إداري', kind: 'admin', staff_contacts: [] }];
    if (t === 'training_sessions') return [{ id: 'ts1', title: 'تدريب الخميس', session_date: '2026-11-05' }];
    if (t === 'audit_log') return [{ created_at: '2026-11-07T07:00:00Z', actor_name: 'مدير إداري (تجريبي)', actor_role: 'admin', action: 'تعديل لاعب', detail: 'تغيير رقم القميص من 7 إلى 10' }, { created_at: '2026-11-06T18:20:00Z', actor_name: 'مدرب (تجريبي)', actor_role: 'coach', action: 'تعديل التشكيلة', detail: '' }];
    if (t === 'team_members') return [{ user_id: 'u1', display_name: 'مدير إداري (تجريبي)', role: 'admin', active: true }, { user_id: 'u2', display_name: 'مدرب (تجريبي)', role: 'coach', active: true }, { user_id: 'u3', display_name: 'مسؤول مباراة 1 (تجريبي)', role: 'officer', active: false }, { user_id: 'u4', display_name: 'المؤسس', role: 'founder', active: true }];
    return [];
  };
  function writeRpc(name, a) {
    if (M.reject) return M.reject;
    const st = DB.starters;
    if (name === 'rpc_set_lineup') {
      const p = a.p, sl = slots(p.formation || DB.formation), seenS = new Set(), seenP = new Set(), next = [];
      if (!sl) return 'خطة غير مدعومة';
      for (const e of p.slots) {
        const x = pl(e.player); if (!x) return 'لاعب غير موجود في التشكيلة'; if (x.status !== 'active') return 'لا يمكن إضافة لاعب غير نشط إلى التشكيلة';
        if (seenS.has(e.slot) || seenP.has(e.player)) return 'تكرار في الخانات أو اللاعبين'; seenS.add(e.slot); seenP.add(e.player);
        if (!ok(sl[e.slot - 1], x.position)) return 'مركز ' + x.name + ' لا يناسب هذه الخانة';
        next.push({ player_id: e.player, slot: e.slot, is_captain: false, is_goalkeeper: x.position === 'gk' });
      }
      const cap = (st.find(s => s.is_captain) || {}).player_id; const c = next.find(s => s.player_id === cap); if (c) c.is_captain = true;
      DB.formation = p.formation || DB.formation; DB.starters = next; return '';
    }
    if (name === 'rpc_set_formation') {
      if (!F[a.p_formation]) return 'خطة غير مدعومة'; DB.formation = a.p_formation; const sl = slots(a.p_formation), used = new Set(), keep = [];
      [...st].sort((x, y) => ['gk', 'def', 'mid', 'fwd'].indexOf(pl(x.player_id).position) - ['gk', 'def', 'mid', 'fwd'].indexOf(pl(y.player_id).position)).forEach(s => {
        const pc = pl(s.player_id).position; let i = sl.findIndex((c, k) => !used.has(k + 1) && c === pc); if (i < 0) i = sl.findIndex((c, k) => !used.has(k + 1) && ok(c, pc));
        if (i >= 0) { used.add(i + 1); keep.push({ ...s, slot: i + 1 }); }
      }); DB.starters = keep; return '';
    }
    if (name === 'rpc_set_captain') {
      if (a.p_player === null) { st.forEach(s => { s.is_captain = false; }); return ''; }
      const s = st.find(x => x.player_id === a.p_player); if (!s) return 'القائد يجب أن يكون من الأساسيين'; if (pl(a.p_player).status !== 'active') return 'لا يمكن تعيين لاعب غير نشط قائدًا';
      st.forEach(x => { x.is_captain = false; }); s.is_captain = true; return '';
    }
    if (name === 'rpc_set_goalkeeper') {
      const x = pl(a.p_player); if (!x || x.position !== 'gk') return 'الحارس يجب أن يكون بمركز حارس';
      DB.starters = st.filter(s => pl(s.player_id).position !== 'gk' || s.player_id === x.id); if (!DB.starters.some(s => s.player_id === x.id)) DB.starters.push({ player_id: x.id, slot: 1, is_captain: false, is_goalkeeper: true }); return '';
    }
    if (name === 'rpc_save_developer') { if (!a.s.name.trim() && a.s.visible) return 'اكتب الاسم قبل إظهار القسم في الموقع'; Object.assign(DEV, { name: a.s.name, title: a.s.title, bio: a.s.bio, visible: a.s.visible }); return ''; }
    if (name === 'rpc_set_developer_photo') { DEV.photo = a.p_path; return ''; }
    if (name === 'rpc_delete_developer_photo') { DEV.photo = null; return ''; }
    if (name === 'rpc_set_gallery_visible') { GAL.visible = a.p_visible; return ''; }
    if (name === 'rpc_add_gallery_photo') { if (GAL.photos.length >= 40) return 'وصلت إلى الحد الأقصى (40 صورة). احذف صورة قبل إضافة أخرى'; GAL.photos.unshift({ id: 'g' + (++GAL.n), path: a.p_path, caption: a.p_caption }); return ''; }
    if (name === 'rpc_delete_gallery_photo') { GAL.photos = GAL.photos.filter(x => x.id !== a.p_id); return ''; }
    return '';
  }
  const rpcImpl = async (name, a) => {
    if (M.delay) await sleep(M.delay);
    if (name === 'rpc_get_me') { M.meCalls = (M.meCalls || 0) + 1; if (M.meFail === 'always' || M.meCalls <= (+M.meFail || 0)) return { data: null, error: { code: '', message: 'network' } }; if (M.noMember) return { data: null, error: null }; }
    if (name === 'rpc_get_me') return { data: { role: M.role, perms: M.perms, display_name: 'مستخدم تجريبي', team: { id: 't1', name: 'فريق تجريبي', city: 'الدوحة', color: '#0b6b3a' } }, error: null };
    if (name === 'rpc_get_roster') return { data: DB.players.map(p => ({ id: p.id, name: p.name, num: p.shirt_number, pos: p.position, status: p.status })), error: null };
    if (name === 'rpc_get_stat_rows') return { data: [], error: null };
    M.calls.push({ name, args: JSON.parse(JSON.stringify(a || {})) });
    if (name === 'rpc_get_gallery') return M.galMissing ? { data: null, error: { code: 'PGRST202', message: 'missing' } } : { data: JSON.parse(JSON.stringify({ visible: GAL.visible, photos: GAL.photos })), error: null };
    if (name === 'rpc_push_stats') return M.pushMissing ? { data: null, error: { code: 'PGRST202', message: 'missing' } } : { data: { subscribers: M.pushSubs == null ? 3 : M.pushSubs, recent: M.pushRecent || [] }, error: null };
    if (name === 'rpc_get_developer') return M.devMissing ? { data: null, error: { code: 'PGRST202', message: 'missing' } } : { data: { ...DEV }, error: null };
    if (M.missingRpc) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
    if (M.rpcError) return { data: null, error: M.rpcError };
    return { data: writeRpc(name, a || {}), error: null };
  };
  const builder = t => ({ cols: '', select(c) { this.cols = c || ''; return this; }, order() { return this; }, limit() { return this; },
    then(res, rej) {
      return (async () => {
        if (M.delay) await sleep(M.delay);
        M.reads.push({ t, cols: this.cols });
        if (t === 'lineup_starters') {
          if (M.lineupReadError) return { data: null, error: M.lineupReadError };
          if (!M.v2 && /slot|is_captain|is_goalkeeper/.test(this.cols)) return { data: null, error: { code: '42703', message: 'column lineup_starters.slot does not exist' } };
          return { data: DB.starters.map(s => M.v2 ? s : { player_id: s.player_id }), error: null };
        }
        return { data: rows(t), error: null };
      })().then(res, rej);
    } });
  window.supabase = { createClient: () => ({ auth: { signInWithPassword: async () => ({ error: null }), signOut: async () => { window.__signedOut = true; return {}; }, getSession: async () => ({ data: { session: M.noSession || window.__signedOut ? null : { user: { id: 'u1' } } } }), onAuthStateChange: () => {} }, from: builder, rpc: rpcImpl, functions: { invoke: async (n, o) => { (M.invokes = M.invokes || []).push({ n, body: o && o.body }); if (M.invokeErr) return { data: null, error: { name: 'FunctionsHttpError', message: 'x', context: { json: async () => ({ err: M.invokeErr }) } } }; return { data: { ok: true, sent: 2, failed: 1, total: 3, removed: 0 }, error: null }; } }, storage: { from: () => ({ createSignedUrl: async () => ({ data: null }), upload: async (path, file) => { (M.uploads = M.uploads || []).push({ path, type: file.type, size: file.size }); return { error: null }; }, remove: async paths => { (M.removed = M.removed || []).push(...paths); return { error: null }; }, getPublicUrl: path => ({ data: { publicUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' } }) }) } }) };
})();
