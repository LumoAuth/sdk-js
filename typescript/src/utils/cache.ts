// ─── Permission Cache ─────────────────────────────────────────────────

export interface CacheOptions {
    /** Time-to-live in milliseconds. Default: 5 minutes. */
    ttl?: number;
    /** Maximum number of entries. Default: 1000. */
    maxSize?: number;
}

interface CacheEntry<T> {
    value: T;
    expiresAt: number;
}

/**
 * Simple in-memory cache with TTL expiration.
 *
 * Used internally to cache permission check results and avoid
 * redundant API calls. Framework-agnostic — works in Node.js,
 * browsers, and edge runtimes.
 *
 * @example
 * ```ts
 * const cache = new PermissionCache({ ttl: 60_000 }); // 1 minute
 * cache.set('document.edit', true);
 * cache.get('document.edit'); // true
 * ```
 */
export class PermissionCache<T = boolean> {
    private store = new Map<string, CacheEntry<T>>();
    private ttl: number;
    private maxSize: number;

    constructor(options: CacheOptions = {}) {
        this.ttl = options.ttl ?? 5 * 60 * 1000; // 5 minutes
        this.maxSize = options.maxSize ?? 1000;
    }

    /** Get a cached value, or `undefined` if missing / expired. */
    get(key: string): T | undefined {
        const entry = this.store.get(key);
        if (!entry) return undefined;

        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return undefined;
        }

        return entry.value;
    }

    /** Store a value with the configured TTL. */
    set(key: string, value: T): void {
        // Evict oldest if we've hit the size limit
        if (this.store.size >= this.maxSize) {
            const oldestKey = this.store.keys().next().value;
            if (oldestKey !== undefined) {
                this.store.delete(oldestKey);
            }
        }

        this.store.set(key, {
            value,
            expiresAt: Date.now() + this.ttl,
        });
    }

    /** Check whether a non-expired entry exists. */
    has(key: string): boolean {
        return this.get(key) !== undefined;
    }

    /** Remove a single entry. */
    delete(key: string): void {
        this.store.delete(key);
    }

    /** Clear the entire cache. Call when user roles change. */
    clear(): void {
        this.store.clear();
    }

    /** Number of entries currently stored (including expired). */
    get size(): number {
        return this.store.size;
    }
}
