// ============================================
// Server Export Service
// Frontend service that calls the backend API for server-side FFmpeg export
// ============================================

import type { Track, CanvasDimension } from '@/types';
import type { ExportSettings, ExportProgress } from '../types/export';

// API base URL for video export
// NOTE: The main .env has NEXT_PUBLIC_API_BASE_URL set to port 5001 but backend is on 5000
// For video export, we use the correct backend port directly
const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost';
const API_BASE = isDev
    ? 'http://localhost:5000/api'  // Local dev backend (port 5000)
    : (process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.wildmindai.com') + '/api';

interface ServerExportOptions {
    tracks: Track[];
    duration: number;
    dimension: CanvasDimension;
    settings: ExportSettings;
    onProgress: (progress: ExportProgress) => void;
}

class ServerExportService {
    private pollingInterval: NodeJS.Timeout | null = null;
    private currentJobId: string | null = null;

    constructor() {
        // Setup page unload handler to cancel exports when user navigates away
        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', this.handleBeforeUnload);
            window.addEventListener('pagehide', this.handleBeforeUnload);
        }
    }

    /**
     * Handle page unload - cancel any active export
     */
    private handleBeforeUnload = () => {
        if (this.currentJobId) {
            // Use sendBeacon for reliable delivery during page unload
            const url = `${API_BASE}/video-export/cancel/${this.currentJobId}`;
            if (navigator.sendBeacon) {
                navigator.sendBeacon(url);
            } else {
                // Fallback to fetch with keepalive
                fetch(url, { method: 'POST', keepalive: true }).catch(() => { });
            }
            console.log(`[ServerExport] 🛑 Cancelling export on page unload: ${this.currentJobId}`);
            this.currentJobId = null;
        }
    };

    /**
     * Check if server-side export is available
     * Returns true if the backend video-export API responds
     */
    async isAvailable(): Promise<boolean> {
        try {
            // Use AbortController for quick timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);

            // Try to start a job - if it returns any JSON response, server is available
            const response = await fetch(`${API_BASE}/video-export/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            // Check if we got a successful response
            if (response.ok) {
                // Clean up the test job we just created
                const data = await response.json();
                if (data.jobId) {
                    fetch(`${API_BASE}/video-export/${data.jobId}`, { method: 'DELETE' }).catch(() => { });
                }
                console.log('[ServerExport] Server available - routes loaded');
                return true;
            }

            // 404 means routes not loaded
            console.log('[ServerExport] Server not available - status:', response.status);
            return false;
        } catch (error) {
            // Network error or abort - server not available
            console.log('[ServerExport] Server not available:', error instanceof Error ? error.message : 'unknown');
            return false;
        }
    }

    /**
     * Export video using server-side FFmpeg
     */
    async export(options: ServerExportOptions): Promise<Blob> {
        const { tracks, duration, dimension, settings, onProgress } = options;

        onProgress({ phase: 'preparing', progress: 0 });

        // Step 1: Start export job
        const startResponse = await fetch(`${API_BASE}/video-export/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!startResponse.ok) {
            throw new Error('Failed to start export job');
        }

        const { jobId } = await startResponse.json();
        this.currentJobId = jobId; // Track current job for cleanup on page unload
        console.log(`[ServerExport] Started job ${jobId}`);

        onProgress({ phase: 'preparing', progress: 5 });

        // Step 2: Collect and upload assets
        const assets = this.collectAssets(tracks);

        if (assets.length > 0) {
            onProgress({ phase: 'preparing', progress: 10 });
            await this.uploadAssets(jobId, assets, (uploadProgress) => {
                onProgress({
                    phase: 'rendering',
                    progress: 10 + uploadProgress * 0.15 // 10-25%
                });
            });
        }

        // Step 3: Render and upload text frames
        const { renderAllTextFrames, getTextItems } = await import('./TextFrameRenderer');
        const textItems = getTextItems(tracks);

        if (textItems.length > 0) {
            onProgress({ phase: 'rendering', progress: 25 });
            console.log(`[ServerExport] Rendering ${textItems.length} text items as frame sequences...`);

            const textSequences = await renderAllTextFrames(
                tracks,
                dimension.width,
                dimension.height,
                settings.fps,
                (phase, progress) => {
                    onProgress({
                        phase: 'rendering',
                        progress: 25 + progress * 0.15 // 25-40%
                    });
                    console.log(`[ServerExport] ${phase}: ${Math.round(progress * 100)}%`);
                }
            );

            // Upload text frame sequences
            await this.uploadTextFrames(jobId, textSequences, (uploadProgress) => {
                onProgress({
                    phase: 'rendering',
                    progress: 40 + uploadProgress * 0.1 // 40-50%
                });
            });
        }

        // Step 3: Start processing
        const timeline = {
            tracks: tracks.map(track => ({
                id: track.id,
                type: track.type,
                items: track.items.map(item => ({
                    ...item,
                    localPath: undefined // Will be set by server
                }))
            })),
            duration,
            dimension: { width: settings.resolution.width, height: settings.resolution.height }
        };

        // DEBUG: Log timeline with transitions/animations
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('%c📤 SERVER EXPORT - TIMELINE DATA', 'font-weight: bold; font-size: 14px; color: #00ff00');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        for (const track of tracks) {
            for (const item of track.items) {
                if (item.transition) {
                    console.log(`%c🔀 TRANSITION: "${item.name}"`, 'color: #ff00ff', item.transition);
                }
                if (item.animation) {
                    console.log(`%c💫 ANIMATION: "${item.name}"`, 'color: #00ffff', item.animation);
                }
            }
        }
        console.log('%cFull timeline:', 'color: #999', JSON.stringify(timeline, null, 2).substring(0, 2000));

        // Log audio sources in browser console
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('%c🎵 SERVER EXPORT - AUDIO INFO', 'font-weight: bold; font-size: 14px; color: #00aaff');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        for (const track of tracks) {
            if (track.type === 'audio') {
                for (const item of track.items) {
                    console.log(`%c🎵 Audio Track: ${item.name}`, 'color: #00ff00');
                    console.log(`   └─ Duration: ${item.duration.toFixed(2)}s, Start: ${item.start.toFixed(2)}s`);
                }
            }
            if (track.type === 'video') {
                for (const item of track.items) {
                    if (item.type === 'video') {
                        if (item.muteVideo) {
                            console.log(`%c🔇 Video MUTED (no audio): ${item.name}`, 'color: #ff6600');
                        } else {
                            console.log(`%c🎬 Video with audio: ${item.name}`, 'color: #00ff00');
                            console.log(`   └─ Duration: ${item.duration.toFixed(2)}s, Start: ${item.start.toFixed(2)}s`);
                        }
                    }
                }
            }
        }

        // Count audio sources
        const audioCount = tracks.filter(t => t.type === 'audio').flatMap(t => t.items).length;
        const videoAudioCount = tracks.filter(t => t.type === 'video')
            .flatMap(t => t.items)
            .filter(i => i.type === 'video' && !i.muteVideo).length;

        console.log(`%c📊 Total: ${audioCount} audio track(s) + ${videoAudioCount} video audio(s)`, 'color: #ffaa00');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');


        const processResponse = await fetch(`${API_BASE}/video-export/process/${jobId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                timeline,
                settings: {
                    resolution: settings.resolution,
                    fps: settings.fps,
                    quality: settings.quality,
                    format: settings.format,
                    useHardwareAccel: settings.useGPU
                }
            })
        });

        if (!processResponse.ok) {
            throw new Error('Failed to start processing');
        }

        // Step 4: Poll for progress
        onProgress({ phase: 'encoding', progress: 30 });

        let errorCount = 0;
        const MAX_ERRORS = 5;

        return new Promise((resolve, reject) => {
            this.pollingInterval = setInterval(async () => {
                try {
                    const statusResponse = await fetch(`${API_BASE}/video-export/status/${jobId}`);

                    if (!statusResponse.ok) {
                        throw new Error(`Status check failed: ${statusResponse.status}`);
                    }

                    const status = await statusResponse.json();
                    errorCount = 0; // Reset on success

                    if (status.status === 'complete' && status.downloadReady) {
                        this.stopPolling();
                        onProgress({ phase: 'finalizing', progress: 95 });

                        // Download the video
                        const downloadResponse = await fetch(`${API_BASE}/video-export/download/${jobId}`);
                        const blob = await downloadResponse.blob();

                        // Clear current job ID after successful download
                        this.currentJobId = null;

                        onProgress({ phase: 'complete', progress: 100 });
                        resolve(blob);
                    } else if (status.status === 'error' || status.status === 'cancelled') {
                        this.stopPolling();
                        this.currentJobId = null;
                        reject(new Error(status.error || 'Export failed'));
                    } else {
                        // Update progress
                        const progress = 30 + (status.progress || 0) * 0.65; // 30-95%
                        onProgress({ phase: 'encoding', progress });
                    }
                } catch (error) {
                    errorCount++;
                    console.error(`[ServerExport] Polling error (${errorCount}/${MAX_ERRORS}):`, error);

                    if (errorCount >= MAX_ERRORS) {
                        this.stopPolling();
                        this.currentJobId = null;
                        reject(new Error('Server connection lost. Please try client-side export instead.'));
                    }
                }
            }, 2000); // Poll every 2 seconds instead of 1
        });
    }

    /**
     * Collect all media assets from tracks
     */
    private collectAssets(tracks: Track[]): { id: string; name: string; blob: Blob | null; url: string }[] {
        const assets: { id: string; name: string; blob: Blob | null; url: string }[] = [];

        for (const track of tracks) {
            for (const item of track.items) {
                if ((item.type === 'video' || item.type === 'image' || item.type === 'audio') && item.src) {
                    assets.push({
                        id: item.id,
                        name: item.name || item.id,
                        blob: null,
                        url: item.src
                    });
                }
            }
        }

        return assets;
    }

    /**
     * Upload assets to server
     */
    private async uploadAssets(
        jobId: string,
        assets: { id: string; name: string; url: string }[],
        onProgress: (progress: number) => void
    ): Promise<void> {
        const formData = new FormData();
        let uploadedCount = 0;

        for (const asset of assets) {
            try {
                // Fetch the asset as blob if it's a URL
                const response = await fetch(asset.url);
                const blob = await response.blob();

                // Add to form data
                const filename = `${asset.id}-${asset.name}`;
                formData.append('files', blob, filename);

                uploadedCount++;
                onProgress(uploadedCount / assets.length);
            } catch (error) {
                console.warn(`[ServerExport] Failed to fetch asset ${asset.name}:`, error);
            }
        }

        // Upload all files
        await fetch(`${API_BASE}/video-export/upload/${jobId}`, {
            method: 'POST',
            body: formData
        });
    }

    /**
     * Upload text frame sequences to server
     * Each sequence is uploaded as a series of PNG frames that the server will convert to video
     */
    private async uploadTextFrames(
        jobId: string,
        sequences: Array<{
            textItemId: string;
            frames: Blob[];
            fps: number;
            startTime: number;
            duration: number;
            width: number;
            height: number;
        }>,
        onProgress: (progress: number) => void
    ): Promise<void> {
        const totalFrames = sequences.reduce((sum, seq) => sum + seq.frames.length, 0);
        let uploadedFrames = 0;

        for (const sequence of sequences) {
            const formData = new FormData();

            // Add metadata
            formData.append('metadata', JSON.stringify({
                textItemId: sequence.textItemId,
                fps: sequence.fps,
                startTime: sequence.startTime,
                duration: sequence.duration,
                width: sequence.width,
                height: sequence.height,
                frameCount: sequence.frames.length
            }));

            // Add all frames
            for (let i = 0; i < sequence.frames.length; i++) {
                const paddedIndex = String(i).padStart(5, '0');
                formData.append('frames', sequence.frames[i], `frame_${paddedIndex}.png`);
                uploadedFrames++;
                onProgress(uploadedFrames / totalFrames);
            }

            // Upload this sequence
            console.log(`[ServerExport] Uploading text sequence ${sequence.textItemId}: ${sequence.frames.length} frames`);

            await fetch(`${API_BASE}/video-export/upload-text-frames/${jobId}`, {
                method: 'POST',
                body: formData
            });
        }
    }

    /**
     * Stop polling
     */
    private stopPolling(): void {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    /**
     * Cancel export and cleanup
     */
    cancel(jobId?: string): void {
        this.stopPolling();
        const id = jobId || this.currentJobId;
        if (id) {
            // Use the cancel endpoint to stop processing and cleanup
            fetch(`${API_BASE}/video-export/cancel/${id}`, { method: 'POST' }).catch(() => { });
            this.currentJobId = null;
        }
    }
}

export const serverExportService = new ServerExportService();

