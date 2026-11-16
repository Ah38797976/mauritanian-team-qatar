-- 0029: قسم «التنبيهات» في الموقع العام — يعرض التنبيهات المرسلة (0019) ليفتحه من يضغط على الإشعار.
-- APPLIED على mauritanian-team-qatar-staging فقط (2026-11-17). لم يُطبَّق على الإنتاج بعد — يحتاج موافقة صريحة (ويحتاج 0019 قبله).
-- يعتمد على 0019. إضافة فقط: دالة قراءة واحدة بلا جداول جديدة ولا تغيير في أي دالة موجودة.
-- - تُرجع آخر 20 تنبيهًا خلال 60 يومًا: العنوان والنص والوقت والمسار الداخلي فقط. لا اسم مرسل ولا أعداد وصول/فشل.
-- - تُرجع أيضًا id لكل تنبيه ليحفظ كل جهاز ما شاهده (الموقع يخفي التنبيه بعد مشاهدته على ذلك الجهاز، ويبقيه ثابتًا في أعلى الصفحة ما لم يُفتح).
-- - تُعرض فقط التنبيهات المرسلة بعد 2026-11-17 00:00 بتوقيت قطر، فلا تظهر التنبيهات التجريبية القديمة.
-- - هذه التنبيهات وصلت أصلًا لأي زائر اشترك (الاشتراك مفتوح للجميع)، فعرضها لا يكشف ما لم يكن عامًا.
begin;

create or replace function public.rpc_public_notices() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.teams;
begin
  select * into t from public.teams order by created_at limit 1;
  if not found then return null; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'body', x.body, 'at', x.created_at, 'url', x.url) order by x.created_at desc, x.id desc)
    from (select * from public.push_messages where team_id = t.id and created_at >= timestamptz '2026-11-16 21:00:00+00' and created_at > now() - interval '60 days' order by created_at desc, id desc limit 20) x
  ), '[]'::jsonb);
end $$;

revoke all on function public.rpc_public_notices() from public, anon, authenticated;
grant execute on function public.rpc_public_notices() to anon, authenticated;

commit;
