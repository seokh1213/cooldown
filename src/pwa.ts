import { APP_VERSION } from "./pwa/release";
import { PwaUpdateManager } from "./pwa/updateManager";

export const BUILD_VERSION = APP_VERSION;

const updater = new PwaUpdateManager();

if (import.meta.env.PROD && typeof window !== "undefined" && "serviceWorker" in navigator) {
  updater.start();
}

export function subscribeToPWAUpdate(listener: () => void): () => void {
  return updater.subscribe(listener);
}

export function applyPWAUpdate(): Promise<boolean> {
  return updater.apply();
}
