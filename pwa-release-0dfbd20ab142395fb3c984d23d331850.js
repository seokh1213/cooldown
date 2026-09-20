
const release = {"schemaVersion":1,"appVersion":"f756cc0bc62acd1978976d0c3aebb224","dataVersion":"48862dcbde67462c296e2ed49ff9165e","releaseId":"0dfbd20ab142395fb3c984d23d331850","patchVersion":"26.18"};
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
