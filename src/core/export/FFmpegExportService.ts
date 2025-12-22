// ============================================
// FFmpeg Export Service
// Uses FFmpeg.wasm for professional-grade video export in browser
// Produces smooth, high-quality video output
// ============================================

// FFmpeg imports are done dynamically to prevent Next.js bundling issues
// import { FFmpeg } from '@ffmpeg/ffmpeg';
// import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { Track, TimelineItem, CanvasDimension, Transition, Animation } from '@/types';
import { getAdjustmentStyle, getPresetFilterStyle, getTextEffectStyle, DEFAULT_ADJUSTMENTS } from '@/types';
import type { ExportSettings, ExportProgress } from '../types/export';

export interface FFmpegExportOptions {
    tracks: Track[];
    duration: number;
    dimension: CanvasDimension;
    settings: ExportSettings;
    onProgress: (progress: ExportProgress) => void;
}

// Internal type for rendering items with transition info
interface RenderItem {
    item: TimelineItem;
    track: Track;
    role: 'main' | 'outgoing';
    transition: Transition | null;
    transitionProgress: number;
}

// Transition style properties for rendering
interface TransitionStyle {
    opacity?: number;
    scale?: number;
    scaleX?: number;  // For horizontal-only scaling (stretch, cube-rotate)
    scaleY?: number;  // For vertical-only scaling (flip-3d)
    rotate?: number;
    translateX?: number;
    translateY?: number;
    blur?: number;
    skewX?: number;   // For datamosh/glitch effects
    skewY?: number;
    // Filter effects
    brightness?: number;
    contrast?: number;
    saturate?: number;
    sepia?: number;
    hueRotate?: number; // degrees
    // Clip path types
    clipType?: 'none' | 'inset' | 'circle' | 'polygon';
    clipInset?: { top: number; right: number; bottom: number; left: number }; // percentages
    clipCircle?: { radius: number; cx: number; cy: number }; // radius as %, cx/cy as %
    clipPolygon?: Array<{ x: number; y: number }>; // array of points as %
    // Blend mode
    blendMode?: GlobalCompositeOperation;
}

class FFmpegExportService {
    // Using 'any' because FFmpeg is loaded dynamically from CDN
    private ffmpeg: any = null;
    private loaded = false;
    private loading = false;
    private mediaCache: Map<string, HTMLVideoElement | HTMLImageElement> = new Map();

    // Dynamic batch size calculated based on resolution
    private getBatchSize(width: number, height: number): number {
        const pixels = width * height;
        // 4K (3840x2160) = 8.3M pixels -> batch size 5
        // 2K (2560x1440) = 3.7M pixels -> batch size 10
        // 1080p (1920x1080) = 2M pixels -> batch size 20
        // 720p (1280x720) = 0.9M pixels -> batch size 30
        if (pixels >= 8000000) return 5;  // 4K+
        if (pixels >= 3500000) return 10; // 2K
        if (pixels >= 2000000) return 15; // 1080p
        return 30; // 720p and below
    }

    /**
     * Check if FFmpeg is available in browser
     */
    isSupported(): boolean {
        return typeof SharedArrayBuffer !== 'undefined';
    }

