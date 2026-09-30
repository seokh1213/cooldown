
const release = {"schemaVersion":1,"appVersion":"dd348894e63a7f6bc69f23bb0b92774f","dataVersion":"7b2ee2f2bae4477e7157902fa26426a0","releaseId":"6edc6f11e6fae561c9cc7e8f9be0a706","patchVersion":"26.19"};
self.addEventListener('message', (event) => {
  if (event.data?.type === 'COOLDOWN_RELEASE') event.ports[0]?.postMessage(release);
});
// Older autoUpdate clients cannot activate a prompt-mode worker. Upgrade that
// generation in place, after Workbox's install transaction has succeeded.
self.addEventListener('install', (event) => {
  const incumbent = self.registration.active;
  if (!incumbent) return;
  event.waitUntil(new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => {
      channel.port1.close();
      self.skipWaiting().then(resolve);
    }, 2000);
    channel.port1.onmessage = () => {
      clearTimeout(timeout);
      channel.port1.close();
      resolve();
    };
    incumbent.postMessage({ type: 'COOLDOWN_RELEASE' }, [channel.port2]);
  }));
});
