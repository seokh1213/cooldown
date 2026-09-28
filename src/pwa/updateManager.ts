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
  private releaseRequested = false;
  private recheck = false;
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
    if (this.checking) {
      // The running check may already have read release.json from the previous
      // deployment. Remember this focus/online/interval signal instead of
      // dropping it until the next trigger.
      if (this.releaseRequested) this.recheck = true;
      return this.checking;
    }
    this.checking = this.runChecks().finally(() => { this.checking = undefined; });
    return this.checking;
  }

  private async runChecks(): Promise<void> {
    let foundUpdate = false;
    do {
      this.recheck = false;
      this.releaseRequested = false;
      foundUpdate = await this.checkRelease().catch(() => {
        // Offline, partial deploys and failed installs leave the current PWA intact.
        return false;
      });
      // A check that found a newer release is already installing it; asking
      // again would only race the install and activation.
    } while (this.recheck && !foundUpdate && navigator.onLine);
    this.releaseRequested = false;
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

  /** Resolves true when release.json names a release other than the running one. */
  private async checkRelease(): Promise<boolean> {
    const registration = await this.register();
    this.releaseRequested = true;
    const response = await fetch(`${getRuntimeBasePath()}release.json`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const latest = decodeAppRelease(await response.json());
    const foundUpdate = latest.releaseId !== RELEASE_ID;
    if (foundUpdate) await registration.update();
    await this.prepareWaiting();
    return foundUpdate;
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
