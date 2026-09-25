
const release = {"schemaVersion":1,"appVersion":"cd9b497a6da7d8d70d97468b66edfdd2","dataVersion":"5fe42d1628711ad27e5ac530a07fa435","releaseId":"b9ff855fe07ecf506d77a9e6c341dcdf","patchVersion":"26.19"};
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
