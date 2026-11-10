-- 0024: قيد lineups_formation_chk كان يسمح بأربع خطط فقط فيرفض الخطط الجديدة (0023 وحدها لا تكفي).
-- يُستبدل بقيد يطابق app.formation_slots (12 خطة). القيد الآخر lineups_formation_check (الصيغة) يبقى.
alter table public.lineups drop constraint lineups_formation_chk;
alter table public.lineups add constraint lineups_formation_chk
  check (formation in ('4-4-2','4-3-3','3-5-2','4-2-3-1','4-1-4-1','4-5-1','3-4-3','5-3-2','5-4-1','4-3-2-1','4-1-2-3','3-4-1-2'));
