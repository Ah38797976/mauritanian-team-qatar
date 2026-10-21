الخط العربي
-----------
يستخدم التصميم الخط Cairo (ثم Tajawal) إن كان مثبّتًا على جهاز الزائر، وإلا يرجع إلى خطوط النظام العربية.
لم يُضمَّن ملف الخط داخل هذه الحزمة لأن بيئة البناء لم تسمح بتنزيل الخطوط (لا شبكة خارجية).

لتضمين Cairo (ترخيص SIL OFL) داخل المشروع:
1) نزّل ملفات woff2 للمجموعة arabic وlatin بوزنَي 400 و700 (مثلًا من حزمة @fontsource/cairo).
2) ضعها في هذا المجلد: assets/fonts/cairo-arabic-400.woff2 وcairo-arabic-700.woff2 ... إلخ.
3) أضف في بداية site/css/theme-dark.css وadmin/css/theme-dark.css:
   @font-face{font-family:"Cairo";src:url("../../assets/fonts/cairo-arabic-400.woff2") format("woff2");font-weight:400;font-display:swap;unicode-range:U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFF}
   @font-face{font-family:"Cairo";src:url("../../assets/fonts/cairo-arabic-700.woff2") format("woff2");font-weight:700;font-display:swap;unicode-range:U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFF}
