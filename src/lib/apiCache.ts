/**
 * Simple request cache to prevent duplicate API calls
 */

interface CacheEntry {
    data: any;
    timestamp: number;
    promise?: Promise<any>;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5000; // 5 seconds

export function getCachedRequest<T>(key: string): Promise<T> | null {
    const entry = cache.get(key);
    if (!entry) return null;

    // Check if cache is still valid
    if (Date.now() - entry.timestamp > CACHE_TTL) {
        cache.delete(key);
        return null;
    }

    // If there's an ongoing request, return that promise
    if (entry.promise) {
        return entry.promise;
    }

    // Return cached data as resolved promise
    return Promise.resolve(entry.data);
}

export function setCachedRequest<T>(key: string, promise: Promise<T>): Promise<T> {
    // Store the promise so duplicate requests can await the same promise
    const entry: CacheEntry = {
        data: null,
        timestamp: Date.now(),
        promise,
    };
    cache.set(key, entry);

    // When promise resolves, store the data (but only if it's valid)
    promise
        .then((data) => {
            if (entry) {
                // Only cache valid user data (for getCurrentUser specifically)
                if (key === 'getCurrentUser') {
                    // Validate user object before caching (using type-safe property checks)
                    if (data && typeof data === 'object' && data !== null && 'uid' in data && 'username' in data && 'email' in data) {
                        const userData = data as { uid: string; username: string; email: string; credits?: number };
                        if (userData.uid && userData.username && userData.email) {
                            entry.data = data;
                            entry.promise = undefined;
                        } else {
                            // Invalid user data - don't cache it
                            cache.delete(key);
                        }
                    } else {
                        // Invalid user data - don't cache it
                        cache.delete(key);
                    }
                } else {
                    // For other requests, cache normally
                    entry.data = data;
                    entry.promise = undefined;
                }
            }
        })
        .catch(() => {
            // On error, remove from cache
            cache.delete(key);
        });

    return promise;
}

export function clearCache(key?: string) {
    if (key) {
        cache.delete(key);
    } else {
        cache.clear();
    }
}
