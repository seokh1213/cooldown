import { APP_VERSION } from "./release";
import { PwaUpdateManager } from "./updateManager";
import { APP_STORAGE_KEYS, readStorage } from "../../infrastructure/storage/appStorage";

export const BUILD_VERSION = APP_VERSION;

const updater = new PwaUpdateManager();

const startupReady = import.meta.env.PROD && typeof window !== "undefined" && "serviceWorker" in navigator
  ? updater.start({ autoUpdateEnabled: readStorage(APP_STORAGE_KEYS.pwaAutoUpdate) !== "false" })
  : Promise.resolve();

export function waitForPWAStartup(): Promise<void> {
  return startupReady;
}

export function subscribeToPWAUpdate(listener: () => void): () => void {
  return updater.subscribe(listener);
}

export function applyPWAUpdate(): Promise<boolean> {
  return updater.apply();
}
