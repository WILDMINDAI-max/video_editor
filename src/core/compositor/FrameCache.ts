// ============================================
// Frame Cache - LRU Cache for Video Frames
// Prevents black screens during seeking/scrubbing
// ============================================

import type { FrameCacheEntry, CacheStats } from '../types/engine';

/**
 * LRU Frame Cache for storing decoded video frames
 */
export class FrameCache {
    private static instance: FrameCache;
    private cache: Map<string, FrameCacheEntry> = new Map();
    private maxSize: number; // Maximum cache size in bytes
    private currentSize: number = 0;
    private hits: number = 0;
    private misses: number = 0;

    private constructor(maxSizeMB: number = 256) {
        this.maxSize = maxSizeMB * 1024 * 1024;
    }

    static getInstance(maxSizeMB?: number): FrameCache {
        if (!FrameCache.instance) {
            FrameCache.instance = new FrameCache(maxSizeMB);
        }
        return FrameCache.instance;
    }

    /**
     * Generate cache key from clip ID and timestamp
     */
    private getKey(clipId: string, timestamp: number): string {
        // Round to nearest frame at 30fps (33.33ms intervals)
        const frameTime = Math.round(timestamp * 30) / 30;
        return `${clipId}:${frameTime.toFixed(3)}`;
    }

    /**
     * Get frame from cache
     */
    get(clipId: string, timestamp: number): HTMLCanvasElement | null {
        const key = this.getKey(clipId, timestamp);
        const entry = this.cache.get(key);

        if (entry) {
            entry.lastAccessed = Date.now();
            this.hits++;
            return entry.canvas;
        }

        this.misses++;
        return null;
    }

    /**
     * Store frame in cache
     */
    set(clipId: string, timestamp: number, source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
        const key = this.getKey(clipId, timestamp);

        // Check if already cached
        const existing = this.cache.get(key);
        if (existing) {
            existing.lastAccessed = Date.now();
            return existing.canvas;
        }

        // Determine source dimensions
        let width: number, height: number;
        if (source instanceof HTMLVideoElement) {
            width = source.videoWidth || 1920;
            height = source.videoHeight || 1080;
        } else if (source instanceof HTMLImageElement) {
            width = source.naturalWidth || 1920;
            height = source.naturalHeight || 1080;
        } else {
            width = source.width || 1920;
            height = source.height || 1080;
        }

        // Create canvas for caching
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (ctx) {
            try {
                ctx.drawImage(source, 0, 0, width, height);
            } catch (e) {
                // Source not ready
                console.warn('[FrameCache] Failed to cache frame:', e);
            }
        }

        const entrySize = width * height * 4; // RGBA

        // Evict old entries if needed
        while (this.currentSize + entrySize > this.maxSize && this.cache.size > 0) {
            this.evictOldest();
        }

        const entry: FrameCacheEntry = {
            timestamp,
            canvas,
            lastAccessed: Date.now(),
            size: entrySize,
        };

        this.cache.set(key, entry);
        this.currentSize += entrySize;

        return canvas;
    }

    /**
     * Evict oldest (least recently used) entry
     */
    private evictOldest(): void {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;

        for (const [key, entry] of this.cache) {
            if (entry.lastAccessed < oldestTime) {
                oldestTime = entry.lastAccessed;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            const entry = this.cache.get(oldestKey);
            if (entry) {
                this.currentSize -= entry.size;
            }
            this.cache.delete(oldestKey);
        }
    }

    /**
     * Clear cache for specific clip
     */
    clearClip(clipId: string): void {
        const keysToDelete: string[] = [];

        for (const key of this.cache.keys()) {
            if (key.startsWith(`${clipId}:`)) {
                keysToDelete.push(key);
            }
        }

        for (const key of keysToDelete) {
            const entry = this.cache.get(key);
            if (entry) {
                this.currentSize -= entry.size;
            }
            this.cache.delete(key);
        }
    }

    /**
     * Clear entire cache
     */
    clear(): void {
        this.cache.clear();
        this.currentSize = 0;
    }

    /**
     * Get cache statistics
     */
    getStats(): CacheStats {
        const totalAccesses = this.hits + this.misses;
        return {
            totalEntries: this.cache.size,
            totalSize: this.currentSize,
            maxSize: this.maxSize,
            hitRate: totalAccesses > 0 ? this.hits / totalAccesses : 0,
        };
    }

    /**
     * Preload frames around a timestamp
     */
    async preloadAround(
        clipId: string,
        currentTimestamp: number,
        videoElement: HTMLVideoElement,
        range: number = 2 // seconds
    ): Promise<void> {
        // Preload at 30fps intervals
        const frameInterval = 1 / 30;
        const startTime = Math.max(0, currentTimestamp - range);
        const endTime = currentTimestamp + range;

        // Only preload if not already cached
        for (let t = startTime; t <= endTime; t += frameInterval) {
            if (!this.get(clipId, t)) {
                // Would need to seek video to timestamp and cache
                // This is expensive, so we just cache current frame
                break;
            }
        }
    }

    /**
     * Warm cache with nearby frames during playback
     */
    warmCache(clipId: string, timestamp: number, source: HTMLVideoElement | HTMLImageElement): void {
        // Just cache the current frame during playback
        // This builds up the cache over time
        if (source instanceof HTMLVideoElement && source.readyState >= 2) {
            this.set(clipId, timestamp, source);
        } else if (source instanceof HTMLImageElement && source.complete) {
            this.set(clipId, timestamp, source);
        }
    }
}

export const frameCache = FrameCache.getInstance();
