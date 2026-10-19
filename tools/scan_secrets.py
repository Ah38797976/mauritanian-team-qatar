#!/usr/bin/env python3
"""فحص محلي بسيط للأسرار (بلا شبكة). الاستخدام:  python3 -I tools/scan_secrets.py <مجلد>
يبحث عن أنماط مفاتيح Supabase/JWT وسلاسل الاتصال داخل الملفات النصية. يخرج برمز 1 إذا وُجد شيء."""
import re, sys, pathlib, base64, json

INFO_WORDS = re.compile(r'service_role', re.I)  # كلمة تحذيرية فقط: تُعرض للعلم ولا تُعدّ تسريبًا
PATTERNS = {
    'sb_secret key': re.compile(r'sb_secret_[A-Za-z0-9_\-]{10,}'),
    'sb_publishable key (عام، للعلم)': re.compile(r'sb_publishable_[A-Za-z0-9_\-]{10,}'),
    'Supabase PAT (sbp_)': re.compile(r'\bsbp_[A-Za-z0-9]{20,}'),
    'DB connection string': re.compile(r'postgres(?:ql)?://[^\s\'"<>]*:[^\s\'"<>@]+@[^\s\'"<>]+'),
    'JWT-like': re.compile(r'\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}'),
    'private key block': re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----'),
}
TEXT_EXT = {'.js', '.html', '.css', '.md', '.txt', '.sql', '.json', '.py', '.sh', '.example', '.sha256', ''}

def jwt_role(tok):
    try:
        p = tok.split('.')[1]; p += '=' * (-len(p) % 4)
        return json.loads(base64.urlsafe_b64decode(p)).get('role')
    except Exception:
        return None

def main(root):
    root = pathlib.Path(root); hits = []; scanned = 0
    for f in sorted(root.rglob('*')):
        if not f.is_file() or f.suffix.lower() not in TEXT_EXT or '.git' in f.parts:
            continue
        try:
            s = f.read_text(encoding='utf-8')
        except Exception:
            continue
        scanned += 1
        for name, rx in PATTERNS.items():
            for m in rx.finditer(s):
                line = s.count('\n', 0, m.start()) + 1
                extra = ''
                if name == 'JWT-like':
                    extra = ' role=' + str(jwt_role(m.group(0)))
                hits.append((str(f.relative_to(root)), line, name + extra))
    print(f'ملفات نصية مفحوصة: {scanned}')
    for h in hits:
        print('HIT %s:%d  %s' % h)
    for f in sorted(root.rglob('*')):
        if f.is_file() and f.suffix.lower() in TEXT_EXT and '.git' not in f.parts:
            try: t = f.read_text(encoding='utf-8')
            except Exception: continue
            n = len(INFO_WORDS.findall(t))
            if n: print('INFO %s: كلمة service_role مذكورة %d مرة (نص تحذيري/نمط فحص، تحقق أنها ليست قيمة مفتاح)' % (f.relative_to(root), n))
    print('النتيجة:', 'لا أنماط مشبوهة' if not hits else f'{len(hits)} تطابق(ات) تحتاج مراجعة يدوية')
    return 1 if hits else 0

if __name__ == '__main__':
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else '.'))
