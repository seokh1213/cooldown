import { getRuntimeBasePath } from "../lib/staticDataUtils";
import { decodeAppRelease, RELEASE_ID } from "./release";
import { prepareReleaseData } from "./staticDataRevision";
import { readWorkerRelease } from "./workerRelease";

type UpdateListener = () => void;

export class PwaUpdateManager {
  private registration?: ServiceWorkerRegistration;
  private readonly listeners = new Set<UpdateListener>();
  private preparedWorker?: ServiceWorker;
  private checking?: Promise<void>;
  private preparing?: Promise<void>;
  private applying = false;
  private reloading = false;

  start(): void {
    const check = () => { void this.check(); };
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    window.addEventListener("online", check);
    document.addEventListener("visibilitychange", check);
    window.setInterval(check, 60_000);
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      void this.reloadForNewController();
    });
    check();
  }

  subscribe(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    // An update may finish downloading before React mounts or preferences change.
    if (this.preparedWorker) queueMicrotask(() => {
      if (this.listeners.has(listener)) listener();
    });
    return () => { this.listeners.delete(listener); };
  }

  async check(): Promise<void> {
    if (!navigator.onLine || document.visibilityState === "hidden") return;
    if (this.checking) return this.checking;
    this.checking = this.checkRelease().catch(() => {
      // Offline, partial deploys and failed installs leave the current PWA intact.
    }).finally(() => { this.checking = undefined; });
    return this.checking;
  }

  private async register(): Promise<ServiceWorkerRegistration> {
    if (this.registration) return this.registration;
    const base = getRuntimeBasePath();
    const registration = await navigator.serviceWorker.register(`${base}sw.js`, {
      scope: base,
      updateViaCache: "none",
    });
    this.registration = registration;
    const watchInstalling = () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed") void this.prepareWaiting();
      });
    };
    registration.addEventListener("updatefound", watchInstalling);
    watchInstalling();
    return registration;
  }

  private async checkRelease(): Promise<void> {
    const registration = await this.register();
    const response = await fetch(`${getRuntimeBasePath()}release.json`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return;
    const latest = decodeAppRelease(await response.json());
    if (latest.releaseId !== RELEASE_ID) await registration.update();
    await this.prepareWaiting();
  }

  private async prepareWaiting(): Promise<void> {
    if (this.preparing) return this.preparing;
    this.preparing = this.prepareCandidate().catch(() => {
      // A later focus/online/interval check retries preparation, without reloading.
    }).finally(() => { this.preparing = undefined; });
    return this.preparing;
  }

  private async prepareCandidate(): Promise<void> {
    const worker = this.registration?.waiting;
    if (!worker || worker === this.preparedWorker) return;
    const release = await readWorkerRelease(worker);
    if (release.releaseId === RELEASE_ID) {
      // The page already runs this build (e.g. a hard refresh past the old SW).
      worker.postMessage({ type: "SKIP_WAITING" });
      return;
    }
    await prepareReleaseData(release);
    if (this.registration?.waiting !== worker) return;
    this.preparedWorker = worker;
    for (const listener of this.listeners) listener();
  }

  async apply(): Promise<boolean> {
    const worker = this.registration?.waiting;
    if (!worker || this.applying) return false;
    this.applying = true;
    try {
      // The user may have selected another champion while the banner was open.
      await prepareReleaseData(await readWorkerRelease(worker));
      if (this.registration?.waiting !== worker) return false;
      worker.postMessage({ type: "SKIP_WAITING" });
      return true;
    } catch {
      this.preparedWorker = undefined;
      return false;
    } finally {
      this.applying = false;
    }
  }

  private async reloadForNewController(): Promise<void> {
    const worker = navigator.serviceWorker.controller;
    if (!worker || this.reloading) return;
    try {
      if ((await readWorkerRelease(worker)).releaseId === RELEASE_ID) return;
      this.reloading = true;
      window.location.reload();
    } catch {
      // Never reload just because a metadata message failed.
    }
  }
}
