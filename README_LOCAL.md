# تشغيل المشروع محليًا — خطوة بخطوة

المشروع موقع ثابت (HTML/CSS/JS عادي) ببيانات وهمية في الذاكرة. لا يحتاج Node ولا بناء ولا قاعدة بيانات ولا إنترنت.

## الطريقة الأبسط (بلا أي تثبيت)
1. فُكّ الـ ZIP.
2. افتح `mauritanian-team-prototype/index.html` بالنقر المزدوج في Chrome أو Edge أو Firefox.
3. اختر «المستخدم التجريبي» من أعلى الصفحة لتجربة الأدوار (مؤسس، إدارة، أمين رياضي، مدرب، مسؤول مباراة ×2، أمين مالي).

## عبر خادم محلي (موصى به لتجربة أقرب للواقع)
```bash
cd mauritanian-team-prototype
python3 -m http.server 8080 --bind 127.0.0.1
# ثم افتح  http://127.0.0.1:8080/index.html
```
(`--bind 127.0.0.1` يمنع وصول أجهزة الشبكة الأخرى.)

## ملاحظات مهمة
- أي تعديل (إضافة/حذف/تحرير) يضيع عند تحديث الصفحة؛ هذا مقصود في النموذج الأولي.
- الصلاحيات في الواجهة محاكاة فقط وليست حماية؛ الحماية الحقيقية ستكون في قاعدة البيانات (RLS/RPC) بعد الربط.
- `?dev=1` في الرابط وضع اختبار يكشف `Store.S`؛ لا يُستخدم في أي نسخة متصلة.

## تشغيل الاختبارات (اختياري — يحتاج Python وPlaywright وChromium)
```bash
pip install playwright --break-system-packages   # مرة واحدة
python3 -m playwright install chromium           # مرة واحدة
cd mauritanian-team-prototype
python3 tests/run_tests.py            # 43
python3 tests/run_tests_fixes.py      # 157
python3 tests/run_tests_privacy.py    # 62
python3 tests/run_tests_task06.py     # 75
```
كلها تعمل على `file://` بلا شبكة.

## فحص الأسرار محليًا
```bash
python3 -I tools/scan_secrets.py .
```

## ما لا يُشغَّل الآن
كل ما في `supabase-review/` للمراجعة فقط: لا يُنفَّذ SQL ولا يُحمَّل `supabase-adapter.js` ولا يُنسخ `config.example.js` قبل موافقتك.