    /**
     * Helper to load scripts dynamically from CDN
     */
    private loadScript(src: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.crossOrigin = 'anonymous';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
            document.head.appendChild(script);
        });
    }

    /**
     * Load FFmpeg.wasm (one-time, ~25MB download)
     * Loaded via CDN to avoid Next.js bundling issues
     */
    async load(onProgress?: (progress: number) => void): Promise<boolean> {
        if (this.loaded) return true;
        if (this.loading) {
            // Wait for loading to complete
            while (this.loading) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return this.loaded;
        }

        this.loading = true;

        try {
            // Load FFmpeg scripts from CDN (using unpkg)
            await this.loadScript('https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js');
            await this.loadScript('https://unpkg.com/@ffmpeg/util@0.12.1/dist/umd/index.js');

            // Access globals exposed by UMD scripts
            // @ts-ignore
            const { FFmpeg } = window.FFmpegWASM;
            // @ts-ignore
            const { toBlobURL } = window.FFmpegUtil;

            this.ffmpeg = new FFmpeg();

            // Use CDN for WASM files
            const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

            this.ffmpeg.on('progress', ({ progress }: { progress: number }) => {
                onProgress?.(progress * 100);
            });

            this.ffmpeg.on('log', ({ message }: { message: string }) => {
                console.log('[FFmpeg]', message);
            });

            await this.ffmpeg.load({
                coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
                wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
            });

            this.loaded = true;
            console.log('%c✅ FFmpeg.wasm loaded successfully!', 'color: #00ff00; font-weight: bold');
            return true;

        } catch (error) {
            console.error('[FFmpegExportService] Failed to load FFmpeg:', error);
            this.loaded = false;
            return false;
        } finally {
            this.loading = false;
        }
    }

    /**
     * Export video using FFmpeg
     * OPTIMIZED for speed:
     * 1. Uses JPEG instead of PNG (faster encoding)
     * 2. Uses 'ultrafast' FFmpeg preset
     * 3. Reduced video seek wait time
     */
    async export(options: FFmpegExportOptions): Promise<Blob> {
        const { tracks, duration, dimension, settings, onProgress } = options;

        if (!this.ffmpeg || !this.loaded) {
            throw new Error('FFmpeg not loaded. Call load() first.');
        }

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('%c🎬 STARTING FFMPEG EXPORT', 'font-weight: bold; font-size: 16px; color: #ff6600');
        console.log(`%c📐 Resolution: ${settings.resolution.width}x${settings.resolution.height}`, 'color: #00aaff');
        console.log(`%c⏱️  Duration: ${duration.toFixed(2)}s`, 'color: #00aaff');
        console.log(`%c🎞️  FPS: ${settings.fps}`, 'color: #00aaff');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        onProgress({ phase: 'preparing', progress: 0 });

        // Create offscreen canvas for rendering
        const canvas = document.createElement('canvas');
        canvas.width = settings.resolution.width;
        canvas.height = settings.resolution.height;
        const ctx = canvas.getContext('2d')!;

        const totalFrames = Math.ceil(duration * settings.fps);
        const framePrefix = 'frame_';

        // Calculate resolution-aware batch size for memory management
        const isHighRes = settings.resolution.width >= 3840 || settings.resolution.height >= 2160;
        const batchSize = this.getBatchSize(settings.resolution.width, settings.resolution.height);
        const frameSizeMB = (settings.resolution.width * settings.resolution.height * 4) / (1024 * 1024);

        console.log(`%c📊 Export Configuration:`, 'color: #00aaff; font-weight: bold');
        console.log(`   Resolution: ${settings.resolution.width}x${settings.resolution.height} (${isHighRes ? '4K/HIGH-RES' : 'Standard'})`);
        console.log(`   Frame size: ~${frameSizeMB.toFixed(1)}MB RGBA`);
        console.log(`   Batch size: ${batchSize} frames (memory-optimized for resolution)`);
        console.log(`   Total frames: ${totalFrames} (${(totalFrames / settings.fps).toFixed(1)}s at ${settings.fps}fps)`);

        onProgress({ phase: 'rendering', progress: 5 });

        // Step 1: Preload all video elements BEFORE rendering frames
        console.log('%c📥 Preloading all media...', 'color: #00aaff');
        await this.preloadAllMedia(tracks);
        console.log('%c✅ Media preloaded!', 'color: #00ff00');

        // Step 2: Render frames in batches for better memory management
        console.log(`%c📸 Rendering ${totalFrames} frames in batches of ${batchSize}...`, 'color: #ffaa00');
        const totalBatches = Math.ceil(totalFrames / batchSize);
        let lastBatchTime = Date.now();

        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            const batchStart = batchIndex * batchSize;
            const batchEnd = Math.min(batchStart + batchSize, totalFrames);
            const batchFrames: string[] = [];

            console.log(`%c📦 Processing batch ${batchIndex + 1}/${totalBatches} (frames ${batchStart}-${batchEnd - 1})...`, 'color: #00aaff');

            // Render frames in this batch
            for (let frameIndex = batchStart; frameIndex < batchEnd; frameIndex++) {
                const currentTime = frameIndex / settings.fps;

                // Clear canvas
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // Render all active items at this time
                const itemsRendered = await this.renderFrame(tracks, currentTime, canvas, ctx);

                // Debug first few frames
                if (frameIndex < 3) {
                    console.log(`[Frame ${frameIndex}] time=${currentTime.toFixed(3)}s, items rendered: ${itemsRendered}`);
                }

                // Convert canvas to JPEG and write to FFmpeg filesystem
                const frameData = await this.canvasToUint8Array(canvas);
                const frameName = `${framePrefix}${String(frameIndex).padStart(5, '0')}.jpg`;
                await this.ffmpeg!.writeFile(frameName, frameData);
                batchFrames.push(frameName);

                // Update progress
                const progress = 5 + ((frameIndex + 1) / totalFrames) * 70; // 5-75%
                onProgress({
                    phase: 'rendering',
                    progress,
                    currentFrame: frameIndex + 1,
                    totalFrames,
                });
            }

            // Batch complete - cleanup media cache to free memory
            const batchTime = (Date.now() - lastBatchTime) / 1000;
            const framesPerSec = batchFrames.length / batchTime;
            const remainingBatches = totalBatches - batchIndex - 1;
            const eta = (remainingBatches * batchTime).toFixed(0);

            console.log(`   ✓ Batch ${batchIndex + 1}/${totalBatches} (${batchFrames.length} frames) | ${framesPerSec.toFixed(1)} fps | ETA: ${eta}s`);

            // More aggressive cleanup for 4K
            if (isHighRes) {
                this.cleanupMediaCaches();
            } else if (batchIndex % 3 === 0) {
                // Cleanup every 3rd batch for lower resolutions
                this.cleanupMediaCaches();
            }
            lastBatchTime = Date.now();
        }

        console.log('%c✅ All frames rendered!', 'color: #00ff00');
        onProgress({ phase: 'encoding', progress: 70 });

        // Step 2: Load and write audio files to FFmpeg filesystem
        const audioItems = this.getAudioItems(tracks);
        const videoItems = this.getVideoItemsWithAudio(tracks);
        const hasAudio = audioItems.length > 0 || videoItems.length > 0;

        // Store audio input info with timing
        type AudioInput = { file: string; startTime: number; offset: number; clipDuration: number };
        let audioInputs: AudioInput[] = [];

        if (hasAudio) {
            console.log(`%c🎵 Processing ${audioItems.length} audio + ${videoItems.length} video audio tracks...`, 'color: #00aaff');

            // Load audio tracks with timeline info
            for (let i = 0; i < audioItems.length; i++) {
                const item = audioItems[i];
                try {
                    const audioData = await this.fetchFile(item.src);
                    const audioFileName = `audio_${i}.mp3`;
                    await this.ffmpeg!.writeFile(audioFileName, audioData);
                    audioInputs.push({
                        file: audioFileName,
                        startTime: item.start,
                        offset: item.offset ?? 0,
                        clipDuration: item.duration
                    });
                    console.log(`   ✓ Audio loaded: ${item.name || audioFileName} (start: ${item.start.toFixed(2)}s, dur: ${item.duration.toFixed(2)}s)`);
                } catch (e) {
                    console.warn(`   ✗ Failed to load audio: ${item.name}`, e);
                }
            }

            // Extract audio from video clips with timeline info
            for (let i = 0; i < videoItems.length; i++) {
                const item = videoItems[i];
                try {
                    const videoData = await this.fetchFile(item.src);
                    const videoAudioFile = `video_audio_${i}.mp4`;
                    await this.ffmpeg!.writeFile(videoAudioFile, videoData);
                    audioInputs.push({
                        file: videoAudioFile,
                        startTime: item.start,
                        offset: item.offset ?? 0,
                        clipDuration: item.duration
                    });
                    console.log(`   ✓ Video audio: ${item.name || videoAudioFile} (start: ${item.start.toFixed(2)}s, offset: ${(item.offset ?? 0).toFixed(2)}s, dur: ${item.duration.toFixed(2)}s)`);
                } catch (e) {
                    console.warn(`   ✗ Failed to extract video audio: ${item.name}`, e);
                }
            }
        }

        onProgress({ phase: 'encoding', progress: 75 });

        // Step 3: Use FFmpeg to encode frames into video
        console.log('%c🎬 Encoding video with FFmpeg...', 'color: #ff6600');

        const outputFile = 'output.mp4';
        const tempVideoFile = 'temp_video.mp4';

        // First, encode just the video frames
        await this.ffmpeg.exec([
            '-framerate', String(settings.fps),
            '-i', `${framePrefix}%05d.jpg`,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '20',
            '-pix_fmt', 'yuv420p',
            '-y',
            tempVideoFile
        ]);

        // Then mux with audio if available
        if (audioInputs.length > 0) {
            console.log('%c🎵 Muxing audio with video (with trimming)...', 'color: #00aaff');

            // Create FFmpeg command with all audio inputs
            const ffmpegArgs: string[] = [
                '-i', tempVideoFile, // Video input (stream 0)
            ];

            // Add all audio inputs
            for (const audio of audioInputs) {
                ffmpegArgs.push('-i', audio.file);
            }

            // Build filter_complex to trim and position each audio
            // Each audio: trim from offset, pad with silence to position at startTime
            let filterParts: string[] = [];
            for (let i = 0; i < audioInputs.length; i++) {
                const audio = audioInputs[i];
                const streamIdx = i + 1; // 0 is video
                // atrim: trim audio from offset for clipDuration
                // adelay: delay audio to start at the right position (in ms)
                const delayMs = Math.round(audio.startTime * 1000);
                filterParts.push(
                    `[${streamIdx}:a]atrim=start=${audio.offset}:duration=${audio.clipDuration},asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs}[a${i}]`
                );
            }

            // Mix all trimmed/positioned audio streams
            const mixInputs = audioInputs.map((_, i) => `[a${i}]`).join('');
            const mixFilter = `${mixInputs}amix=inputs=${audioInputs.length}:duration=longest:dropout_transition=0[aout]`;
            filterParts.push(mixFilter);

            ffmpegArgs.push(
                '-filter_complex', filterParts.join(';'),
                '-map', '0:v',
                '-map', '[aout]',
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-t', String(duration), // Limit to timeline duration
                '-movflags', '+faststart',
                '-y',
                outputFile
            );

            await this.ffmpeg.exec(ffmpegArgs);
        } else {
            // No audio - just copy video with duration limit
            await this.ffmpeg.exec([
                '-i', tempVideoFile,
                '-c', 'copy',
                '-t', String(duration),
                '-movflags', '+faststart',
                '-y',
                outputFile
            ]);
        }

        onProgress({ phase: 'encoding', progress: 95 });

        // Step 4: Read output file
        const data = await this.ffmpeg.readFile(outputFile) as Uint8Array;
        // Create a copy of the buffer to avoid SharedArrayBuffer issues
        const arrayBuffer = new ArrayBuffer(data.byteLength);
        new Uint8Array(arrayBuffer).set(data);
        const videoBlob = new Blob([arrayBuffer], { type: 'video/mp4' });

        // Cleanup: delete frame files
        for (let i = 0; i < totalFrames; i++) {
            const frameName = `${framePrefix}${String(i).padStart(5, '0')}.jpg`;
            try {
                await this.ffmpeg.deleteFile(frameName);
            } catch {
                // Ignore cleanup errors
            }
        }
        // Cleanup audio and temp files
        try { await this.ffmpeg.deleteFile(tempVideoFile); } catch { }
        try { await this.ffmpeg.deleteFile(outputFile); } catch { }
        for (const audio of audioInputs) {
            try { await this.ffmpeg.deleteFile(audio.file); } catch { }
        }

        onProgress({ phase: 'complete', progress: 100 });

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`%c🎉 FFMPEG EXPORT COMPLETE!`, 'font-weight: bold; font-size: 16px; color: #00ff00');
        console.log(`%c📦 File size: ${(videoBlob.size / (1024 * 1024)).toFixed(2)} MB`, 'color: #00aaff');
        console.log(`%c🎵 Audio tracks: ${audioInputs.length}`, 'color: #00aaff');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        return videoBlob;
    }

    /**
     * Get audio items from tracks
     */
    private getAudioItems(tracks: Track[]): TimelineItem[] {
        const items: TimelineItem[] = [];
        for (const track of tracks) {
            if (track.type === 'audio') {
                items.push(...track.items);
            }
        }
        return items;
    }

    /**
     * Get video items that have embedded audio (and are NOT muted)
     * Respects the muteVideo flag from the editor
     */
    private getVideoItemsWithAudio(tracks: Track[]): TimelineItem[] {
        const items: TimelineItem[] = [];
        for (const track of tracks) {
            if (track.type === 'video' || track.id === 'main-video') {
                for (const item of track.items) {
                    if (item.type === 'video') {
                        // Check if video audio is muted
                        if (item.muteVideo === true) {
                            console.log(`   🔇 Video muted (skipping audio): ${item.name}`);
                        } else {
                            items.push(item);
                            console.log(`   🎬 Video with audio: ${item.name}`);
                        }
                    }
                }
            }
        }
        return items;
    }

    /**
     * Fetch file as Uint8Array
     */
    private async fetchFile(src: string): Promise<Uint8Array> {
        const response = await fetch(src);
        const buffer = await response.arrayBuffer();
        return new Uint8Array(buffer);
    }

    /**
     * Render a single frame with all active timeline items
     * Handles transitions between overlapping clips
     * MATCHES Canvas.tsx renderItems logic exactly
     */
    private async renderFrame(
        tracks: Track[],
        currentTime: number,
        canvas: HTMLCanvasElement,
        ctx: CanvasRenderingContext2D
    ): Promise<number> {
        // Get active items at current time with transition info
        const renderItems: RenderItem[] = [];

        for (const track of tracks) {
            if (track.isHidden) continue;

            // Only video/overlay tracks have transitions
            if (track.type !== 'video' && track.type !== 'overlay') {
                // Non-video tracks: simple render of all active items
                const activeItems = track.items.filter(i =>
                    currentTime >= i.start && currentTime < i.start + i.duration
                );
                activeItems.forEach(item => {
                    renderItems.push({ item, track, role: 'main', transition: null, transitionProgress: 0 });
                });
                continue;
            }

            // Sort items by start time
            const sortedItems = [...track.items].sort((a, b) => a.start - b.start);

            // Debug: Log items with transitions (only once per export at frame 0)
            if (currentTime < 0.05) {
                const itemsWithTransitions = sortedItems.filter(i => i.transition && i.transition.type !== 'none');
                console.log(`%c[FFmpeg] Track "${track.id}" type=${track.type} has ${sortedItems.length} items, ${itemsWithTransitions.length} with transitions`,
                    'color: #00ffff; font-weight: bold');
                if (itemsWithTransitions.length > 0) {
                    itemsWithTransitions.forEach(i => {
                        console.log(`   📍 "${i.name || i.src}" at ${i.start}s: transition=${i.transition?.type} timing=${i.transition?.timing || 'postfix'}`);
                    });
                }
            }

            // Find main item (the one playing at currentTime)
            const mainItemIndex = sortedItems.findIndex(i =>
                currentTime >= i.start && currentTime < i.start + i.duration
            );
            const mainItem = mainItemIndex !== -1 ? sortedItems[mainItemIndex] : null;

            // Find next item
            let nextItemIndex = -1;
            if (mainItem) {
                nextItemIndex = mainItemIndex + 1;
            } else {
                nextItemIndex = sortedItems.findIndex(i => i.start > currentTime);
            }
            const nextItem = (nextItemIndex !== -1 && nextItemIndex < sortedItems.length)
                ? sortedItems[nextItemIndex] : null;

            let isTransitioning = false;
            let transition: Transition | null = null;
            let progress = 0;
            let outgoingItem: TimelineItem | null = null;
            let incomingItem: TimelineItem | null = null;

            // CHECK 1: Incoming Transition on Main Item (Postfix / Overlap-Right)
            if (mainItem && mainItem.transition && mainItem.transition.type !== 'none') {
                const t = mainItem.transition;
                const timing = t.timing || 'postfix';
                const timeIntoClip = currentTime - mainItem.start;

                let transStart = 0;
                if (timing === 'postfix') transStart = 0;
                else if (timing === 'overlap') transStart = -t.duration / 2;
                else if (timing === 'prefix') transStart = -t.duration;

                // Check if we are in the transition window
                if (timeIntoClip >= transStart && timeIntoClip <= transStart + t.duration) {
                    isTransitioning = true;
                    transition = t;
                    progress = (timeIntoClip - transStart) / t.duration;
                    incomingItem = mainItem;
                    if (mainItemIndex > 0) outgoingItem = sortedItems[mainItemIndex - 1];
                }
            }

            // CHECK 2: Outgoing Transition on Next Item (Prefix / Overlap-Left)
            if (!isTransitioning && nextItem && nextItem.transition && nextItem.transition.type !== 'none') {
                const t = nextItem.transition;
                const timing = t.timing || 'postfix';
                const timeUntilNext = nextItem.start - currentTime;

                // Only relevant if timing puts transition BEFORE the clip starts
                if (timing === 'prefix' || timing === 'overlap') {
                    let transDurationBeforeStart = 0;
                    if (timing === 'prefix') transDurationBeforeStart = t.duration;
                    if (timing === 'overlap') transDurationBeforeStart = t.duration / 2;

                    if (timeUntilNext <= transDurationBeforeStart) {
                        isTransitioning = true;
                        transition = t;
                        progress = (transDurationBeforeStart - timeUntilNext) / t.duration;
                        incomingItem = nextItem;
                        if (nextItemIndex > 0) outgoingItem = sortedItems[nextItemIndex - 1];
                    }
                }
            }

            // RENDER
            if (isTransitioning && transition && incomingItem) {
                // Render Outgoing (if exists)
                if (outgoingItem) {
                    renderItems.push({
                        item: outgoingItem,
                        track,
                        role: 'outgoing',
                        transition,
                        transitionProgress: progress
                    });
                }
                // Render Incoming (Main)
                renderItems.push({
                    item: incomingItem,
                    track,
                    role: 'main',
                    transition,
                    transitionProgress: progress
                });
            } else if (mainItem) {
                // No transition, just render main item
                renderItems.push({
                    item: mainItem,
                    track,
                    role: 'main',
                    transition: null,
                    transitionProgress: 0
                });
            }
        }

        // Sort by layer (background first, then by z-index)
        renderItems.sort((a, b) => {
            if (a.item.isBackground && !b.item.isBackground) return -1;
            if (!a.item.isBackground && b.item.isBackground) return 1;
            return (a.item.layer || 0) - (b.item.layer || 0);
        });


        let renderedCount = 0;

        // === CLIP ALL CONTENT TO CANVAS BOUNDS ===
        // This matches the preview behavior where CSS overflow:hidden clips content to container
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, canvas.width, canvas.height);
        ctx.clip();

        // Render each item with transition effects
        for (const renderItem of renderItems) {
            const { item, role, transition, transitionProgress } = renderItem;

            // Debug: Log when rendering with transition
            if (transition && transition.type !== 'none' && transitionProgress > 0.01 && transitionProgress < 0.99) {
                console.log(`%c🎬 [FFmpeg] RENDERING TRANSITION: ${transition.type} role=${role} progress=${transitionProgress.toFixed(2)}`,
                    'color: #ff6600; font-weight: bold');
            }

            if (item.type === 'video' || item.type === 'image') {
                const success = await this.renderMediaItemWithTransition(
                    item, currentTime, canvas, ctx, role, transition, transitionProgress
                );
                if (success) renderedCount++;
            } else if (item.type === 'color') {
                this.renderColorItem(item, canvas, ctx);
                renderedCount++;
            } else if (item.type === 'text') {
                this.renderTextItem(item, canvas, ctx, currentTime);
                renderedCount++;
            }
        }

        // Restore context to remove clip
        ctx.restore();

        return renderedCount;
    }

    /**
     * Render item interface for transition handling
     */
    private renderMediaItemWithTransition(
        item: TimelineItem,
        currentTime: number,
        canvas: HTMLCanvasElement,
        ctx: CanvasRenderingContext2D,
        role: 'main' | 'outgoing',
        transition: Transition | null,
        transitionProgress: number
    ): Promise<boolean> {
        // If in transition, apply transition style
        if (transition && transition.type !== 'none') {
            const transitionStyle = this.calculateTransitionStyle(transition.type, transitionProgress, role, transition.direction || 'left');
            return this.renderMediaItemWithStyle(item, currentTime, canvas, ctx, transitionStyle);
        }

        // Normal render
        return this.renderMediaItem(item, currentTime, canvas, ctx);
    }

    /**
     * Calculate transition effect style based on type, direction, and progress
     * MATCHES Canvas.tsx getTransitionStyle exactly for full export parity
     */
    private calculateTransitionStyle(
        type: string,
        progress: number,
        role: 'main' | 'outgoing',
        direction: string = 'left'
    ): TransitionStyle {
        const p = progress;
        const outP = 1 - p;

        // Direction Multipliers
        let xMult = 1, yMult = 0;
        if (direction === 'right') { xMult = -1; yMult = 0; }
        else if (direction === 'up') { xMult = 0; yMult = 1; }
        else if (direction === 'down') { xMult = 0; yMult = -1; }

        // Easing functions
        const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

        switch (type) {
            // === DISSOLVES ===
            case 'dissolve': {
                const dissolveEase = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
                return role === 'main'
                    ? { opacity: Math.max(0.01, dissolveEase), brightness: 0.98 + dissolveEase * 0.02 }
                    : { opacity: Math.max(0.01, 1 - dissolveEase), brightness: 1 - (1 - dissolveEase) * 0.02 };
            }
            case 'film-dissolve': {
                const filmP = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
                const grain = Math.sin(p * 100) * 0.015;
                return role === 'main'
                    ? { opacity: Math.max(0.01, filmP), contrast: 1.05 + grain, saturate: 0.95 + filmP * 0.05, sepia: (1 - filmP) * 0.08 }
                    : { opacity: Math.max(0.01, 1 - filmP), contrast: 1.05 + grain, saturate: 1 - (1 - filmP) * 0.05, sepia: filmP * 0.08 };
            }
            case 'additive-dissolve':
                return role === 'main'
                    ? { opacity: p, blendMode: 'lighter' as GlobalCompositeOperation }
                    : { opacity: outP, blendMode: 'lighter' as GlobalCompositeOperation };
            case 'dip-to-black':
                if (role === 'outgoing') {
                    if (p < 0.5) {
                        const fadeOut = p * 2;
                        const easeOut = Math.pow(fadeOut, 2);
                        return { opacity: Math.max(0.05, 1 - easeOut), brightness: 1 - fadeOut * 0.6 };
                    }
                    return { opacity: 0.05 };
                }
                if (p > 0.5) {
                    const fadeIn = (p - 0.5) * 2;
                    const easeIn = 1 - Math.pow(1 - fadeIn, 2);
                    return { opacity: Math.max(0.05, easeIn), brightness: 0.4 + fadeIn * 0.6 };
                }
                return { opacity: 0.05 };
            case 'dip-to-white':
                if (role === 'outgoing') {
                    if (p < 0.5) {
                        const fadeOut = p * 2;
                        const easeOut = Math.pow(fadeOut, 1.5);
                        return { opacity: 1 - easeOut, brightness: 1 + fadeOut * 1.5, saturate: 1 - fadeOut * 0.7, contrast: 1 - fadeOut * 0.2 };
                    }
                    return { opacity: 0.05, brightness: 2.5, saturate: 0.3 };
                }
                if (p > 0.5) {
                    const fadeIn = (p - 0.5) * 2;
                    const easeIn = 1 - Math.pow(1 - fadeIn, 1.5);
                    return { opacity: Math.max(0.05, easeIn), brightness: 2.5 - fadeIn * 1.5, saturate: 0.3 + fadeIn * 0.7, contrast: 0.8 + fadeIn * 0.2 };
                }
                return { opacity: 0.05, brightness: 2.5, saturate: 0.3 };
            case 'fade-dissolve':
                if (role === 'outgoing') return { opacity: p < 0.5 ? 1 - p * 2 : 0.05 };
                return { opacity: p > 0.5 ? (p - 0.5) * 2 : 0.05 };

            // === SLIDES & PUSHES ===
            case 'slide':
                return role === 'main'
                    ? { translateX: xMult * 100 * outP, translateY: yMult * 100 * outP }
                    : {};
            case 'push':
                return role === 'main'
                    ? { translateX: xMult * 100 * outP, translateY: yMult * 100 * outP }
                    : { translateX: xMult * -100 * p, translateY: yMult * -100 * p };
            case 'whip':
                return role === 'main'
                    ? { translateX: xMult * 100 * outP, translateY: yMult * 100 * outP, blur: Math.sin(p * Math.PI) * 8 }
                    : { translateX: xMult * -100 * p, translateY: yMult * -100 * p, blur: Math.sin(p * Math.PI) * 8 };
            case 'split': {
                const splitInset = 50 * outP;
                return role === 'main'
                    ? (direction === 'up' || direction === 'down')
                        ? { clipType: 'inset', clipInset: { top: 0, right: splitInset, bottom: 0, left: splitInset } }
                        : { clipType: 'inset', clipInset: { top: splitInset, right: 0, bottom: splitInset, left: 0 } }
                    : {};
            }
            case 'band-slide':
                return role === 'main'
                    ? { translateX: xMult * 100 * outP, translateY: yMult * 100 * outP }
                    : { translateX: xMult * -100 * p, translateY: yMult * -100 * p };

            // === IRIS SHAPES ===
            case 'iris-box': {
                const easeBox = easeOutCubic(p);
                const insetPercent = 50 * (1 - easeBox);
                return role === 'main'
                    ? { clipType: 'inset', clipInset: { top: insetPercent, right: insetPercent, bottom: insetPercent, left: insetPercent }, brightness: 0.7 + 0.3 * p }
                    : { brightness: 1 - p * 0.3 };
            }
            case 'iris-round':
            case 'circle': {
                const easeCircle = easeOutCubic(p);
                return role === 'main'
                    ? { clipType: 'circle', clipCircle: { radius: easeCircle * 75, cx: 50, cy: 50 }, brightness: 0.7 + 0.3 * p }
                    : { brightness: 1 - p * 0.3 };
            }
            case 'iris-diamond': {
                const easeDiamond = easeOutCubic(p);
                const size = 50 * easeDiamond;
                return role === 'main'
                    ? {
                        clipType: 'polygon', clipPolygon: [
                            { x: 50, y: 50 - size },
                            { x: 50 + size, y: 50 },
                            { x: 50, y: 50 + size },
                            { x: 50 - size, y: 50 }
                        ], brightness: 0.7 + 0.3 * p
                    }
                    : { brightness: 1 - p * 0.3 };
            }
            case 'iris-cross': {
                const easeCross = easeOutCubic(p);
                const w = 20 + (80 * easeCross);
                const hw = w / 2;
                return role === 'main'
                    ? {
                        clipType: 'polygon', clipPolygon: [
                            { x: 50 - hw, y: 0 }, { x: 50 + hw, y: 0 }, { x: 50 + hw, y: 50 - hw },
                            { x: 100, y: 50 - hw }, { x: 100, y: 50 + hw }, { x: 50 + hw, y: 50 + hw },
                            { x: 50 + hw, y: 100 }, { x: 50 - hw, y: 100 }, { x: 50 - hw, y: 50 + hw },
                            { x: 0, y: 50 + hw }, { x: 0, y: 50 - hw }, { x: 50 - hw, y: 50 - hw }
                        ], brightness: 0.7 + 0.3 * p
                    }
                    : { brightness: 1 - p * 0.3 };
            }

            // === WIPES ===
            case 'wipe': {
                const easeWipe = easeOutCubic(p);
                const revealed = easeWipe * 100;
                let inset = { top: 0, right: 0, bottom: 0, left: 0 };
                if (direction === 'left') inset = { top: 0, right: 100 - revealed, bottom: 0, left: 0 };
                else if (direction === 'right') inset = { top: 0, right: 0, bottom: 0, left: 100 - revealed };
                else if (direction === 'up') inset = { top: 0, right: 0, bottom: 100 - revealed, left: 0 };
                else if (direction === 'down') inset = { top: 100 - revealed, right: 0, bottom: 0, left: 0 };
                return role === 'main'
                    ? { clipType: 'inset', clipInset: inset, brightness: 0.8 + 0.2 * p }
                    : { brightness: 1 - p * 0.2 };
            }
            case 'barn-doors': {
                const easeBarn = easeOutCubic(p);
                const insetX = 50 * (1 - easeBarn);
                return role === 'main'
                    ? { clipType: 'inset', clipInset: { top: 0, right: insetX, bottom: 0, left: insetX }, brightness: 0.7 + 0.3 * p }
                    : { brightness: 1 - p * 0.3 };
            }

            // === ZOOMS ===
            case 'cross-zoom': {
                const blurAmount = Math.sin(p * Math.PI) * 10;
                return role === 'outgoing'
                    ? { scale: 1 + p * 3, blur: blurAmount, opacity: outP }
                    : { scale: 3 - p * 2, blur: blurAmount, opacity: p };
            }
            case 'zoom-in':
                return role === 'main' ? { scale: 0.5 + 0.5 * p, opacity: p } : { opacity: outP };
            case 'zoom-out':
                return role === 'outgoing' ? { scale: 1 + p * 0.5, opacity: outP } : { opacity: p };

            // === SPINS ===
            case 'spin': {
                // Match Canvas.tsx: rotation + scale that shrinks at midpoint
                const rotation = role === 'outgoing' ? -p * 180 : (1 - p) * 180;
                const scaleSpin = 1 - Math.sin(p * Math.PI) * 0.5;
                return {
                    rotate: rotation,
                    scale: scaleSpin,
                    opacity: role === 'outgoing' ? outP : p
                };
            }

            // === FLASH ===
            case 'flash':
                // Match Canvas.tsx: bright flash with brightness filter
                return role === 'main'
                    ? { brightness: 1 + (1 - p) * 5, opacity: p }
                    : { brightness: 1 + p * 5, opacity: outP };

            // === BLUR ===
            case 'blur':
            case 'zoom-blur':
                return role === 'outgoing' ? { blur: p * 20, opacity: outP } : { blur: outP * 20, opacity: p };

            // === GLITCH ===
            case 'glitch': {
                // Match Canvas.tsx: hue-rotate, contrast, random offset, hard cut
                const glitchIntensity = Math.sin(p * Math.PI);
                const glitchOffset = Math.sin(p * 50) * 10 * glitchIntensity;
                if (role === 'outgoing') {
                    return p > 0.5 ? { opacity: 0 } : { translateX: -glitchOffset, translateY: glitchOffset, hueRotate: p * 90, contrast: 1.5, opacity: 1 };
                }
                return p > 0.5 ? { translateX: glitchOffset, translateY: -glitchOffset, hueRotate: p * 90, contrast: 1.5, opacity: 1 } : { opacity: 0 };
            }

            // === STACK ===
            case 'stack':
                return role === 'main'
                    ? { translateX: xMult * 100 * outP, translateY: yMult * 100 * outP, scale: 0.8 + 0.2 * p, blur: outP * 3, opacity: 0.3 + 0.7 * p }
                    : { scale: 1 - p * 0.2, blur: p * 2, opacity: 1 - p * 0.3 };

            // === MORPH ===
            case 'morph-cut':
                return role === 'main' ? { opacity: p, scale: 0.95 + 0.05 * p } : { opacity: outP, scale: 1 + 0.05 * outP };

            // === PAGE ===
            case 'page-peel':
                return role === 'main' ? { rotate: (1 - p) * -5, opacity: p } : { opacity: outP };

            // === FILM & LIGHT EFFECTS ===
            case 'film-burn': {
                // Match Canvas.tsx: brightness + sepia + saturate + contrast
                const burnIntensity = Math.sin(p * Math.PI);
                return {
                    scale: 1 + burnIntensity * 0.1,
                    brightness: 1 + burnIntensity * 3,
                    sepia: burnIntensity * 0.5,
                    saturate: 1 + burnIntensity,
                    contrast: 1 - burnIntensity * 0.2,
                    opacity: role === 'main' ? p : outP
                };
            }
            case 'light-leak':
                // Match Canvas.tsx: sepia + brightness
                return role === 'main'
                    ? { sepia: 1 - p, brightness: 1 + (1 - p), opacity: p }
                    : { sepia: p, brightness: 1 + p, opacity: outP };
            case 'luma-dissolve': {
                // Match Canvas.tsx: contrast + brightness
                const lumaP = 1 - Math.pow(1 - p, 2);
                return role === 'main'
                    ? { contrast: 1 + lumaP * 2, brightness: lumaP, opacity: lumaP }
                    : { contrast: 1 + (1 - lumaP) * 2, brightness: 1 - lumaP, opacity: 1 - lumaP };
            }

            // === DIGITAL EFFECTS ===
            case 'rgb-split': {
                // Match Canvas.tsx: hue-rotate cycling through 360deg, scale pulsing
                const scaleAmount = 1 + Math.sin(p * Math.PI) * 0.1;
                return {
                    hueRotate: p * 360,
                    scale: scaleAmount,
                    opacity: role === 'main' ? p : outP
                };
            }
            case 'pixelate':
            case 'chromatic-aberration':
                return role === 'main' ? { opacity: p, contrast: 1.1 } : { opacity: outP };
            case 'datamosh': {
                // Match Canvas.tsx: scale + skew distortion
                const skewAmount = Math.sin(p * 20) * 10;
                return {
                    scale: 1 + Math.sin(p * 10) * 0.1,
                    skewX: skewAmount,
                    opacity: role === 'main' ? p : outP
                };
            }

            // === DISTORTION ===
            case 'ripple':
                // Match Canvas.tsx: scale + blur
                return role === 'main'
                    ? { scale: 1 + Math.sin(p * 10) * 0.05, blur: Math.abs(Math.sin(p * 10)) * 5 }
                    : { opacity: outP };
            case 'ripple-dissolve':
                return { scale: 1 + Math.sin(p * Math.PI * 4) * 0.05, blur: Math.sin(p * Math.PI) * 2, opacity: role === 'main' ? p : outP };
            case 'stretch':
                // Match Canvas.tsx: scaleX horizontal stretch
                return role === 'main'
                    ? { scaleX: 0.1 + 0.9 * p, opacity: p }
                    : { scaleX: 1 + p, opacity: outP };
            case 'liquid':
                // Match Canvas.tsx: contrast + blur
                return role === 'main'
                    ? { contrast: 1.5, blur: (1 - p) * 10, opacity: p }
                    : { contrast: 1.5, blur: p * 10, opacity: outP };

            // === MOVEMENT ===
            case 'flow':
                return role === 'main'
                    ? { translateX: xMult * 100 * outP, translateY: yMult * 100 * outP, scale: 0.9 + 0.1 * p, opacity: p }
                    : { translateX: xMult * -50 * p, translateY: yMult * -50 * p, scale: 1 - 0.1 * p, opacity: outP };
            case 'smooth-wipe':
                return role === 'main' ? { translateX: 50 * outP, opacity: p } : { translateX: -50 * p, opacity: outP };
            case 'tile-drop':
                return role === 'main' ? { translateY: -100 * outP, opacity: p } : { translateY: 100 * p, opacity: outP };
            case 'whip-pan':
                return role === 'main' ? { translateX: 100 * outP, blur: Math.sin(p * Math.PI) * 10 } : { translateX: -100 * p, blur: Math.sin(p * Math.PI) * 10 };
            case 'film-roll':
                return role === 'main' ? { translateY: 100 * outP } : { translateY: -100 * p };

            // === ADVANCED DISSOLVES ===
            case 'non-additive-dissolve':
                return { opacity: role === 'main' ? Math.pow(p, 2) : Math.pow(outP, 2) };
            case 'flash-zoom-in':
                return role === 'main' ? { scale: 2 - p, opacity: p, brightness: 1 + outP * 0.5 } : { scale: 1 + p, opacity: outP };
            case 'flash-zoom-out':
                return role === 'main' ? { scale: 0.5 + p * 0.5, opacity: p } : { scale: 1 - p * 0.5, opacity: outP };

            // === SHAPE TRANSITIONS ===
            case 'shape-circle': {
                const easeShape = easeOutCubic(p);
                return role === 'main'
                    ? { clipType: 'circle', clipCircle: { radius: easeShape * 75, cx: 50, cy: 50 } }
                    : {};
            }
            case 'shape-heart': {
                const easeHeart = easeOutCubic(p);
                const s = easeHeart * 50;
                return role === 'main'
                    ? {
                        clipType: 'polygon', clipPolygon: [
                            { x: 50, y: 25 + (1 - easeHeart) * 25 },
                            { x: 50 + s, y: 15 },
                            { x: 50 + s * 0.8, y: 50 },
                            { x: 50, y: 75 },
                            { x: 50 - s * 0.8, y: 50 },
                            { x: 50 - s, y: 15 }
                        ]
                    }
                    : {};
            }
            case 'shape-triangle': {
                const easeTri = easeOutCubic(p);
                const ts = easeTri * 50;
                return role === 'main'
                    ? {
                        clipType: 'polygon', clipPolygon: [
                            { x: 50, y: 50 - ts },
                            { x: 50 + ts * 0.866, y: 50 + ts * 0.5 },
                            { x: 50 - ts * 0.866, y: 50 + ts * 0.5 }
                        ]
                    }
                    : {};
            }

            // DEFAULT
            default:
                return { opacity: role === 'main' ? p : outP };
        }
    }

    /**
     * Render media item with transition style applied
     */
    private async renderMediaItemWithStyle(
        item: TimelineItem,
        currentTime: number,
        canvas: HTMLCanvasElement,
        ctx: CanvasRenderingContext2D,
        style: TransitionStyle
    ): Promise<boolean> {
        const mediaEl = await this.loadMedia(item, currentTime);
        if (!mediaEl) return false;

        const { x, y, width, height } = this.calculateBounds(item, canvas, mediaEl);

        ctx.save();


        // Apply animation
        const animStyle = this.calculateAnimationStyle(item, currentTime);

        // Build filter string from transition style + item adjustments
        let filterString = this.buildFilterString(item);

        // Add transition filter effects
        if (style.blur) {
            filterString += ` blur(${style.blur}px)`;
        }
        if (style.brightness !== undefined && style.brightness !== 1) {
            filterString += ` brightness(${style.brightness})`;
        }
        if (style.contrast !== undefined && style.contrast !== 1) {
            filterString += ` contrast(${style.contrast})`;
        }
        if (style.saturate !== undefined && style.saturate !== 1) {
            filterString += ` saturate(${style.saturate})`;
        }
        if (style.sepia !== undefined && style.sepia !== 0) {
            filterString += ` sepia(${style.sepia})`;
        }
        if (style.hueRotate !== undefined && style.hueRotate !== 0) {
            filterString += ` hue-rotate(${style.hueRotate}deg)`;
        }

        // Add animation filter effects
        if (animStyle.blur) {
            filterString += ` blur(${animStyle.blur}px)`;
        }
        if (animStyle.brightness !== undefined) {
            filterString += ` brightness(${animStyle.brightness})`;
        }
        if (animStyle.contrast !== undefined) {
            filterString += ` contrast(${animStyle.contrast})`;
        }
        if (animStyle.saturate !== undefined) {
            filterString += ` saturate(${animStyle.saturate})`;
        }
        if (animStyle.hueRotate !== undefined) {
            filterString += ` hue-rotate(${animStyle.hueRotate}deg)`;
        }

        if (filterString) {
            ctx.filter = filterString.trim();
        }

        // Apply blend mode if specified
        if (style.blendMode) {
            ctx.globalCompositeOperation = style.blendMode;
        }

        // Animation calculated above

        // Base transform
        let tx = x + width / 2;
        let ty = y + height / 2;

        // Transition translate
        if (style.translateX) tx += (style.translateX / 100) * canvas.width;
        if (style.translateY) ty += (style.translateY / 100) * canvas.height;

        ctx.translate(tx, ty);

        // Transition + animation scale (including scaleX/scaleY for stretch, cube-rotate, flip-3d effects)
        const totalScaleX = (style.scale ?? 1) * (style.scaleX ?? 1) * (animStyle.scale ?? 1);
        const totalScaleY = (style.scale ?? 1) * (style.scaleY ?? 1) * (animStyle.scale ?? 1);
        if (totalScaleX !== 1 || totalScaleY !== 1) {
            ctx.scale(totalScaleX, totalScaleY);
        }

        // Apply skew transforms (for datamosh/glitch effects)
        if (style.skewX || style.skewY) {
            const skewXRad = ((style.skewX ?? 0) * Math.PI) / 180;
            const skewYRad = ((style.skewY ?? 0) * Math.PI) / 180;
            ctx.transform(1, Math.tan(skewYRad), Math.tan(skewXRad), 1, 0, 0);
        }

        // Transition + animation rotate
        const totalRotate = (style.rotate ?? 0) + (animStyle.rotate ?? 0);
        if (totalRotate) ctx.rotate((totalRotate * Math.PI) / 180);

        // Animation translate - convert percentages to pixels
        const animTx = (animStyle.translateX ?? 0) / 100 * canvas.width;
        const animTy = (animStyle.translateY ?? 0) / 100 * canvas.height;
        if (animTx !== 0 || animTy !== 0) {
            ctx.translate(animTx, animTy);
        }

        // Item transforms
        if (item.rotation) ctx.rotate((item.rotation * Math.PI) / 180);
        if (item.flipH || item.flipV) ctx.scale(item.flipH ? -1 : 1, item.flipV ? -1 : 1);

        // Opacity (combine all)
        const baseOpacity = (item.opacity ?? 100) / 100;
        const animOpacity = animStyle.opacity ?? 1;
        const transitionOpacity = style.opacity ?? 1;
        ctx.globalAlpha = baseOpacity * animOpacity * transitionOpacity;

        // Apply clip path for shape/wipe transitions
        if (style.clipType && style.clipType !== 'none') {
            ctx.beginPath();

            if (style.clipType === 'inset' && style.clipInset) {
                // Inset clip: top, right, bottom, left as percentages
                const clipTop = (style.clipInset.top / 100) * height;
                const clipRight = (style.clipInset.right / 100) * width;
                const clipBottom = (style.clipInset.bottom / 100) * height;
                const clipLeft = (style.clipInset.left / 100) * width;
                ctx.rect(
                    -width / 2 + clipLeft,
                    -height / 2 + clipTop,
                    width - clipLeft - clipRight,
                    height - clipTop - clipBottom
                );
            } else if (style.clipType === 'circle' && style.clipCircle) {
                // Circle clip: radius as %, cx/cy as %
                const radius = (style.clipCircle.radius / 100) * Math.max(width, height);
                const cx = (style.clipCircle.cx - 50) / 100 * width;
                const cy = (style.clipCircle.cy - 50) / 100 * height;
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            } else if (style.clipType === 'polygon' && style.clipPolygon) {
                // Polygon clip: array of points as percentages
                const points = style.clipPolygon;
                if (points.length > 0) {
                    const firstPoint = points[0];
                    ctx.moveTo(
                        (firstPoint.x - 50) / 100 * width,
                        (firstPoint.y - 50) / 100 * height
                    );
                    for (let i = 1; i < points.length; i++) {
                        ctx.lineTo(
                            (points[i].x - 50) / 100 * width,
                            (points[i].y - 50) / 100 * height
                        );
                    }
                    ctx.closePath();
                }
            }

            ctx.clip();
        }

        try {
            // Draw media with crop support
            const crop = item.crop || { x: 50, y: 50, zoom: 1 };
            const cropZoom = crop.zoom || 1;

            // Get source dimensions from media element
            let sourceWidth: number, sourceHeight: number;
            if (mediaEl instanceof HTMLVideoElement) {
                sourceWidth = mediaEl.videoWidth;
                sourceHeight = mediaEl.videoHeight;
            } else {
                sourceWidth = mediaEl.naturalWidth;
                sourceHeight = mediaEl.naturalHeight;
            }

            // Calculate the visible region based on crop pan (x, y are percentages)
            const visibleWidth = sourceWidth / cropZoom;
            const visibleHeight = sourceHeight / cropZoom;

            // Calculate source offset based on crop pan position (0-100%)
            const maxOffsetX = sourceWidth - visibleWidth;
            const maxOffsetY = sourceHeight - visibleHeight;
            const srcX = (crop.x / 100) * maxOffsetX;
            const srcY = (crop.y / 100) * maxOffsetY;

            // Draw with 9-argument form: (img, sx, sy, sw, sh, dx, dy, dw, dh)
            ctx.drawImage(
                mediaEl,
                srcX, srcY, visibleWidth, visibleHeight,
                -width / 2, -height / 2, width, height
            );

            // Draw border if defined (after image)
            if (item.border && item.border.width > 0 && !item.isBackground) {
                ctx.strokeStyle = item.border.color || '#000000';
                ctx.lineWidth = item.border.width;
                ctx.strokeRect(-width / 2, -height / 2, width, height);
            }

            ctx.restore();
            return true;
        } catch (e) {
            console.error('[FFmpegExportService] Error drawing media:', e);
            ctx.restore();
            return false;
        }
    }


    /**
     * Render video or image item with all effects
     * Supports: filters, animations, fit property, transformations
     */
    private async renderMediaItem(
        item: TimelineItem,
        currentTime: number,
        canvas: HTMLCanvasElement,
        ctx: CanvasRenderingContext2D
    ): Promise<boolean> {
        const mediaEl = await this.loadMedia(item, currentTime);
        if (!mediaEl) return false;

        // Calculate bounds with fit property support
        const { x, y, width, height } = this.calculateBounds(item, canvas, mediaEl);

        ctx.save();

        // === APPLY ANIMATION ===
        const animStyle = this.calculateAnimationStyle(item, currentTime);

        // === APPLY CSS FILTERS ===
        let filterString = this.buildFilterString(item);

        // Add animation filter effects
        if (animStyle.blur) {
            filterString += ` blur(${animStyle.blur}px)`;
        }
        if (animStyle.brightness !== undefined) {
            filterString += ` brightness(${animStyle.brightness})`;
        }
        if (animStyle.contrast !== undefined) {
            filterString += ` contrast(${animStyle.contrast})`;
        }
        if (animStyle.saturate !== undefined) {
            filterString += ` saturate(${animStyle.saturate})`;
        }
        if (animStyle.hueRotate !== undefined) {
            filterString += ` hue-rotate(${animStyle.hueRotate}deg)`;
        }

        if (filterString) {
            ctx.filter = filterString.trim();
        }

        // Base transform
        ctx.translate(x + width / 2, y + height / 2);

        // Animation transforms - with scaleX/scaleY support and percentage-to-pixel conversion
        const sX = (animStyle.scale ?? 1) * (animStyle.scaleX ?? 1);
        const sY = (animStyle.scale ?? 1) * (animStyle.scaleY ?? 1);
        if (sX !== 1 || sY !== 1) {
            ctx.scale(sX, sY);
        }
        if (animStyle.rotate) {
            ctx.rotate((animStyle.rotate * Math.PI) / 180);
        }
        // Convert percentage-based translate to pixels
        const animTx = (animStyle.translateX ?? 0) / 100 * canvas.width;
        const animTy = (animStyle.translateY ?? 0) / 100 * canvas.height;
        if (animTx !== 0 || animTy !== 0) {
            ctx.translate(animTx, animTy);
        }

        // Item transforms
        if (item.rotation) ctx.rotate((item.rotation * Math.PI) / 180);
        if (item.flipH || item.flipV) ctx.scale(item.flipH ? -1 : 1, item.flipV ? -1 : 1);

        // Opacity (combine with animation opacity)
        const baseOpacity = (item.opacity ?? 100) / 100;
        const animOpacity = animStyle.opacity ?? 1;
        ctx.globalAlpha = baseOpacity * animOpacity;

        // Draw content
        try {
            // Check if we need to crop
            const crop = item.crop || { x: 50, y: 50, zoom: 1 };
            const cropZoom = crop.zoom || 1;

            if (cropZoom > 1 || crop.x !== 50 || crop.y !== 50) {
                // Draw cropped
                let sourceWidth: number, sourceHeight: number;
                if (mediaEl instanceof HTMLVideoElement) {
                    sourceWidth = mediaEl.videoWidth;
                    sourceHeight = mediaEl.videoHeight;
                } else {
                    sourceWidth = mediaEl.naturalWidth;
                    sourceHeight = mediaEl.naturalHeight;
                }

                const visibleWidth = sourceWidth / cropZoom;
                const visibleHeight = sourceHeight / cropZoom;
                const maxOffsetX = sourceWidth - visibleWidth;
                const maxOffsetY = sourceHeight - visibleHeight;
                const srcX = (crop.x / 100) * maxOffsetX;
                const srcY = (crop.y / 100) * maxOffsetY;

                ctx.drawImage(
                    mediaEl,
                    srcX, srcY, visibleWidth, visibleHeight,
                    -width / 2, -height / 2, width, height
                );
            } else {
                // Draw normally
                ctx.drawImage(mediaEl, -width / 2, -height / 2, width, height);
            }

            // Apply background color overlay (tint)
            if (item.backgroundColor) {
                ctx.save();
                ctx.globalCompositeOperation = 'multiply';
                ctx.globalAlpha = 0.5;
                ctx.fillStyle = item.backgroundColor;
                ctx.fillRect(-width / 2, -height / 2, width, height);
                ctx.restore();
            }

            // Draw border if defined
            if (item.border && item.border.width > 0 && !item.isBackground) {
                ctx.strokeStyle = item.border.color || '#000000';
                ctx.lineWidth = item.border.width;
                ctx.strokeRect(-width / 2, -height / 2, width, height);
            }

            ctx.restore();
            return true;
        } catch (e) {
            console.error('[FFmpegExportService] Error drawing media:', e);
            ctx.restore();
            return false;
        }
    }

    /**
     * Build CSS filter string from item adjustments and presets
     */
    private buildFilterString(item: TimelineItem): string {
        const adjustmentFilter = getAdjustmentStyle(item, 1);
        const presetFilter = getPresetFilterStyle(item.filter || 'none');
        return [adjustmentFilter, presetFilter].filter(Boolean).join(' ').trim();
    }

    /**
     * Calculate animation style based on current time
     * Matches CSS keyframes in animations.css exactly
     */
    private calculateAnimationStyle(item: TimelineItem, currentTime: number): {
        opacity?: number;
        scale?: number;
        scaleX?: number;
        scaleY?: number;
        rotate?: number;
        translateX?: number;
        translateY?: number;
        blur?: number;
        brightness?: number;
        contrast?: number;
        saturate?: number;
        hueRotate?: number;
    } {
        if (!item.animation) return {};

        const animType = item.animation.type;
        const animDur = item.animation.duration || 1;
        const timing = item.animation.timing || 'enter';
        const itemTime = currentTime - item.start;
        const clipDur = item.duration;

        let progress = 0;
        let isActive = false;

        if (timing === 'enter' || timing === 'both') {
            if (itemTime < animDur) {
                progress = itemTime / animDur;
                isActive = true;
            }
        }
        if (timing === 'exit' || timing === 'both') {
            const exitStart = clipDur - animDur;
            if (itemTime >= exitStart && itemTime <= clipDur) {
                progress = 1 - ((itemTime - exitStart) / animDur);
                isActive = true;
            }
        }

        if (!isActive) return {};

        // CSS cubic-bezier(0.2, 0.8, 0.2, 1) approximation
        const cubicBezier = (t: number): number => {
            return t < 0.5
                ? 4 * t * t * t
                : 1 - Math.pow(-2 * t + 2, 3) / 2;
        };

        const p = cubicBezier(progress);
        const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

        switch (animType) {
            case 'fade-in': return { opacity: p };

            case 'boom':
                if (progress < 0.5) {
                    const t = progress / 0.5;
                    return { scale: 0.8 + 0.3 * t, opacity: t };
                } else {
                    const t = (progress - 0.5) / 0.5;
                    return { scale: 1.1 - 0.1 * t, opacity: 1 };
                }

            case 'bounce-left':
                if (progress < 0.6) {
                    const t = progress / 0.6;
                    return { translateX: lerp(-100, 20, t), opacity: Math.min(1, t * 1.5) };
                } else if (progress < 0.8) {
                    const t = (progress - 0.6) / 0.2;
                    return { translateX: lerp(20, -10, t), opacity: 1 };
                } else {
                    const t = (progress - 0.8) / 0.2;
                    return { translateX: lerp(-10, 0, t), opacity: 1 };
                }

            case 'bounce-right':
                if (progress < 0.6) {
                    const t = progress / 0.6;
                    return { translateX: lerp(100, -20, t), opacity: Math.min(1, t * 1.5) };
                } else if (progress < 0.8) {
                    const t = (progress - 0.6) / 0.2;
                    return { translateX: lerp(-20, 10, t), opacity: 1 };
                } else {
                    const t = (progress - 0.8) / 0.2;
                    return { translateX: lerp(10, 0, t), opacity: 1 };
                }

            case 'bounce-up':
                if (progress < 0.6) {
                    const t = progress / 0.6;
                    return { translateY: lerp(100, -20, t), opacity: Math.min(1, t * 1.5) };
                } else if (progress < 0.8) {
                    const t = (progress - 0.6) / 0.2;
                    return { translateY: lerp(-20, 10, t), opacity: 1 };
                } else {
                    const t = (progress - 0.8) / 0.2;
                    return { translateY: lerp(10, 0, t), opacity: 1 };
                }

            case 'bounce-down':
                if (progress < 0.6) {
                    const t = progress / 0.6;
                    return { translateY: lerp(-100, 20, t), opacity: Math.min(1, t * 1.5) };
                } else if (progress < 0.8) {
                    const t = (progress - 0.6) / 0.2;
                    return { translateY: lerp(20, -10, t), opacity: 1 };
                } else {
                    const t = (progress - 0.8) / 0.2;
                    return { translateY: lerp(-10, 0, t), opacity: 1 };
                }

            case 'rotate-cw-1': return { rotate: -360 + 360 * p, opacity: p };
            case 'rotate-cw-2': return { rotate: -180 + 180 * p, opacity: p };
            case 'rotate-ccw': return { rotate: 360 - 360 * p, opacity: p };
            case 'spin-open': return { scale: 0.1 + 0.9 * p, rotate: 720 - 720 * p, opacity: p };
            case 'spin-1': return { rotate: -90 + 90 * p, scale: 0.5 + 0.5 * p, opacity: p };

            case 'slide-down-up-1': return { translateY: 100 - 100 * p, opacity: p };
            case 'move-left': return { translateX: 100 - 100 * p, opacity: p };
            case 'move-right': return { translateX: -100 + 100 * p, opacity: p };
            case 'move-top': return { translateY: 100 - 100 * p, opacity: p };
            case 'move-bottom': return { translateY: -100 + 100 * p, opacity: p };

            case 'fade-slide-left': return { translateX: 50 - 50 * p, opacity: p };
            case 'fade-slide-right': return { translateX: -50 + 50 * p, opacity: p };
            case 'fade-slide-up': return { translateY: 50 - 50 * p, opacity: p };
            case 'fade-slide-down': return { translateY: -50 + 50 * p, opacity: p };
            case 'fade-zoom-in': return { scale: 0.8 + 0.2 * p, opacity: p };
            case 'fade-zoom-out': return { scale: 1.2 - 0.2 * p, opacity: p };

            case 'motion-blur': return { scale: 1.1 - 0.1 * p, opacity: p, blur: 20 * (1 - p) };
            case 'blur-in': return { opacity: p, blur: 10 * (1 - p) };
            case 'flash-drop': return { translateY: -50 + 50 * p, opacity: p, blur: 10 * (1 - p) };
            case 'flash-open': return { scale: 0.5 + 0.5 * p, opacity: p };
            case 'black-hole': return { scale: p, rotate: 180 - 180 * p, opacity: p };
            case 'screen-flicker':
                if (progress < 0.2) return { opacity: progress * 2.5 };
                if (progress < 0.4) return { opacity: 0.2 + 0.3 * Math.random() };
                if (progress < 0.6) return { opacity: 0.5 + 0.5 * ((progress - 0.4) / 0.2) };
                if (progress < 0.8) return { opacity: 0.8 + 0.2 * Math.random() };
                return { opacity: 1 };

            case 'pixelated-motion': return { opacity: p, blur: 10 * (1 - p) };

            case 'pulse-open':
                if (progress < 0.5) {
                    const t = progress / 0.5;
                    return { scale: 1.2 - 0.3 * t, blur: 2 * (1 - t), opacity: t };
                } else {
                    const t = (progress - 0.5) / 0.5;
                    return { scale: 0.9 + 0.1 * t, opacity: 1 };
                }

            case 'old-tv':
                if (progress < 0.5) {
                    const t = progress / 0.5;
                    return { scaleY: 0.01, scaleX: t, opacity: t };
                } else {
                    const t = (progress - 0.5) / 0.5;
                    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
                    return { scaleY: lerp(0.01, 1, t), scaleX: 1, opacity: 1 };
                }

            case 'round-open': return { scale: p, opacity: p };
            case 'expansion': return { scaleX: p, opacity: p };
            case 'shard-roll': return { rotate: 360 - 360 * p, scale: p, opacity: p };

            // FLIP ANIMATIONS: Simulate 3D rotateX/rotateY with scaleY/scaleX
            // Use minimum scale of 0.01 to prevent blank screen, combined with opacity fade
            case 'flip-down-1': {
                // CSS: perspective rotateX(90deg -> 0) - simulate with scaleY(0.01 -> 1)
                const minScale = 0.01;
                return { scaleY: minScale + (1 - minScale) * p, opacity: p };
            }
            case 'flip-down-2': {
                const minScale = 0.01;
                return { scaleY: minScale + (1 - minScale) * p, scale: 0.8 + 0.2 * p, opacity: p };
            }
            case 'flip-up-1': {
                const minScale = 0.01;
                return { scaleY: minScale + (1 - minScale) * p, opacity: p };
            }
            case 'flip-up-2': {
                const minScale = 0.01;
                return { scaleY: minScale + (1 - minScale) * p, scale: 0.8 + 0.2 * p, opacity: p };
            }

            case 'fly-in-rotate': return { translateX: -100 + 100 * p, rotate: -90 + 90 * p, opacity: p };
            case 'fly-in-flip': {
                // Simulate rotateY with scaleX - use min 0.01 to prevent blank
                const minScale = 0.01;
                return { translateX: -100 + 100 * p, scaleX: minScale + (1 - minScale) * p, opacity: p };
            }
            case 'fly-to-zoom': {
                // CSS: from scale(0) translateX(-100%) - use min scale to prevent blank
                const minScale = 0.01;
                return { scale: minScale + (1 - minScale) * p, translateX: -100 + 100 * p, opacity: p };
            }

            case 'grow-shrink':
                if (progress < 0.6) {
                    const t = progress / 0.6;
                    return { scale: 0.8 + 0.4 * t, opacity: t };
                } else {
                    const t = (progress - 0.6) / 0.4;
                    return { scale: 1.2 - 0.2 * t, opacity: 1 };
                }

            case 'stretch-in-left': return { scaleX: 2 - p, translateX: -50 + 50 * p, opacity: p, blur: 5 * (1 - p) };
            case 'stretch-in-right': return { scaleX: 2 - p, translateX: 50 - 50 * p, opacity: p, blur: 5 * (1 - p) };
            case 'stretch-in-up': return { scaleY: 2 - p, translateY: 50 - 50 * p, opacity: p, blur: 5 * (1 - p) };
            case 'stretch-in-down': return { scaleY: 2 - p, translateY: -50 + 50 * p, opacity: p, blur: 5 * (1 - p) };
            case 'stretch-to-full': return { scale: 0.5 + 0.5 * p, opacity: p };

            case 'tiny-zoom': {
                // CSS: from scale(0.1) - safe value
                return { scale: 0.1 + 0.9 * p, opacity: p };
            }
            case 'zoom-in-center': {
                // CSS: from scale(0) - use minimum to prevent blank
                const minScale = 0.01;
                return { scale: minScale + (1 - minScale) * p, opacity: p };
            }
            case 'zoom-in-1': {
                // CSS: 0% scale(0.5), 60% scale(1.1), 100% scale(1)
                if (progress < 0.6) {
                    const t = progress / 0.6;
                    return { scale: 0.5 + 0.6 * t, opacity: Math.min(1, t * 1.5) };
                } else {
                    const t = (progress - 0.6) / 0.4;
                    return { scale: 1.1 - 0.1 * t, opacity: 1 };
                }
            }
            case 'zoom-in-2': {
                // CSS: from scale(0.2)
                return { scale: 0.2 + 0.8 * p, opacity: p };
            }
            case 'zoom-in-left': {
                const minScale = 0.01;
                return { scale: minScale + (1 - minScale) * p, translateX: -50 + 50 * p, opacity: p };
            }
            case 'zoom-in-right': {
                const minScale = 0.01;
                return { scale: minScale + (1 - minScale) * p, translateX: 50 - 50 * p, opacity: p };
            }
            case 'zoom-in-top': {
                const minScale = 0.01;
                return { scale: minScale + (1 - minScale) * p, translateY: -50 + 50 * p, opacity: p };
            }
            case 'zoom-in-bottom': {
                const minScale = 0.01;
                return { scale: minScale + (1 - minScale) * p, translateY: 50 - 50 * p, opacity: p };
            }
            case 'zoom-out-1': return { scale: 1.5 - 0.5 * p, opacity: p };
            case 'zoom-out-2': return { scale: 2 - p, opacity: p };
            case 'zoom-out-3': return { scale: 3 - 2 * p, opacity: p, blur: 5 * (1 - p) };

            case 'wham':
                if (progress < 0.7) {
                    const t = progress / 0.7;
                    return { scale: 0.3 + 0.8 * t, opacity: t };
                } else {
                    const t = (progress - 0.7) / 0.3;
                    return { scale: 1.1 - 0.1 * t, opacity: 1 };
                }

            case 'to-left-1': return { translateX: 100 - 100 * p, opacity: p };
            case 'to-left-2': return { translateX: 50 - 50 * p, opacity: p };
            case 'to-right-1': return { translateX: -100 + 100 * p, opacity: p };
            case 'to-right-2': return { translateX: -50 + 50 * p, opacity: p };

            default: return { opacity: p };
        }
    }

    /**
     * Preload all media elements before rendering
     */
    private async preloadAllMedia(tracks: Track[]): Promise<void> {
        const mediaItems: TimelineItem[] = [];

        for (const track of tracks) {
            if (track.isHidden) continue;
            for (const item of track.items) {
                if (item.type === 'video' || item.type === 'image') {
                    mediaItems.push(item);
                }
            }
        }

        console.log(`[FFmpegExportService] Preloading ${mediaItems.length} media items...`);

        for (const item of mediaItems) {
            if (item.type === 'video') {
                const video = await this.createVideo(item);
                if (video) {
                    this.mediaCache.set(item.id, video);
                    console.log(`   ✓ Video preloaded: ${item.name || item.id}`);
                } else {
                    console.warn(`   ✗ Failed to preload video: ${item.name || item.id}`);
                }
            } else if (item.type === 'image') {
                const img = await this.loadMedia(item, 0);
                if (img) {
                    console.log(`   ✓ Image preloaded: ${item.name || 'image'}`);
                } else {
                    console.warn(`   ✗ Failed to preload image: ${item.name || 'image'}`);
                }
            }
        }
    }

    /**
     * Load media element (video or image)
     */
    private async loadMedia(item: TimelineItem, currentTime: number): Promise<HTMLImageElement | HTMLVideoElement | null> {
        if (item.type === 'image') {
            let img = this.mediaCache.get(item.src) as HTMLImageElement;
            if (img) return img;

            return new Promise((resolve) => {
                const newImg = new Image();

                // Handle CORS - don't set crossOrigin for blob/data URLs
                const isExternal = item.src.startsWith('http://') || item.src.startsWith('https://');
                const isBlobOrData = item.src.startsWith('blob:') || item.src.startsWith('data:');
                if (isExternal && !isBlobOrData) {
                    newImg.crossOrigin = 'anonymous';
                }

                const timeout = setTimeout(() => {
                    console.warn(`[FFmpegExportService] Image load timeout: ${item.src.substring(0, 50)}...`);
                    resolve(null);
                }, 10000); // 10 second timeout

                newImg.onload = () => {
                    clearTimeout(timeout);
                    console.log(`[FFmpegExportService] Image loaded: ${item.name || 'image'}`);
                    this.mediaCache.set(item.src, newImg);
                    resolve(newImg);
                };
                newImg.onerror = (e) => {
                    clearTimeout(timeout);
                    console.error(`[FFmpegExportService] Failed to load image: ${item.src.substring(0, 50)}...`, e);
                    resolve(null);
                };
                newImg.src = item.src;
            });
        }

        if (item.type === 'video') {
            let video = this.mediaCache.get(item.id) as HTMLVideoElement;

            if (!video) {
                const newVideo = await this.createVideo(item);
                if (!newVideo) return null;
                video = newVideo;
                this.mediaCache.set(item.id, video);
            }

            // Seek to correct time
            const speed = item.speed ?? 1;
            const offset = item.offset ?? 0;
            const timeInClip = (currentTime - item.start) * speed;
            const targetTime = Math.max(0, Math.min(offset + timeInClip, video.duration - 0.01));

            if (Math.abs(video.currentTime - targetTime) > 0.01) {
                video.currentTime = targetTime;
                await new Promise<void>((resolve) => {
                    const onSeeked = () => {
                        video.removeEventListener('seeked', onSeeked);
                        resolve();
                    };
                    video.addEventListener('seeked', onSeeked);
                    setTimeout(resolve, 50); // Fast timeout
                });
            }

            return video;
        }

        return null;
    }

    /**
     * Create video element
     */
    private createVideo(item: TimelineItem): Promise<HTMLVideoElement | null> {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.muted = true;
            video.playsInline = true;
            video.preload = 'auto';

            const timeout = setTimeout(() => resolve(null), 30000);

            video.onloadeddata = () => {
                clearTimeout(timeout);
                resolve(video);
            };
            video.onerror = () => {
                clearTimeout(timeout);
                resolve(null);
            };

            // Handle CORS
            const isExternal = item.src.startsWith('http://') || item.src.startsWith('https://');
            const isBlobOrData = item.src.startsWith('blob:') || item.src.startsWith('data:');
            if (isExternal && !isBlobOrData) {
                video.crossOrigin = 'anonymous';
            }

            video.src = item.src;
            video.load();
        });
    }

    /**
     * Render color item
     */
    private renderColorItem(item: TimelineItem, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
        const { x, y, width, height } = this.calculateBounds(item, canvas);
        ctx.save();
        ctx.globalAlpha = (item.opacity ?? 100) / 100;

        const colorSrc = item.src || '';

        // Check if it's a gradient (linear or radial)
        if (colorSrc.includes('linear-gradient')) {
            // Parse linear-gradient(angle, color1, color2, ...)
            const gradientFill = this.parseLinearGradient(colorSrc, x, y, width, height, ctx);
            if (gradientFill) {
                ctx.fillStyle = gradientFill;
            } else {
                ctx.fillStyle = '#000000'; // Fallback
            }
        } else if (colorSrc.includes('radial-gradient')) {
            // Parse radial-gradient(color1, color2, ...)
            const gradientFill = this.parseRadialGradient(colorSrc, x, y, width, height, ctx);
            if (gradientFill) {
                ctx.fillStyle = gradientFill;
            } else {
                ctx.fillStyle = '#000000'; // Fallback
            }
        } else {
            // Solid color
            ctx.fillStyle = colorSrc || '#000000';
        }

        ctx.fillRect(x, y, width, height);
        ctx.restore();
    }

    /**
     * Parse CSS linear-gradient and create Canvas gradient
     */
    private parseLinearGradient(
        css: string,
        x: number,
        y: number,
        width: number,
        height: number,
        ctx: CanvasRenderingContext2D
    ): CanvasGradient | null {
        try {
            // Extract content inside parentheses
            const match = css.match(/linear-gradient\(([^)]+)\)/);
            if (!match) return null;

            const content = match[1];
            const parts = content.split(',').map(s => s.trim());

            // First part might be angle or direction
            let angle = 180; // Default: top to bottom
            let colorStartIndex = 0;

            const firstPart = parts[0].toLowerCase();
            if (firstPart.includes('deg')) {
                angle = parseFloat(firstPart);
                colorStartIndex = 1;
            } else if (firstPart === 'to right') {
                angle = 90;
                colorStartIndex = 1;
            } else if (firstPart === 'to left') {
                angle = 270;
                colorStartIndex = 1;
            } else if (firstPart === 'to bottom') {
                angle = 180;
                colorStartIndex = 1;
            } else if (firstPart === 'to top') {
                angle = 0;
                colorStartIndex = 1;
            } else if (firstPart === 'to bottom right' || firstPart === 'to right bottom') {
                angle = 135;
                colorStartIndex = 1;
            } else if (firstPart === 'to bottom left' || firstPart === 'to left bottom') {
                angle = 225;
                colorStartIndex = 1;
            } else if (firstPart === 'to top right' || firstPart === 'to right top') {
                angle = 45;
                colorStartIndex = 1;
            } else if (firstPart === 'to top left' || firstPart === 'to left top') {
                angle = 315;
                colorStartIndex = 1;
            }

            // Extract colors
            const colors = parts.slice(colorStartIndex);
            if (colors.length < 2) return null;

            // Calculate gradient line endpoints based on angle
            const radians = (angle - 90) * (Math.PI / 180);
            const cx = x + width / 2;
            const cy = y + height / 2;
            const diagonal = Math.sqrt(width * width + height * height) / 2;

            const x1 = cx - Math.cos(radians) * diagonal;
            const y1 = cy - Math.sin(radians) * diagonal;
            const x2 = cx + Math.cos(radians) * diagonal;
            const y2 = cy + Math.sin(radians) * diagonal;

            const gradient = ctx.createLinearGradient(x1, y1, x2, y2);

            // Add color stops
            colors.forEach((color, i) => {
                // Handle color with percentage: "red 50%" -> extract just the color
                const colorParts = color.trim().split(/\s+/);
                const colorValue = colorParts[0];
                const stop = colorParts[1] ? parseFloat(colorParts[1]) / 100 : i / (colors.length - 1);
                gradient.addColorStop(Math.max(0, Math.min(1, stop)), colorValue);
            });

            return gradient;
        } catch (err) {
            console.warn('[FFmpegExport] Failed to parse linear-gradient:', css, err);
            return null;
        }
    }

    /**
     * Parse CSS radial-gradient and create Canvas gradient
     */
    private parseRadialGradient(
        css: string,
        x: number,
        y: number,
        width: number,
        height: number,
        ctx: CanvasRenderingContext2D
    ): CanvasGradient | null {
        try {
            // Extract content inside parentheses
            const match = css.match(/radial-gradient\(([^)]+)\)/);
            if (!match) return null;

            const content = match[1];
            const parts = content.split(',').map(s => s.trim());

            // Find the colors (skip shape/size/position prefixes)
            let colorStartIndex = 0;
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i].toLowerCase();
                if (part.includes('circle') || part.includes('ellipse') ||
                    part.includes('at ') || part.includes('closest') || part.includes('farthest')) {
                    colorStartIndex = i + 1;
                } else {
                    break;
                }
            }

            const colors = parts.slice(colorStartIndex);
            if (colors.length < 2) {
                // Try without skipping anything
                const allColors = parts.filter(p => !p.toLowerCase().includes('circle') && !p.toLowerCase().includes('ellipse'));
                if (allColors.length >= 2) {
                    return this.createRadialGradientFromColors(allColors, x, y, width, height, ctx);
                }
                return null;
            }

            return this.createRadialGradientFromColors(colors, x, y, width, height, ctx);
        } catch (err) {
            console.warn('[FFmpegExport] Failed to parse radial-gradient:', css, err);
            return null;
        }
    }

    private createRadialGradientFromColors(
        colors: string[],
        x: number,
        y: number,
        width: number,
        height: number,
        ctx: CanvasRenderingContext2D
    ): CanvasGradient {
        const cx = x + width / 2;
        const cy = y + height / 2;
        const radius = Math.max(width, height) / 2;

        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);

        colors.forEach((color, i) => {
            const colorParts = color.trim().split(/\s+/);
            const colorValue = colorParts[0];
            const stop = colorParts[1] ? parseFloat(colorParts[1]) / 100 : i / (colors.length - 1);
            gradient.addColorStop(Math.max(0, Math.min(1, stop)), colorValue);
        });

        return gradient;
    }

    /**
     * Render text item with text effects AND animations
     * Supports: shadow, outline, neon, glitch, etc.
     */
    private renderTextItem(item: TimelineItem, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, currentTime: number): void {
        const { x, y, width, height } = this.calculateBounds(item, canvas);
        ctx.save();

        const fontSize = item.fontSize || 40;
        const fontStyle = item.fontStyle || 'normal';
        const fontWeight = item.fontWeight || 'normal';
        ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${item.fontFamily || 'Inter'}`;
        ctx.fillStyle = item.color || '#000000';
        const text = item.name || item.src || '';

        // === APPLY ANIMATIONS ===
        const animStyle = this.calculateAnimationStyle(item, currentTime);

        // Calculate text position - MATCH Canvas.tsx getItemPositionAndTransform
        let textX: number;
        let textY: number;

        const textAlign = item.textAlign || 'center';
        const verticalAlign = item.verticalAlign || 'middle';

        if (textAlign === 'left') {
            textX = x;
            ctx.textAlign = 'left';
        } else if (textAlign === 'right') {
            textX = x + width;
            ctx.textAlign = 'right';
        } else {
            textX = x + width / 2;
            ctx.textAlign = 'center';
        }

        if (verticalAlign === 'top') {
            textY = y;
        } else if (verticalAlign === 'bottom') {
            textY = y + height - fontSize;
        } else {
            textY = y + height / 2 - fontSize / 2;
        }

        // Apply transformations from animation
        ctx.translate(textX, textY);

        // Apply item rotation (from editor)
        if (item.rotation) {
            ctx.rotate((item.rotation * Math.PI) / 180);
        }

        // Combine uniform scale with independent x/y scale
        const sX = (animStyle.scale ?? 1) * (animStyle.scaleX ?? 1);
        const sY = (animStyle.scale ?? 1) * (animStyle.scaleY ?? 1);
        if (sX !== 1 || sY !== 1) {
            ctx.scale(sX, sY);
        }

        if (animStyle.rotate) {
            ctx.rotate((animStyle.rotate * Math.PI) / 180);
        }
        // Convert percentage-based translate to pixels
        const animTx = (animStyle.translateX ?? 0) / 100 * canvas.width;
        const animTy = (animStyle.translateY ?? 0) / 100 * canvas.height;
        if (animTx !== 0 || animTy !== 0) {
            ctx.translate(animTx, animTy);
        }

        // Apply blur filter if needed
        if (animStyle.blur) {
            ctx.filter = `blur(${animStyle.blur}px)`;
        }

        // Apply opacity from both animation and item
        const baseOpacity = (item.opacity ?? 100) / 100;
        const animOpacity = animStyle.opacity ?? 1;
        ctx.globalAlpha = baseOpacity * animOpacity;

        // === APPLY TEXT EFFECTS ===
        if (item.textEffect && item.textEffect.type !== 'none') {
            const effect = item.textEffect;
            const effColor = effect.color || '#000000';
            const intensity = effect.intensity ?? 50;
            const offset = effect.offset ?? 50;
            const dist = (offset / 100) * 20;
            const blur = (intensity / 100) * 20;

            switch (effect.type) {
                case 'shadow':
                    ctx.shadowColor = effColor;
                    ctx.shadowBlur = blur;
                    ctx.shadowOffsetX = dist;
                    ctx.shadowOffsetY = dist;
                    break;
                case 'lift':
                    ctx.shadowColor = 'rgba(0,0,0,0.5)';
                    ctx.shadowBlur = blur + 10;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = dist * 0.5 + 4;
                    break;
                case 'outline':
                    ctx.strokeStyle = effColor;
                    ctx.lineWidth = (intensity / 100) * 3 + 1;
                    ctx.strokeText(text, 0, 0);
                    break;
                case 'hollow':
                    ctx.strokeStyle = item.color || '#000000';
                    ctx.lineWidth = (intensity / 100) * 3 + 1;
                    ctx.strokeText(text, 0, 0);
                    ctx.restore();
                    return; // Don't fill, just stroke for hollow effect
                case 'neon':
                    // Multiple glow layers
                    ctx.shadowColor = effColor;
                    ctx.shadowBlur = intensity * 0.4;
                    ctx.fillText(text, 0, 0);
                    ctx.shadowBlur = intensity * 0.2;
                    ctx.fillText(text, 0, 0);
                    ctx.shadowBlur = intensity * 0.1;
                    break;
                case 'glitch':
                    const gOff = (offset / 100) * 5 + 2;
                    // Cyan layer
                    ctx.fillStyle = '#00ffff';
                    ctx.fillText(text, -gOff, -gOff);
                    // Magenta layer
                    ctx.fillStyle = '#ff00ff';
                    ctx.fillText(text, gOff, gOff);
                    // Original
                    ctx.fillStyle = item.color || '#000000';
                    break;
                case 'echo':
                    const echoAlpha = ctx.globalAlpha;
                    ctx.globalAlpha = echoAlpha * 0.2;
                    ctx.fillText(text, dist * 3, dist * 3);
                    ctx.globalAlpha = echoAlpha * 0.4;
                    ctx.fillText(text, dist * 2, dist * 2);
                    ctx.globalAlpha = echoAlpha * 0.8;
                    ctx.fillText(text, dist, dist);
                    ctx.globalAlpha = echoAlpha;
                    break;
                case 'splice':
                    // Splice effect: stroke with offset colored shadow
                    ctx.strokeStyle = item.color || '#000000';
                    ctx.lineWidth = (intensity / 100) * 3 + 1;
                    ctx.strokeText(text, 0, 0);
                    // Draw shadow offset in effect color
                    ctx.fillStyle = effColor;
                    ctx.fillText(text, dist + 2, dist + 2);
                    // Restore original color for main text
                    ctx.fillStyle = item.color || '#000000';
                    ctx.fillText(text, 0, 0);
                    ctx.restore();
                    return; // Already drew text
                case 'background':
                    // Background effect: draw a colored rectangle behind text
                    const textMetrics = ctx.measureText(text);
                    const textWidth = textMetrics.width;
                    const textHeight = fontSize * 1.2;
                    const padX = 8;
                    const padY = 4;
                    // Draw background
                    ctx.fillStyle = effColor;
                    ctx.fillRect(
                        -textWidth / 2 - padX,
                        -textHeight / 2 - padY,
                        textWidth + padX * 2,
                        textHeight + padY * 2
                    );
                    // Restore text color
                    ctx.fillStyle = item.color || '#000000';
                    break;
            }
        }

        // Draw main text at origin since we've already applied translate
        ctx.fillText(text, 0, 0);
        ctx.restore();
    }

    /**
     * Calculate item bounds with fit property support
     * @param item Timeline item
     * @param canvas HTML canvas element
     * @param mediaEl Optional media element for aspect ratio calculation
     */
    private calculateBounds(
        item: TimelineItem,
        canvas: HTMLCanvasElement,
        mediaEl?: HTMLImageElement | HTMLVideoElement | null
    ) {
        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;

        let width: number;
        let height: number;

        if (item.isBackground) {
            // Get media aspect ratio for proper fit calculation
            let mediaAspect = 1;
            if (mediaEl) {
                if (mediaEl instanceof HTMLVideoElement) {
                    mediaAspect = mediaEl.videoWidth / mediaEl.videoHeight || 1;
                } else if (mediaEl instanceof HTMLImageElement) {
                    mediaAspect = mediaEl.naturalWidth / mediaEl.naturalHeight || 1;
                }
            }

            const canvasAspect = canvasWidth / canvasHeight;
            const fit = item.fit || 'contain';

            if (fit === 'fill') {
                // Stretch to fill (ignores aspect ratio)
                width = canvasWidth;
                height = canvasHeight;
            } else if (fit === 'cover') {
                // Cover - fill canvas while maintaining aspect ratio (may crop)
                if (mediaAspect > canvasAspect) {
                    height = canvasHeight;
                    width = height * mediaAspect;
                } else {
                    width = canvasWidth;
                    height = width / mediaAspect;
                }
            } else {
                // Contain - fit inside canvas while maintaining aspect ratio (may letterbox)
                if (mediaAspect > canvasAspect) {
                    width = canvasWidth;
                    height = width / mediaAspect;
                } else {
                    height = canvasHeight;
                    width = height * mediaAspect;
                }
            }
        } else {
            width = item.width ? (item.width / 100) * canvasWidth : canvasWidth * 0.5;
            height = item.height ? (item.height / 100) * canvasHeight : canvasHeight * 0.5;
        }

        // Center the item
        const x = (canvasWidth / 2) + ((item.x || 0) / 100) * canvasWidth - width / 2;
        const y = (canvasHeight / 2) + ((item.y || 0) / 100) * canvasHeight - height / 2;

        return { x, y, width, height };
    }

    /**
     * Convert canvas to Uint8Array PNG
     */
    private async canvasToUint8Array(canvas: HTMLCanvasElement): Promise<Uint8Array> {
        return new Promise((resolve) => {
            canvas.toBlob(async (blob) => {
                if (!blob) {
                    resolve(new Uint8Array());
                    return;
                }
                const buffer = await blob.arrayBuffer();
                resolve(new Uint8Array(buffer));
            }, 'image/jpeg', 0.8); // JPEG at 80% quality (faster than PNG!)
        });
    }

    /**
     * Get bitrate based on settings
     */
    private getBitrate(settings: ExportSettings): number {
        const resolution = settings.resolution.width * settings.resolution.height;
        const base = Math.floor(resolution / 1000);
        const qualityMultiplier = settings.quality === 'high' ? 1.5 : settings.quality === 'medium' ? 1 : 0.7;
        return Math.floor(base * qualityMultiplier);
    }

    /**
     * Clear media caches to free memory between batches
     */
    private cleanupMediaCaches(): void {
        console.log('%c   🧹 Clearing media caches...', 'color: #ffaa00');
        const count = this.mediaCache.size;

        for (const [key, media] of this.mediaCache.entries()) {
            if (media instanceof HTMLVideoElement) {
                media.pause();
                media.src = '';
                media.load();
            }
        }
        this.mediaCache.clear();

        console.log(`      ✓ Cleared ${count} media items`);
    }

    /**
     * Cleanup media cache
     */
    cleanup(): void {
        for (const [key, media] of this.mediaCache) {
            if (media instanceof HTMLVideoElement) {
                media.pause();
                media.src = '';
                media.load();
            }
        }
        this.mediaCache.clear();
    }
}

export const ffmpegExportService = new FFmpegExportService();
