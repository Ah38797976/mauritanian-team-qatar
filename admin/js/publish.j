// ناشر اللقطة العامة: كلما تغيّرت بيانات لوحة التحكم تُرسل Store.publicView() (منقّحة ومحدودة بالأقسام المفعّلة) إلى الموقع.
// النموذج الأولي: localStorage + BroadcastChannel بين تبويبين في المتصفح نفسه (يلزم خادم http محلي). في النسخة المتصلة يحل محلها
// قراءة الموقع من Views عامة في Supabase مع Realtime، بلا أي نسخة في المتصفح. الموقع لا يقرأ إلا هذه اللقطة ولا يصل إلى Store.
(function () {
  const KEY = 'mt.public.snapshot.v1', CH = 'mt-public-site';
  let bc = null; try { bc = new BroadcastChannel(CH); } catch (e) {}
  function push() {
    const snap = JSON.stringify({ v: 1, t: Date.now(), data: Store.publicView() });
    try { localStorage.setItem(KEY, snap); } catch (e) {}
    try { if (bc) bc.postMessage(snap); } catch (e) {}
  }
  Store.on(push); push();
})();
