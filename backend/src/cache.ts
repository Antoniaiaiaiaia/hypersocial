/** Tiny TTL cache with in-flight coalescing and stale-on-error. */
export class TtlCache<T> {
  private store = new Map<string, { at: number; value: T }>();
  private inflight = new Map<string, Promise<T>>();

  async get(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const hit = this.store.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const p = load()
      .then((value) => {
        this.store.set(key, { at: Date.now(), value });
        return value;
      })
      .catch((err) => {
        if (hit) {
          console.warn(`[cache] ${key} refresh failed, serving stale: ${(err as Error).message}`);
          return hit.value;
        }
        throw err;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }
}
