# live-v3 — تغييرات عن live-v2 (محلي، غير مختبَر على خادم حقيقي)
- admin/live/live-app.js: حقل الصورة في نموذج «تعديل لاعب» (اختيار/معاينة/حذف) ورفعها عبر TD.uploadPhoto؛ القديمة تُحذف بعد نجاح الجديدة. اللاعب الجديد: الصورة بعد الحفظ.
- admin/live/live-adapter.js: primaryPhoto() و_resolvePhotos() لجلب روابط موقّعة (ساعة) وإظهار الصور في القوائم والبطاقات.
- admin/live/live.css: صنفا .hint و.rm.
لا تغيير في SQL/RLS/RPC/vercel.json/الصلاحيات. بلا اتصال أو نشر.
- supabase-review/sql/0008_members_admin.sql: طُبّقت على staging (ddrbrskusreoktqabkvi) بتاريخ 2026-11-04 مع إضافة revoke من public/anon؛ التحقق: anon=false، authenticated=true للدوال الثلاث.
