// ============================================
// Playback Controller - Centralized Playback Management
// Frame-accurate synchronization for smooth video playback
// ============================================

import type { PlaybackState, MediaElementState } from './types/engine';
import { frameCache } from './compositor/FrameCache';

export type PlaybackEventType = 'play' | 'pause' | 'seek' | 'timeupdate' | 'ended';

export interface PlaybackEvent {
    type: PlaybackEventType;
    currentTime: number;
    isPlaying: boolean;
}

type PlaybackListener = (event: PlaybackEvent) => void;

/**
 * Centralized playback controller for frame-accurate video synchronization
 */
export class PlaybackController {
    private static instance: PlaybackController;

    // State
    private currentTime: number = 0;
    private isPlaying: boolean = false;
    private playbackRate: number = 1;
    private duration: number = 0;

    // Media elements
    private mediaElements: Map<string, MediaElementState> = new Map();

    // Animation frame
    private animationFrameId: number | null = null;
    private lastFrameTime: number = 0;

    // Event listeners
    private listeners: Set<PlaybackListener> = new Set();

    // Sync configuration
    private readonly SYNC_THRESHOLD_PLAYING = 0.1; // seconds - threshold for re-sync during playback
    private readonly SYNC_THRESHOLD_PAUSED = 0.033; // seconds - threshold for re-sync when paused (~1 frame at 30fps)

    private constructor() { }

    static getInstance(): PlaybackController {
        if (!PlaybackController.instance) {
            PlaybackController.instance = new PlaybackController();
        }
        return PlaybackController.instance;
    }

    /**
     * Get current playback state
     */
    getState(): PlaybackState {
        return {
            currentTime: this.currentTime,
            isPlaying: this.isPlaying,
            playbackRate: this.playbackRate,
            duration: this.duration,
            isSeeking: false,
        };
    }

    /**
     * Set the duration (from timeline)
     */
    setDuration(duration: number): void {
        this.duration = duration;
    }

    /**
     * Register a media element for synchronization
     */
    registerMediaElement(
        id: string,
        element: HTMLVideoElement | HTMLAudioElement,
        startTime: number,
        duration: number,
        offset: number = 0,
        speed: number = 1,
        volume: number = 1,
        muted: boolean = false
    ): void {
        this.mediaElements.set(id, {
            id,
            element,
            startTime,
            duration,
            offset,
            speed,
            volume,
            muted,
        });

        // Apply initial settings
        element.playbackRate = speed * this.playbackRate;
        element.volume = volume;
        element.muted = muted;

        // Sync to current time
        this.syncMediaElement(id);
    }

    /**
     * Unregister a media element
     */
    unregisterMediaElement(id: string): void {
        const state = this.mediaElements.get(id);
        if (state) {
            state.element.pause();
            this.mediaElements.delete(id);
        }
    }

    /**
     * Update media element properties
     */
    updateMediaElement(
        id: string,
        updates: Partial<Omit<MediaElementState, 'id' | 'element'>>
    ): void {
        const state = this.mediaElements.get(id);
        if (state) {
            Object.assign(state, updates);

            // Apply changes
            if (updates.speed !== undefined) {
                state.element.playbackRate = updates.speed * this.playbackRate;
            }
            if (updates.volume !== undefined) {
                state.element.volume = updates.volume;
            }
            if (updates.muted !== undefined) {
                state.element.muted = updates.muted;
            }
        }
    }

    /**
     * Start playback
     */
    play(): void {
        if (this.isPlaying) return;

        this.isPlaying = true;
        this.lastFrameTime = performance.now();

        // Start all active media elements
        this.syncAllMediaElements();

        // Start animation loop
        this.startAnimationLoop();

        this.emit('play');
    }

    /**
     * Pause playback
     */
    pause(): void {
        if (!this.isPlaying) return;

        this.isPlaying = false;

        // Stop animation loop
        this.stopAnimationLoop();

        // Pause all media elements
        for (const state of this.mediaElements.values()) {
            if (!state.element.paused) {
                state.element.pause();
            }
        }

        this.emit('pause');
    }

