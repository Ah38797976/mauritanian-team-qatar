-- APPLIED to staging (ddrbrskusreoktqabkvi) on 2026-11-05.   0011: finance ledger (income / expenses), QAR.
-- Visible/editable only with permission 'finance' (founder + treasurer; admin's grant removed below per owner's decision).
-- No direct table access: RLS enabled with no policies; everything goes through the three RPCs.
-- Audit log never records amounts (audit viewers must not learn the numbers): only the kind and category.
begin;

create table public.finance_entries (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  kind        text not null check (kind in ('income','expense')),
  amount      numeric(12,2) not null check (amount > 0 and amount <= 10000000),
  entry_date  date not null,
  category    text not null default '' check (char_length(category) <= 40),
  note        text not null default '' check (char_length(note) <= 200),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (team_id, id)
);
create index finance_entries_team_date_idx on public.finance_entries (team_id, entry_date desc, created_at desc);
alter table public.finance_entries enable row level security;
revoke all on public.finance_entries from anon, authenticated;
comment on table public.finance_entries is 'Finance ledger per team. No direct access: read/written only through rpc_get_finance / rpc_save_finance / rpc_delete_finance.';

create function public.rpc_get_finance() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t uuid := app.my_team();
begin
  if t is null or not app.has_perm(t, 'finance') then return null; end if;
  return jsonb_build_object(
    'entries', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'amount', e.amount, 'date', e.entry_date, 'category', e.category, 'note', e.note)
                         order by e.entry_date desc, e.created_at desc)
                         from (select * from public.finance_entries where team_id = t order by entry_date desc, created_at desc limit 1000) e), '[]'::jsonb),
    'income',  coalesce((select sum(amount) from public.finance_entries where team_id = t and kind = 'income'), 0),
    'expense', coalesce((select sum(amount) from public.finance_entries where team_id = t and kind = 'expense'), 0));
end $$;

create function public.rpc_save_finance(e jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); v_id uuid; v_kind text; v_amt numeric; v_date date; v_cat text; v_note text;
begin
  if t is null or not app.has_perm(t, 'finance') then return app.deny(); end if;
  if e is null or jsonb_typeof(e) is distinct from 'object' then return 'بيانات غير صالحة'; end if;
  v_kind := e->>'kind';
  if v_kind is null or v_kind not in ('income','expense') then return 'نوع المعاملة غير صالح'; end if;
  if coalesce(e->>'amount', '') !~ '^\d{1,8}(\.\d{1,2})?$' then return 'المبلغ غير صالح (أرقام فقط، حتى خانتين عشريتين)'; end if;
  v_amt := (e->>'amount')::numeric;
  if v_amt <= 0 or v_amt > 10000000 then return 'المبلغ خارج النطاق المسموح'; end if;
  if coalesce(e->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then return 'تاريخ غير صالح'; end if;
  begin v_date := (e->>'date')::date; exception when others then return 'تاريخ غير صالح'; end;
  if v_date < current_date - 1825 or v_date > current_date + 365 then return 'التاريخ خارج النطاق المسموح'; end if;
  v_cat := btrim(coalesce(e->>'category', '')); v_note := btrim(coalesce(e->>'note', ''));
  if char_length(v_cat) > 40 then return 'التصنيف أطول من 40 حرفًا'; end if;
  if char_length(v_note) > 200 then return 'الملاحظة أطول من 200 حرفًا'; end if;
  if coalesce(e->>'id', '') <> '' then
    begin v_id := (e->>'id')::uuid; exception when others then return 'معرّف غير صالح'; end;
    update public.finance_entries set kind = v_kind, amount = v_amt, entry_date = v_date, category = v_cat, note = v_note
      where id = v_id and team_id = t;
    if not found then return 'المعاملة غير موجودة'; end if;
    perform app.log(t, 'تعديل معاملة مالية', case v_kind when 'income' then 'إيراد' else 'مصروف' end || case when v_cat <> '' then ' — ' || v_cat else '' end);
  else
    insert into public.finance_entries(team_id, kind, amount, entry_date, category, note, created_by) values (t, v_kind, v_amt, v_date, v_cat, v_note, (select auth.uid()));
    perform app.log(t, 'إضافة معاملة مالية', case v_kind when 'income' then 'إيراد' else 'مصروف' end || case when v_cat <> '' then ' — ' || v_cat else '' end);
  end if;
  return '';
end $$;

create function public.rpc_delete_finance(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); x public.finance_entries;
begin
  if t is null or not app.has_perm(t, 'finance') then return app.deny(); end if;
  select * into x from public.finance_entries where id = p_id and team_id = t;
  if not found then return 'المعاملة غير موجودة'; end if;
  delete from public.finance_entries where id = x.id;
  perform app.log(t, 'حذف معاملة مالية', case x.kind when 'income' then 'إيراد' else 'مصروف' end);
  return '';
end $$;

revoke all on function public.rpc_get_finance(), public.rpc_save_finance(jsonb), public.rpc_delete_finance(uuid) from public, anon;
grant execute on function public.rpc_get_finance(), public.rpc_save_finance(jsonb), public.rpc_delete_finance(uuid) to authenticated;

-- owner's decision: only treasurer (+ founder, who bypasses) see finance
delete from public.role_permissions where permission = 'finance' and role <> 'treasurer';

commit;
