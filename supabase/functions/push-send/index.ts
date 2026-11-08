// push-send: يرسل تنبيهًا إلى كل المشتركين. NOT DEPLOYED — يُنشر فقط بعد موافقة صريحة.
// 1) يتحقق من هوية المرسل عبر rpc_push_authorize بتوكن المستخدم نفسه (صلاحية settings + التحقق من المدخلات + حد المعدل + السجل).
// 2) يقرأ الاشتراكات بمفتاح الخدمة ويرسل، ويحذف الاشتراكات الميتة (404/410) ويحدّث العدّادات.
// الأسرار المطلوبة: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (SUPABASE_URL/ANON/SERVICE_ROLE متوفرة تلقائيًا). المفتاح الخاص لا يُكتب في المستودع.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ err: 'method' }, 405);
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return json({ err: 'غير مصرّح' }, 401);
  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return json({ err: 'بيانات غير صالحة' }, 400); }

  const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const pub = Deno.env.get('VAPID_PUBLIC_KEY'), priv = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!pub || !priv) return json({ err: 'الإشعارات غير مهيّأة بعد' }, 503);

  const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: az, error: azErr } = await asUser.rpc('rpc_push_authorize', { p: { title: input.title, body: input.body, url: input.url } });
  if (azErr || !az || typeof az !== 'object') return json({ err: 'تعذّر التحقق من الصلاحية' }, 403);
  if (az.err) return json({ err: String(az.err) }, 400);

  webpush.setVapidDetails('https://mauritanian-team.vercel.app', pub, priv);
  const db = createClient(url, svc, { auth: { persistSession: false } });
  const { data: subs, error: sErr } = await db.from('push_subscriptions').select('id,endpoint,p256dh,auth').limit(3000);
  if (sErr) return json({ err: 'تعذّر قراءة المشتركين' }, 500);

  const payload = JSON.stringify({ title: az.title, body: az.body, url: az.url });
  let sent = 0, failed = 0; const dead: string[] = [];
  const list = subs || [];
  for (let i = 0; i < list.length; i += 40) {
    await Promise.all(list.slice(i, i + 40).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: 'normal' });
        sent++;
      } catch (e) {
        failed++;
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.id);
      }
    }));
  }
  if (dead.length) await db.from('push_subscriptions').delete().in('id', dead);
  await db.from('push_messages').update({ sent, failed }).eq('id', az.id);
  return json({ ok: true, sent, failed, total: list.length, removed: dead.length });
});
