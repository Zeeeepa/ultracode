/**
 * Promise-based write mutex for SQLite database serialization.
 *
 * Analog of Zig's db_mutex (std.Thread.Mutex) adapted for async Node.js.
 * Ensures that only one write operation runs at a time per database.
 *
 * With journal_mode=OFF + locking_mode=EXCLUSIVE, concurrent writes from
 * different async flows can corrupt data or produce stale reads.
 * This mutex serializes all write access at the application level.
 *
 * Pattern from ultracode.zig: "lock for critical section, release for work"
 * — callers queue up via Promise chain, each runs exclusively.
 */
export class DbWriteMutex {
  private chain: Promise<void> = Promise.resolve();
  private _queueDepth = 0;
  private readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Execute `fn` exclusively — all other callers wait in FIFO order.
   * Returns fn's result. Errors propagate to caller but don't break the chain.
   */
  async run<T>(fn: () => T | Promise<T>): Promise<T> {
    this._queueDepth++;
    let releaseLock!: () => void;
    const nextLink = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const prevLink = this.chain;
    this.chain = nextLink;

    // Wait for all previous writers to finish
    await prevLink;

    try {
      return await fn();
    } finally {
      this._queueDepth--;
      releaseLock();
    }
  }

  /** Current number of waiters (0 = idle, 1 = running, 2+ = contention) */
  get queueDepth(): number {
    return this._queueDepth;
  }

  /** Mutex name for diagnostics */
  get label(): string {
    return this.name;
  }
}
