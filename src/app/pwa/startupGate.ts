/** Keep the first screen covered while an automatic update can still be applied. */
export class PwaStartupGate {
  readonly ready: Promise<void>;
  pending: boolean;
  private readonly resolve: () => void;
  private readonly timeout?: ReturnType<typeof setTimeout>;

  constructor(enabled: boolean) {
    this.pending = enabled;
    let resolve!: () => void;
    this.ready = new Promise<void>((done) => { resolve = done; });
    this.resolve = resolve;
    if (enabled) this.timeout = setTimeout(() => this.finish(), 3000);
    else this.finish();
  }

  finish(): void {
    clearTimeout(this.timeout);
    this.pending = false;
    this.resolve();
  }

  holdForReload(): void {
    clearTimeout(this.timeout);
  }
}
