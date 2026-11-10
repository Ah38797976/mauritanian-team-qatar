-- 0023: تشكيلات إضافية (8 خطط جديدة). تستبدل app.formation_slots بالنسخة الحية + الخطط الجديدة فقط.
-- لا تغيير في الجداول؛ rpc_set_formation/rpc_set_lineup تتحقق من الخطة عبر هذه الدالة.
create or replace function app.formation_slots(p_f text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_f
    when '4-4-2'   then array['gk','def','def','def','def','mid','mid','mid','mid','fwd','fwd']
    when '4-3-3'   then array['gk','def','def','def','def','mid','mid','mid','fwd','fwd','fwd']
    when '3-5-2'   then array['gk','def','def','def','mid','mid','mid','mid','mid','fwd','fwd']
    when '4-2-3-1' then array['gk','def','def','def','def','mid','mid','mid','mid','mid','fwd']
    when '4-1-4-1' then array['gk','def','def','def','def','mid','mid','mid','mid','mid','fwd']
    when '4-5-1' then array['gk','def','def','def','def','mid','mid','mid','mid','mid','fwd']
    when '3-4-3' then array['gk','def','def','def','mid','mid','mid','mid','fwd','fwd','fwd']
    when '5-3-2' then array['gk','def','def','def','def','def','mid','mid','mid','fwd','fwd']
    when '5-4-1' then array['gk','def','def','def','def','def','mid','mid','mid','mid','fwd']
    when '4-3-2-1' then array['gk','def','def','def','def','mid','mid','mid','mid','mid','fwd']
    when '4-1-2-3' then array['gk','def','def','def','def','mid','mid','mid','fwd','fwd','fwd']
    when '3-4-1-2' then array['gk','def','def','def','mid','mid','mid','mid','mid','fwd','fwd']
  end $$;
