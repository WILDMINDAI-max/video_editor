/**
 * VideoFrameCache - Pre-caches video frames as ImageBitmap for fast access
 * 
 * This dramatically improves export speed by:
 * 1. Pre-decoding frames ahead of time (prefetch window)
 * 2. Using ImageBitmap which is GPU-accelerated
 * 3. Avoiding slow HTML5 video.currentTime seeking
 */

export interface CachedFrame {
    bitmap: ImageBitmap;
    timestamp: number;
}

export interface VideoFrameInfo {
    videoElement: HTMLVideoElement;
    fps: number;
    duration: number;
    totalFrames: number;
}

class VideoFrameCache {
    private frameCache: Map<string, Map<number, CachedFrame>> = new Map();
    private videoInfo: Map<string, VideoFrameInfo> = new Map();
    private prefetchWindow: number = 60; // frames ahead to cache
    private maxFramesPerVideo: number = 90; // max frames to keep cached per video
    private isPrefetching: Map<string, boolean> = new Map();
    private prefetchPromises: Map<string, Promise<void>> = new Map();

    constructor() {
        console.log('%c🎬 [VideoFrameCache] Initialized', 'color: #00ff00; font-weight: bold');
    }

    /**
     * Register a video for frame caching
     */
    registerVideo(videoId: string, video: HTMLVideoElement, fps: number): void {
        if (this.videoInfo.has(videoId)) {
            return; // Already registered
        }

        const info: VideoFrameInfo = {
            videoElement: video,
            fps,
            duration: video.duration,
            totalFrames: Math.ceil(video.duration * fps),
        };

        this.videoInfo.set(videoId, info);
        this.frameCache.set(videoId, new Map());

        console.log(`%c📹 [VideoFrameCache] Registered video: ${videoId.slice(0, 8)}`, 'color: #00aaff', {
            duration: `${info.duration.toFixed(2)}s`,
            totalFrames: info.totalFrames,
            fps,
        });
    }

    /**
     * Get the window size based on resolution
     */
    setAdaptiveWindow(width: number, height: number): void {
        const pixels = width * height;
        if (pixels > 3840 * 2160) {
            // 8K
            this.prefetchWindow = 15;
            this.maxFramesPerVideo = 30;
        } else if (pixels > 1920 * 1080) {
            // 4K
            this.prefetchWindow = 30;
            this.maxFramesPerVideo = 60;
        } else {
            // 1080p or lower
            this.prefetchWindow = 60;
            this.maxFramesPerVideo = 90;
        }

        console.log(`%c⚙️ [VideoFrameCache] Adaptive window: prefetch=${this.prefetchWindow}, maxCache=${this.maxFramesPerVideo}`,
            'color: #ffaa00', { resolution: `${width}x${height}` });
    }

    /**
     * Extract a single frame from video as ImageBitmap
     */
    private async extractFrame(video: HTMLVideoElement, timeInSeconds: number): Promise<ImageBitmap> {
        return new Promise((resolve, reject) => {
            const seekHandler = async () => {
                video.removeEventListener('seeked', seekHandler);
                try {
                    const bitmap = await createImageBitmap(video);
                    resolve(bitmap);
                } catch (err) {
                    reject(err);
                }
            };

            // Only seek if needed
            if (Math.abs(video.currentTime - timeInSeconds) > 0.01) {
                video.addEventListener('seeked', seekHandler);
                video.currentTime = timeInSeconds;
            } else {
                // Already at correct time
                createImageBitmap(video).then(resolve).catch(reject);
            }
        });
    }

