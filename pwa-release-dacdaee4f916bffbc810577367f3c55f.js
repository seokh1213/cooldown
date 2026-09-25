
const release = {"schemaVersion":1,"appVersion":"4e05a69a79d25daaeb9501a35e69bfa0","dataVersion":"5fe42d1628711ad27e5ac530a07fa435","releaseId":"dacdaee4f916bffbc810577367f3c55f","patchVersion":"26.19"};
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
