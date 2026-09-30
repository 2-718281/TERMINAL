// 最小 Service Worker：让网站可以"安装到主屏幕"，不做离线缓存
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response('<meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="background:#01040a;color:#b8e2ff;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">SIGNAL LOST<br>信号中断 · 请检查网络后重试</body>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
