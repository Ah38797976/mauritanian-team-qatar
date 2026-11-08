-- 0019: إشعارات الدفع (Web Push) للموقع العام. الزائر يشترك من متصفحه، والإرسال من لوحة التحكم عبر Edge Function (push-send).
-- NOT APPLIED. يُطبَّق على staging فقط بعد موافقة صريحة. إضافة فقط: لا يغيّر أي جدول أو دالة موجودة.
-- - push_subscriptions: عنوان الاشتراك (endpoint) ومفتاحاه العامان فقط، بلا اسم أو هاتف أو أي بيان شخصي. بلا وصول مباشر (RLS بلا سياسات)؛ الدالة الخارجية تقرؤها بمفتاح service_role.
-- - الاشتراك مفتوح للزائر (anon) لكن: endpoint يجب أن يكون https ومن خدمات الدفع المعروفة فقط، وحد أقصى 3000 اشتراك.
-- - الإرسال بصلاحية 'settings' فقط، ومحدّد بتنبيه واحد كل 30 ثانية للفريق، وكل تنبيه يُسجَّل باسم المرسل.
begin;

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams(id) on delete cascade,
  endpoint   text not null unique check (char_length(endpoint) between 20 and 700),
  p256dh     text not null check (char_length(p256dh) between 20 and 200),
  auth       text not null check (char_length(auth) between 8 and 100),
  created_at timestamptz not null default now(),
  fails      integer not null default 0
);
create table public.push_messages (
  id          bigint generated always as identity primary key,
  team_id     uuid not null references public.teams(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 60),
  body        text not null check (char_length(body) between 1 and 160),
  url         text not null default '/' check (char_length(url) <= 200),
  sender_id   uuid,
  sender_name text not null default '',
  created_at  timestamptz not null default now(),
  sent        integer,
  failed      integer
);
alter table public.push_subscriptions enable row level security;
alter table public.push_messages enable row level security;
revoke all on public.push_subscriptions, public.push_messages from anon, authenticated;
comment on table public.push_subscriptions is 'Web Push subscriptions (anonymous). No direct access: rpc_push_subscribe / rpc_push_unsubscribe; read by the push-send Edge Function with service_role.';

create or replace function public.rpc_push_subscribe(p jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare t public.teams; e text; k1 text; k2 text;
begin
  if jsonb_typeof(p) is distinct from 'object' then return 'بيانات غير صالحة'; end if;
  e := p->>'endpoint'; k1 := p->>'p256dh'; k2 := p->>'auth';
  if e is null or k1 is null or k2 is null then return 'بيانات غير صالحة'; end if;
  if e !~ '^https://(fcm\.googleapis\.com|[a-z0-9.-]+\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)/' then return 'خدمة الإشعارات غير مدعومة'; end if;
  if k1 !~ '^[A-Za-z0-9_-]{20,200}$' or k2 !~ '^[A-Za-z0-9_-]{8,100}$' then return 'بيانات غير صالحة'; end if;
  select * into t from public.teams order by created_at limit 1;
  if not found then return 'تعذّر الاشتراك الآن'; end if;
  if (select count(*) from public.push_subscriptions) >= 3000 and not exists (select 1 from public.push_subscriptions where endpoint = e) then return 'تعذّر الاشتراك الآن'; end if;
  insert into public.push_subscriptions(team_id, endpoint, p256dh, auth) values (t.id, e, k1, k2)
    on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, fails = 0;
  return '';
exception when check_violation then return 'بيانات غير صالحة';
end $$;

create or replace function public.rpc_push_unsubscribe(p_endpoint text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if p_endpoint is null or char_length(p_endpoint) > 700 then return ''; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  return '';
end $$;

-- تفويض الإرسال: يستدعيها push-send بتوكن المستخدم. تتحقق من الصلاحية والمدخلات والمعدّل وتسجّل التنبيه، وترجع jsonb: {"err": "..."} أو {"id","title","body","url"}
create or replace function public.rpc_push_authorize(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_team(); v_title text; v_body text; v_url text; v_name text; v_id bigint;
begin
  if t is null or not app.has_perm(t, 'settings') then return jsonb_build_object('err', app.deny()); end if;
  if jsonb_typeof(p) is distinct from 'object' then return jsonb_build_object('err', 'بيانات غير صالحة'); end if;
  v_title := btrim(coalesce(p->>'title', '')); v_body := btrim(coalesce(p->>'body', '')); v_url := btrim(coalesce(nullif(p->>'url', ''), '/'));
  if char_length(v_title) not between 1 and 60 then return jsonb_build_object('err', 'عنوان التنبيه مطلوب (حتى 60 حرفًا)'); end if;
  if char_length(v_body) not between 1 and 160 then return jsonb_build_object('err', 'نص التنبيه مطلوب (حتى 160 حرفًا)'); end if;
  if v_url !~ '^/[A-Za-z0-9_./#?=&%-]{0,199}$' then return jsonb_build_object('err', 'الرابط يجب أن يكون مسارًا داخل الموقع مثل /'); end if;
  if exists (select 1 from public.push_messages where team_id = t and created_at > now() - interval '30 seconds') then return jsonb_build_object('err', 'انتظر 30 ثانية قبل إرسال تنبيه آخر'); end if;
  select display_name into v_name from public.team_members where user_id = auth.uid() and team_id = t;
  insert into public.push_messages(team_id, title, body, url, sender_id, sender_name) values (t, v_title, v_body, v_url, auth.uid(), coalesce(v_name, '')) returning id into v_id;
  perform app.log(t, 'إرسال تنبيه للجمهور', left(v_title, 60));
  return jsonb_build_object('id', v_id, 'title', v_title, 'body', v_body, 'url', v_url);
end $$;

create or replace function public.rpc_push_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t uuid := app.my_team();
begin
  if t is null or not app.has_perm(t, 'settings') then return null; end if;
  return jsonb_build_object(
    'subscribers', (select count(*) from public.push_subscriptions where team_id = t),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('title', title, 'body', body, 'at', created_at, 'sent', sent, 'failed', failed, 'by', sender_name) order by created_at desc)
                          from (select * from public.push_messages where team_id = t order by created_at desc limit 5) x), '[]'::jsonb));
end $$;

revoke all on function public.rpc_push_subscribe(jsonb), public.rpc_push_unsubscribe(text), public.rpc_push_authorize(jsonb), public.rpc_push_stats() from public, anon, authenticated;
grant execute on function public.rpc_push_subscribe(jsonb), public.rpc_push_unsubscribe(text) to anon, authenticated;
grant execute on function public.rpc_push_authorize(jsonb), public.rpc_push_stats() to authenticated;

commit;
