# mauritanian-team-qatar

نموذج أولي محلي لإدارة فريق الجالية الموريتانية لكرة القدم في قطر، مع حزمة **مراجعة فقط** لربط مستقبلي بـ Supabase.

## الحالة الصريحة
- **النموذج الأولي** (`mauritanian-team-prototype/`): موقع ثابت HTML/CSS/JS ببيانات وهمية في الذاكرة. اختباراته المحلية (Playwright) نتيجتها المسجَّلة: 43 + 157 + 62 + 75 = 337/337 (السجلات في `verification/`).
- **SQL وRLS وStorage وAuth** (`supabase-review/`): **لم يُختبر أي منها بمحرك PostgreSQL حقيقي.** لم يُنفَّذ أي SQL ولم تُشغَّل اختبارات pgTAP ولا مرة. ما أُجري هو تدقيق نصي (`tools/static_sql_audit.py`) ومراجعة قراءة فقط؛ لا تُعتبر الصلاحيات «تعمل» قبل اختبارها على staging.
- **المحوّل** (`supabase-review/client/`): جُرّب بمحاكاة فقط، لا مع `supabase-js` الحقيقي، وهو غير محمّل في `index.html`.
- **الصلاحيات في الواجهة محاكاة وليست حماية.** الحماية الحقيقية يجب أن تكون خادمية وتحتاج اختبارًا مستقلًا قبل أي بيانات حقيقية.
- لا يتصل هذا المستودع بأي خدمة. كل بيانات النموذج وهمية. لا يوجد ملف ترخيص (LICENSE) حاليًا، والمستودع مخصص ليكون خاصًا.

## البنية
| المسار | المحتوى |
|---|---|
| `mauritanian-team-prototype/` | تطبيق النموذج الأولي + اختبارات Playwright (`tests/run_tests*.py`) + لقطات الشاشة التاريخية (`tests/screenshots/`) |
| `README_LOCAL.md` | تعليمات التشغيل المحلي خطوة بخطوة |
| `supabase-review/docs/` | التصميم والمخاطر وخطة الدمج والمراجعة الأمنية (`07-security-review.md`) ودليل اختبار staging |
| `supabase-review/sql/` | SQL (مخطط، RLS، RPC، Storage، بيانات وهمية) وسكربتات التراجع واختبارات pgTAP — **للمراجعة فقط** |
| `supabase-review/.env.example` | قالب بلا قيم حقيقية؛ الواجهة لا تقرأ ملفات `.env` |
| `tools/` | فحص الأسرار، التدقيق النصي لـ SQL، اختبار عقد المحوّل (Node، محاكاة) |
| `REPORT_PHASE1.md`, `REPORT_PHASE2A.md` | تقارير تاريخية: المراحل والقرارات والقيود المعروفة (لم تُعدَّل) |
| `CHECKS_PHASE2A.txt`, `phase2a-results/` | أدلة المرحلة 2A كما كانت: فحوص، سجلات التدقيق والعقد، فرق SQL |
| `phase1-results/0004_rpc_fix.diff` | فرق إصلاح `full→v_full` من المرحلة 1 |
| `verification/` | **سجلات تشغيل جديدة** لهذه النسخة (منفصلة عن التاريخية) |
| `MANIFEST_UPLOAD_FINAL.sha256` / `.tsv` | المسارات والأحجام وبصمات SHA-256 لهذه النسخة |

## التشغيل السريع
```bash
cd mauritanian-team-prototype
python3 -m http.server 8080 --bind 127.0.0.1   # ثم http://127.0.0.1:8080/index.html
```
الاختبارات والفحوص: انظر `README_LOCAL.md`. من جذر المستودع: `python3 -I tools/scan_secrets.py .` و`python3 tools/static_sql_audit.py` و`node tools/test_adapter_contract.js`.
ملاحظة: تشغيل الاختبارات يكتب `tests/last_results*.json` ويعيد كتابة `tests/screenshots/`؛ الأول غير مضمَّن عمدًا (ناتج تشغيل).

## مراجع تاريخية
هذه النسخة مأخوذة من حزمة مراجعة المرحلة 2A. بعض الوثائق التاريخية تشير إلى ملفات **غير مضمَّنة هنا عمدًا**، وهي محفوظة في الحزمة الأصلية:
- `MANIFEST.sha256` و`MANIFEST_PHASE1.sha256` (مانيفستات قديمة)، و`MANIFEST_PHASE2A.sha256` (يصف حزمة 2A بـ 103 ملفات ولا يطابق هذه النسخة؛ حلّ محله `MANIFEST_UPLOAD_FINAL.sha256`).
- `backup/` (نسخة Task 06 الاحتياطية الكاملة) — مذكورة في `supabase-review/docs/03-migration-test-rollback.md` و`README_REVIEW_ONLY.md`.
- `CHECKS.txt` و`CHECKS_PHASE1.txt` وسجلات `phase1-results/*.out.txt` وإعادة تشغيل Task 06 — مذكورة في `REPORT_PHASE1.md`. أُعيد تشغيل الاختبارات في `verification/`.
- `tests/last_results*.json` — نواتج تشغيل تُولَّد من جديد.
بذلك تبقى هذه الإشارات في الوثائق التاريخية كما كُتبت، ولا تدل على أخطاء في المستودع.