    /**
     * Prefetch frames starting from a given frame number
     */
    async prefetchFrames(videoId: string, startFrame: number): Promise<void> {
        const info = this.videoInfo.get(videoId);
        if (!info) {
            console.warn(`%c⚠️ [VideoFrameCache] Video not registered: ${videoId.slice(0, 8)}`, 'color: #ff6600');
            return;
        }

        // Don't start new prefetch if one is in progress
        if (this.isPrefetching.get(videoId)) {
            return;
        }

        const cache = this.frameCache.get(videoId)!;
        const endFrame = Math.min(startFrame + this.prefetchWindow, info.totalFrames);

        // Check if we already have these frames
        let needsPrefetch = false;
        for (let f = startFrame; f < Math.min(startFrame + 5, endFrame); f++) {
            if (!cache.has(f)) {
                needsPrefetch = true;
                break;
            }
        }

        if (!needsPrefetch) {
            return; // Already have upcoming frames
        }

        this.isPrefetching.set(videoId, true);

        const prefetchStart = performance.now();
        let fetchedCount = 0;

        try {
            for (let frameNum = startFrame; frameNum < endFrame; frameNum++) {
                // Skip if already cached
                if (cache.has(frameNum)) {
                    continue;
                }

                const timestamp = frameNum / info.fps;

                // Skip if beyond video duration
                if (timestamp >= info.duration) {
                    break;
                }

                try {
                    const bitmap = await this.extractFrame(info.videoElement, timestamp);
                    cache.set(frameNum, { bitmap, timestamp });
                    fetchedCount++;
                } catch (err) {
                    // Frame extraction failed, continue
                }

                // Memory management: remove old frames
                if (cache.size > this.maxFramesPerVideo) {
                    this.evictOldFrames(videoId, startFrame);
                }
            }

            const prefetchTime = performance.now() - prefetchStart;
            if (fetchedCount > 0) {
                console.log(`%c📦 [VideoFrameCache] Prefetched ${fetchedCount} frames for ${videoId.slice(0, 8)} in ${prefetchTime.toFixed(0)}ms`,
                    'color: #00ff00', { startFrame, cacheSize: cache.size });
            }
        } finally {
            this.isPrefetching.set(videoId, false);
        }
    }

    /**
     * Start background prefetching (non-blocking)
     * DISABLED: Background prefetch was actually hurting performance by:
     * 1. Using the same slow video seeking as main render loop
     * 2. Competing for the video element, causing blocking
     * 3. Taking 366ms per frame in prefetch vs ~50ms in main loop
     * 
     * To truly speed this up, we would need WebCodecs VideoDecoder API
     * which decodes frames directly without seeking.
     */
    startBackgroundPrefetch(videoId: string, startFrame: number): void {
        // DISABLED - was hurting performance
        // The prefetch was taking 22 seconds for 60 frames!
        // console.log(`%c⏸️ [VideoFrameCache] Prefetch disabled for performance`, 'color: #888');
    }


    /**
     * Get a cached frame, or extract it on-demand
     */
    async getFrame(videoId: string, frameNumber: number): Promise<ImageBitmap | null> {
        const info = this.videoInfo.get(videoId);
        if (!info) {
            return null;
        }

        const cache = this.frameCache.get(videoId)!;

        // Check cache first
        if (cache.has(frameNumber)) {
            const cached = cache.get(frameNumber)!;
            return cached.bitmap;
        }

        // Not cached - extract on demand
        const timestamp = frameNumber / info.fps;
        if (timestamp >= info.duration) {
            return null;
        }

        try {
            const extractStart = performance.now();
            const bitmap = await this.extractFrame(info.videoElement, timestamp);
            cache.set(frameNumber, { bitmap, timestamp });

            const extractTime = performance.now() - extractStart;
            console.log(`%c⏱️ [VideoFrameCache] On-demand extract: ${videoId.slice(0, 8)} frame ${frameNumber} in ${extractTime.toFixed(0)}ms`,
                'color: #ff6600');

            return bitmap;
        } catch (err) {
            console.warn(`%c❌ [VideoFrameCache] Failed to extract frame ${frameNumber}`, 'color: #ff0000', err);
            return null;
        }
    }