    /**
     * Toggle play/pause
     */
    togglePlay(): void {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    /**
     * Seek to specific time
     */
    seek(time: number): void {
        this.currentTime = Math.max(0, Math.min(time, this.duration));

        // Sync all media elements to new time
        this.syncAllMediaElements();

        this.emit('seek');
    }

    /**
     * Set playback rate
     */
    setPlaybackRate(rate: number): void {
        this.playbackRate = rate;

        // Update all media elements
        for (const state of this.mediaElements.values()) {
            state.element.playbackRate = state.speed * rate;
        }
    }

    /**
     * Start animation loop for time updates
     */
    private startAnimationLoop(): void {
        if (this.animationFrameId !== null) return;

        const loop = (now: number) => {
            if (!this.isPlaying) {
                this.animationFrameId = null;
                return;
            }

            // Calculate delta time
            const deltaTime = (now - this.lastFrameTime) / 1000;
            this.lastFrameTime = now;

            // Update current time
            this.currentTime += deltaTime * this.playbackRate;

            // Check for end
            if (this.currentTime >= this.duration) {
                this.currentTime = this.duration;
                this.pause();
                this.emit('ended');
                return;
            }

            // Sync media elements (less frequently to reduce overhead)
            this.syncAllMediaElements();

            // Emit time update
            this.emit('timeupdate');

            // Continue loop
            this.animationFrameId = requestAnimationFrame(loop);
        };

        this.animationFrameId = requestAnimationFrame(loop);
    }

    /**
     * Stop animation loop
     */
    private stopAnimationLoop(): void {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    /**
     * Sync all registered media elements
     */
    private syncAllMediaElements(): void {
        for (const id of this.mediaElements.keys()) {
            this.syncMediaElement(id);
        }
    }

    /**
     * Sync a single media element
     */
    private syncMediaElement(id: string): void {
        const state = this.mediaElements.get(id);
        if (!state) return;

        const { element, startTime, duration, offset, speed } = state;

        // Check if element should be active at current time
        const isActive = this.currentTime >= startTime &&
            this.currentTime < startTime + duration;

        if (!isActive) {
            // Pause if not active
            if (!element.paused) {
                element.pause();
            }
            return;
        }

        // Calculate target time in media
        const timeIntoClip = this.currentTime - startTime;
        const mediaTime = (timeIntoClip * speed) + offset;

        // Clamp to valid range
        const clampedMediaTime = Math.max(0, Math.min(mediaTime, element.duration || Infinity));

        // Check if sync is needed
        const currentMediaTime = element.currentTime;
        const drift = Math.abs(currentMediaTime - clampedMediaTime);
        const threshold = this.isPlaying ? this.SYNC_THRESHOLD_PLAYING : this.SYNC_THRESHOLD_PAUSED;

        if (drift > threshold) {
            element.currentTime = clampedMediaTime;
        }

        // Play/pause based on playback state
        if (this.isPlaying) {
            if (element.paused && element.readyState >= 2) {
                element.play().catch(() => {
                    // Ignore play errors (user interaction required, etc.)
                });
            }
        } else {
            if (!element.paused) {
                element.pause();
            }
        }

        // Cache frame during playback for seeking
        if (element instanceof HTMLVideoElement && element.readyState >= 2) {
            frameCache.warmCache(id, clampedMediaTime, element);
        }
    }

    /**
     * Get cached frame for a clip
     */
    getCachedFrame(clipId: string, timestamp: number): HTMLCanvasElement | null {
        return frameCache.get(clipId, timestamp);
    }

    /**
     * Subscribe to playback events
     */
    subscribe(listener: PlaybackListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     * Emit event to all listeners
     */
    private emit(type: PlaybackEventType): void {
        const event: PlaybackEvent = {
            type,
            currentTime: this.currentTime,
            isPlaying: this.isPlaying,
        };

        for (const listener of this.listeners) {
            listener(event);
        }
    }

    /**
     * Get current time
     */
    getCurrentTime(): number {
        return this.currentTime;
    }

    /**
     * Set current time (for external sync)
     */
    setCurrentTime(time: number): void {
        if (Math.abs(this.currentTime - time) > 0.001) {
            this.currentTime = time;
            this.syncAllMediaElements();
        }
    }

    /**
     * Get playing state
     */
    getIsPlaying(): boolean {
        return this.isPlaying;
    }

    /**
     * Cleanup
     */
    dispose(): void {
        this.pause();
        this.mediaElements.clear();
        this.listeners.clear();
    }
}

export const playbackController = PlaybackController.getInstance();
