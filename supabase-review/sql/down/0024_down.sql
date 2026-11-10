-- تنبيه: يفشل إن وُجدت تشكيلة محفوظة بخطة جديدة؛ غيّرها إلى خطة أصلية أولًا.
alter table public.lineups drop constraint lineups_formation_chk;
alter table public.lineups add constraint lineups_formation_chk check (formation in ('4-4-2','4-3-3','3-5-2','4-2-3-1'));