    /**
     * Get frame by time instead of frame number
     */
    async getFrameAtTime(videoId: string, timeInSeconds: number): Promise<ImageBitmap | null> {
        const info = this.videoInfo.get(videoId);
        if (!info) {
            return null;
        }

        const frameNumber = Math.floor(timeInSeconds * info.fps);
        return this.getFrame(videoId, frameNumber);
    }

    /**
     * Check if we have a frame cached
     */
    hasFrame(videoId: string, frameNumber: number): boolean {
        const cache = this.frameCache.get(videoId);
        return cache?.has(frameNumber) ?? false;
    }

    /**
     * Get cache stats for a video
     */
    getCacheStats(videoId: string): { size: number; oldestFrame: number; newestFrame: number } | null {
        const cache = this.frameCache.get(videoId);
        if (!cache || cache.size === 0) {
            return null;
        }

        const frames = Array.from(cache.keys());
        return {
            size: cache.size,
            oldestFrame: Math.min(...frames),
            newestFrame: Math.max(...frames),
        };
    }

    /**
     * Evict frames older than startFrame
     */
    private evictOldFrames(videoId: string, currentFrame: number): void {
        const cache = this.frameCache.get(videoId);
        if (!cache) return;

        const framesToRemove: number[] = [];

        for (const [frameNum, cached] of cache.entries()) {
            // Remove frames more than 30 behind current
            if (frameNum < currentFrame - 30) {
                cached.bitmap.close(); // Release ImageBitmap memory
                framesToRemove.push(frameNum);
            }
        }

        for (const frameNum of framesToRemove) {
            cache.delete(frameNum);
        }

        if (framesToRemove.length > 0) {
            console.log(`%c🗑️ [VideoFrameCache] Evicted ${framesToRemove.length} old frames from ${videoId.slice(0, 8)}`,
                'color: #888');
        }
    }

    /**
     * Release frames before a certain frame number
     */
    releaseFramesBefore(videoId: string, frameNumber: number): void {
        this.evictOldFrames(videoId, frameNumber);
    }

    /**
     * Clear all cached frames for a video
     */
    clearVideo(videoId: string): void {
        const cache = this.frameCache.get(videoId);
        if (cache) {
            for (const cached of cache.values()) {
                cached.bitmap.close();
            }
            cache.clear();
        }
        this.videoInfo.delete(videoId);
        this.isPrefetching.delete(videoId);
        this.prefetchPromises.delete(videoId);

        console.log(`%c🧹 [VideoFrameCache] Cleared video: ${videoId.slice(0, 8)}`, 'color: #ff6600');
    }

    /**
     * Clear all cached frames
     */
    clearAll(): void {
        for (const videoId of this.frameCache.keys()) {
            this.clearVideo(videoId);
        }
        console.log('%c🧹 [VideoFrameCache] Cleared all caches', 'color: #ff6600');
    }

    /**
     * Get memory usage estimate
     */
    getMemoryUsage(): { totalFrames: number; estimatedMB: number } {
        let totalFrames = 0;
        let estimatedBytes = 0;

        for (const [videoId, cache] of this.frameCache.entries()) {
            const info = this.videoInfo.get(videoId);
            if (info && cache.size > 0) {
                const video = info.videoElement;
                const bytesPerFrame = video.videoWidth * video.videoHeight * 4; // RGBA
                totalFrames += cache.size;
                estimatedBytes += cache.size * bytesPerFrame;
            }
        }

        return {
            totalFrames,
            estimatedMB: estimatedBytes / (1024 * 1024),
        };
    }

    /**
     * Log current cache status
     */
    logStatus(): void {
        const memory = this.getMemoryUsage();
        console.log('%c📊 [VideoFrameCache] Status:', 'color: #00aaff; font-weight: bold', {
            videos: this.videoInfo.size,
            totalCachedFrames: memory.totalFrames,
            estimatedMemory: `${memory.estimatedMB.toFixed(1)}MB`,
            prefetchWindow: this.prefetchWindow,
        });
    }
}

// Export singleton instance
export const videoFrameCache = new VideoFrameCache();
