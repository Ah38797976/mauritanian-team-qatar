// قيم عامة فقط: عنوان المشروع والمفتاح العام (publishable). لا تضع هنا مفتاحًا سريًا أبدًا (sb_secret_ أو service_role):
// طبقة البيانات ترفضه، ويفحص tools/scan_secrets.py الملفات. المفتاح العام مصمَّم ليظهر في المتصفح، والحماية الفعلية RLS/RPC في الخادم.
window.APP_CONFIG = {
  SUPABASE_URL: 'https://ddrbrskusreoktqabkvi.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_kPFR3J8lUaC3itNNiB5_og_ZzMNuabf'
};
