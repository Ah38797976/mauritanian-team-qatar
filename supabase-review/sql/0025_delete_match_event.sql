-- 0025: حذف مباراة كاملة + حذف حدث واحد من مباراة (تصحيح الأخطاء).
-- NOT YET APPLIED. نفس عقد 0004: الفريق من الجلسة، SECURITY DEFINER، search_path='' ، تُرجع '' للنجاح أو نص خطأ عربي.
-- حذف المباراة: صلاحية 'matches' (المؤسس/من مُنحها). حذف الحدث: صلاحية 'stats' لتلك المباراة (كما في إدخال الحدث).
-- الحذف يُسجَّل في سجل العمليات. match_players وmatch_events تُحذف تلقائيًا مع المباراة (ON DELETE CASCADE).
begin;

create function public.rpc_delete_match(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); mt public.matches; n_ev int;
begin
  if t is null or not app.has_perm(t, 'matches') then return app.deny(); end if;
  select * into mt from public.matches x where x.id = p_id and x.team_id = t;
  if not found then return 'المباراة غير موجودة'; end if;
  select count(*) into n_ev from public.match_events e where e.match_id = mt.id;
  delete from public.matches where id = mt.id and team_id = t;   -- المشاركات والأحداث تُحذف معها
  perform app.log(t, 'حذف مباراة', format('%s — %s (وأُزيل %s حدث)', mt.opponent, mt.match_date, n_ev));
  return '';
end $$;

create function public.rpc_delete_event(p_id bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); ev public.match_events; mt public.matches; pl public.players; n_left int;
begin
  if t is null then return app.deny(); end if;
  select * into ev from public.match_events e where e.id = p_id and e.team_id = t;
  if not found then return 'الحدث غير موجود'; end if;
  select * into mt from public.matches x where x.id = ev.match_id and x.team_id = t;
  if not found then return 'المباراة غير موجودة'; end if;
  if not app.has_perm(t, 'stats', mt.id) then return app.deny(); end if;
  select * into pl from public.players x where x.id = ev.player_id and x.team_id = t;
  delete from public.match_events where id = ev.id;
  -- المشاركة تُنشأ فقط عند إدخال حدث؛ إن لم يبقَ للاعب أي حدث في هذه المباراة تُزال مشاركته حتى لا تبقى مشاركة وهمية
  select count(*) into n_left from public.match_events e where e.match_id = ev.match_id and e.player_id = ev.player_id;
  if n_left = 0 then delete from public.match_players where match_id = ev.match_id and player_id = ev.player_id; end if;
  perform app.log(t, 'حذف حدث مباراة',
    format('%s — %s (د %s) ضد %s', case ev.event_type when 'goal' then 'هدف' when 'yellow' then 'بطاقة صفراء' else 'بطاقة حمراء' end,
           coalesce(pl.name, '?'), ev.minute, mt.opponent));
  return '';
end $$;

revoke all on function public.rpc_delete_match(uuid), public.rpc_delete_event(bigint) from public, anon;
grant execute on function public.rpc_delete_match(uuid), public.rpc_delete_event(bigint) to authenticated;

commit;
