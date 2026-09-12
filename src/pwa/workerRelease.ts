import { decodeAppRelease, type AppRelease } from "./release";

export function readWorkerRelease(worker: ServiceWorker): Promise<AppRelease> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => {
      channel.port1.close();
      reject(new Error("Service worker did not report its release"));
    }, 3000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timeout);
      channel.port1.close();
      try { resolve(decodeAppRelease(event.data)); }
      catch (error) { reject(error); }
    };
    worker.postMessage({ type: "COOLDOWN_RELEASE" }, [channel.port2]);
  });
}
