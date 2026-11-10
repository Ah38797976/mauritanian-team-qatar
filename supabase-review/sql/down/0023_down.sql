-- يعيد الخطط الأربع الأصلية فقط. تنبيه: أي تشكيلة محفوظة بخطة جديدة ستصبح غير صالحة؛ غيّرها إلى خطة أصلية قبل التراجع.
create or replace function app.formation_slots(p_f text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_f
    when '4-4-2'   then array['gk','def','def','def','def','mid','mid','mid','mid','fwd','fwd']
    when '4-3-3'   then array['gk','def','def','def','def','mid','mid','mid','fwd','fwd','fwd']
    when '3-5-2'   then array['gk','def','def','def','mid','mid','mid','mid','mid','fwd','fwd']
    when '4-2-3-1' then array['gk','def','def','def','def','mid','mid','mid','mid','mid','fwd']
  end $$;
