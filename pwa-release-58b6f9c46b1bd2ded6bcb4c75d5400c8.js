
const release = {"schemaVersion":1,"appVersion":"ea4f76e9070b2f099c68054d6d191bfc","dataVersion":"4ed7488ccc66904296ff507b93962bf5","releaseId":"58b6f9c46b1bd2ded6bcb4c75d5400c8","patchVersion":"26.18"};
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
