# ملاحظات إعادة تصميم الواجهة (النمط الداكن)

- طبقة تصميم فوق CSS الحالي دون تغيير أسماء الأصناف أو المعرّفات: `site/css/theme-dark.css` و`admin/css/theme-dark.css`.
- الموقع العام: `index.html` (هيكل: قائمة جانبية بأيقونات + محتوى)، و`site/js/site.js` (أيقونات القائمة، بديل صورة اللاعب، وإغلاق وسم ناقص في صف الهدافين).
- لوحة الإدارة: `admin/index.html` (ربط ملف التصميم) فقط. لم يُعدَّل `store.js` ولا `app.js` ولا `data.js`.
- لا تغيير في قاعدة البيانات/SQL/RLS/Storage/Auth/الصلاحيات، ولا في `supabase-review/`.
- الخط: Cairo ثم Tajawal إن وُجدا محليًا، وإلا خطوط النظام. تضمين الملف يدويًا: `assets/fonts/README.txt`.
- الصور: لا صور لاعبين في المشروع؛ يظهر شكل مؤقت حتى تُرفع الصور من لوحة الإدارة.
- الاختبار: `python3 tools/test_ui_redesign.py` (مخرجاته في `verification/ui_redesign.out.txt`).
