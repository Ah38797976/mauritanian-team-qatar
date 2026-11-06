# live-v3 — تغييرات عن live-v2 (محلي، غير مختبَر على خادم حقيقي)
- admin/live/live-app.js: حقل الصورة في نموذج «تعديل لاعب» (اختيار/معاينة/حذف) ورفعها عبر TD.uploadPhoto؛ القديمة تُحذف بعد نجاح الجديدة. اللاعب الجديد: الصورة بعد الحفظ.
- admin/live/live-adapter.js: primaryPhoto() و_resolvePhotos() لجلب روابط موقّعة (ساعة) وإظهار الصور في القوائم والبطاقات.
- admin/live/live.css: صنفا .hint و.rm.
لا تغيير في SQL/RLS/RPC/vercel.json/الصلاحيات. بلا اتصال أو نشر.
- supabase-review/sql/0008_members_admin.sql: طُبّقت على staging (ddrbrskusreoktqabkvi) بتاريخ 2026-11-04 مع إضافة revoke من public/anon؛ التحقق: anon=false، authenticated=true للدوال الثلاث.

## مركز المدرب — المرحلة 1 (فرع feature/coach-centre-p1، لم يُرفع ولم يُنشر)
- جديد: `admin/live/live-coach.js` — ملعب تفاعلي بالخطط الأربع (4-4-2، 4-3-3، 3-5-2، 4-2-3-1)، سحب (Pointer Events) أو لمس ثم خانة، تبديل عند الإفلات على خانة مشغولة، القائد والحارس من شريط التحديد.
- `live-adapter.js`: اكتشاف 0014 بثلاث حالات (موجود / أعمدة مفقودة 42703 فقط / خطأ آخر = لا تغيير للوضع مع تعطيل التحرير)، ودوال `setFormation/setLineup/setCaptain/setGoalkeeper` بأسماء ومعاملات مطابقة لـ SQL 0014.
- `live-store.js`: كل الكتابات محروسة بصلاحية `lineup`؛ `canAttendance()` يستعمل `attendance` فقط حين يكون 0014 مفعّلاً.
- الحفظ: لا تحريك تفاؤلي؛ اللوحة مقفلة أثناء الحفظ؛ لا رسالة نجاح قبل رد الخادم؛ عند الرفض يُعرض نص الخادم وتُعاد اللوحة من آخر حالة مؤكدة.
- الموقع العام: يرسم الأساسيين على الخانات مع شارة C للقائد؛ يعود للرسم القديم إن لم تتوفر بيانات 0014 أو كانت الخانات غير صالحة.
- اختبارات: `tools/test_lineup_ui.py` (72)، `tools/test_lineup_contract.js` (32)، و`tools/fixtures/mock_supabase_lineup.js`.
- ملاحظة: الواجهة الجديدة لا تعمل حيّاً قبل تطبيق 0014؛ قبل ذلك تبقى الواجهة القديمة.
