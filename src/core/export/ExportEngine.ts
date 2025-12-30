// ============================================
// Export Engine - Frame-by-Frame Video Renderer
// Uses WebCodecs VideoEncoder for frame-accurate export
// Supports FFmpeg.wasm for professional-grade output
// Supports GPU acceleration when available
// ============================================

import type { Track, TimelineItem, CanvasDimension, Transition } from '@/types';
import type { ExportSettings, ExportProgress } from '../types/export';
import { BITRATE_CONFIGS } from '../types/export';
import { gpuCompositor } from '../compositor/GPUCompositor';
import { hardwareAccel } from '../engine/HardwareAccel';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmArrayBufferTarget } from 'webm-muxer';
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4ArrayBufferTarget } from 'mp4-muxer';
import { audioMixer } from './AudioMixer';
// NOTE: FFmpegExportService is imported dynamically to prevent Next.js bundling issues

export type ExportMode = 'auto' | 'ffmpeg' | 'webcodecs' | 'mediarecorder';
export type AccelerationMode = 'dedicated' | 'integrated' | 'cpu';

// Transition style properties for rendering
interface TransitionStyle {
    opacity?: number;
    scale?: number;
    scaleX?: number;
    scaleY?: number;
    rotate?: number;
    translateX?: number;
    translateY?: number;
    blur?: number;
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

// Internal type for rendering items with transition info
interface RenderItem {
    item: TimelineItem;
    track: Track;
    role: 'main' | 'outgoing';
    transition: Transition | null;
    transitionProgress: number;
}

export class ExportEngine {
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private isExporting: boolean = false;
    private cancelled: boolean = false;
    private accelerationMode: AccelerationMode = 'cpu';
    private gpuInitialized: boolean = false;
    // Scale factor for text/elements when exporting at different resolutions
    // Design resolution is 1080p (1920x1080), this stores export/design ratio
    private resolutionScale: number = 1;

    // Media caches to avoid reloading for each frame
    private videoCache: Map<string, HTMLVideoElement> = new Map();
    private imageCache: Map<string, HTMLImageElement> = new Map();

    constructor() { }

    /**
     * Determine acceleration mode based on GPU capabilities
     * Fallback chain: Dedicated GPU → Integrated GPU → CPU
     */
    private determineAccelerationMode(useGPU: boolean): AccelerationMode {
        if (!useGPU) return 'cpu';

        const caps = hardwareAccel.getCapabilities();
        if (!caps) return 'cpu';

        // Dedicated GPU (NVIDIA, AMD) - Best performance
        if (caps.vendor === 'nvidia' || caps.vendor === 'amd') {
            if (caps.supportsWebGL2) return 'dedicated';
        }

        // Integrated GPU (Intel, Apple) - Good performance
        if (caps.vendor === 'intel' || caps.vendor === 'apple') {
            if (caps.supportsWebGL2) return 'integrated';
        }

        return 'cpu';
    }

    /**
     * Log acceleration mode with detailed GPU info
     */
    private logAccelerationMode(mode: AccelerationMode): void {
        const caps = hardwareAccel.getCapabilities();

        console.log('\\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('%c🎬 EXPORT ACCELERATION MODE', 'font-weight: bold; font-size: 14px; color: #00ff00');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        if (mode === 'dedicated') {
            console.log('%c🎮 DEDICATED GPU RENDERING', 'color: #00ff00; font-weight: bold');
            console.log(`%c├─ GPU: ${caps?.name || 'Unknown'}`, 'color: #00aaff');
            console.log(`%c├─ VRAM: ${caps ? (caps.vram / (1024 * 1024 * 1024)).toFixed(1) : '?'} GB`, 'color: #ff00ff');
            console.log('%c├─ Compositing: WebGL2 (GPU)', 'color: #00ff00');
            console.log('%c├─ Encoding: Hardware (NVENC/AMF)', 'color: #00ff00');
            console.log('%c└─ Speed: ~10-50x faster', 'color: #ffaa00; font-weight: bold');
        } else if (mode === 'integrated') {
            console.log('%c💻 INTEGRATED GPU RENDERING', 'color: #ffaa00; font-weight: bold');
            console.log(`%c├─ GPU: ${caps?.name || 'Unknown'}`, 'color: #00aaff');
            console.log('%c├─ Compositing: WebGL2 (GPU)', 'color: #00ff00');
            console.log('%c├─ Encoding: Hardware (QSV)', 'color: #ffaa00');
            console.log('%c└─ Speed: ~2-5x faster', 'color: #ffaa00; font-weight: bold');
        } else {
            console.log('%c🖥️ CPU RENDERING', 'color: #ff6600; font-weight: bold');
            console.log('%c├─ Compositing: 2D Canvas (CPU)', 'color: #ff6600');
            console.log('%c├─ Encoding: Software (libx264)', 'color: #ff6600');
            console.log('%c└─ Speed: Baseline', 'color: #ff6600');
        }

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n');
    }

    /**
     * Check if WebCodecs VideoEncoder is available
     */
    private supportsVideoEncoder(): boolean {
        return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
    }

    /**
     * Export the timeline to a video file
     * Uses WebCodecs VideoEncoder for frame-accurate timing
     * @param tracks Timeline tracks (video, audio, overlay)
     * @param duration Total video duration in seconds
     * @param dimension Canvas dimensions
     * @param settings Export settings
     * @param onProgress Progress callback
     * @param exportMode Export mode: 'auto' | 'ffmpeg' | 'webcodecs' | 'mediarecorder'
     * @returns Blob of the exported video
     */
    async export(
        tracks: Track[],
        duration: number,
        dimension: CanvasDimension,
        settings: ExportSettings,
        onProgress: (progress: ExportProgress) => void,
        exportMode: ExportMode = 'auto'
    ): Promise<Blob> {
        this.isExporting = true;
        this.cancelled = false;

        // Determine which export method to use
        // Dynamic import to prevent Next.js bundling issues with FFmpeg Web Workers
        const useFFmpeg = exportMode === 'ffmpeg' || (exportMode === 'auto' && typeof SharedArrayBuffer !== 'undefined');

        if (useFFmpeg) {
            // Try FFmpeg for best quality
            try {
                console.log('%c🎬 Using FFmpeg.wasm for export (best quality)', 'color: #ff6600; font-weight: bold');
                onProgress({ phase: 'preparing', progress: 0 });

                // Dynamic import of FFmpegExportService
                const { ffmpegExportService } = await import('./FFmpegExportService');

                // Load FFmpeg if not already loaded
                const loaded = await ffmpegExportService.load((progress) => {
                    onProgress({ phase: 'preparing', progress: progress * 0.5 }); // 0-50% for loading
                });

                if (!loaded) {
                    console.warn('[ExportEngine] FFmpeg failed to load, falling back to VideoEncoder');
                    if (exportMode === 'ffmpeg') {
                        throw new Error('FFmpeg failed to load');
                    }
                    // Fall through to VideoEncoder
                } else {
                    return await ffmpegExportService.export({
                        tracks,
                        duration,
                        dimension,
                        settings,
                        onProgress,
                    });
                }
            } catch (error) {
                if (exportMode === 'ffmpeg') {
                    throw error;
                }
                console.warn('[ExportEngine] FFmpeg export failed, falling back', error);
            }
        }

        // Fallback to VideoEncoder or MediaRecorder
        if (exportMode === 'webcodecs' || (exportMode === 'auto' && this.supportsVideoEncoder())) {
            return this.exportWithVideoEncoder(tracks, duration, dimension, settings, onProgress);
        } else {
            console.warn('[ExportEngine] Using MediaRecorder fallback');
            return this.exportWithMediaRecorder(tracks, duration, dimension, settings, onProgress);
        }
    }

    /**
     * Export using WebCodecs VideoEncoder for frame-accurate timing
     */
    private async exportWithVideoEncoder(
        tracks: Track[],
        duration: number,
        dimension: CanvasDimension,
        settings: ExportSettings,
        onProgress: (progress: ExportProgress) => void
    ): Promise<Blob> {
        try {
            onProgress({ phase: 'preparing', progress: 0 });

            // Initialize hardware acceleration
            await hardwareAccel.initialize();
            const capabilities = hardwareAccel.getCapabilities();
            const useGPU = settings.useGPU && (capabilities?.supportsWebGL2 ?? false);

            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('%c🎬 STARTING VIDEO EXPORT (VideoEncoder)', 'font-weight: bold; font-size: 16px; color: #00ff00');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`%c📐 Resolution: ${settings.resolution.width}×${settings.resolution.height}`, 'font-weight: bold');
            console.log(`%c🎞️  FPS: ${settings.fps}`, 'color: #00aaff');
            console.log(`%c⏱️  Duration: ${duration.toFixed(2)}s`, 'color: #00aaff');
            console.log(`%c🎨 Quality: ${settings.quality.toUpperCase()}`, 'color: #ffaa00');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n');

            // Create offscreen canvas for rendering
            this.canvas = document.createElement('canvas');
            this.canvas.width = settings.resolution.width;
            this.canvas.height = settings.resolution.height;
            this.ctx = this.canvas.getContext('2d', {
                alpha: false,
                willReadFrequently: false,
            });

            if (!this.ctx) {
                throw new Error('Failed to create canvas context');
            }

            // Calculate resolution scale (design resolution is 1080p)
            // This ensures text and elements scale properly at different export resolutions
            const designWidth = 1920; // Design resolution width
            this.resolutionScale = settings.resolution.width / designWidth;
            console.log(`%c📐 Resolution scale: ${this.resolutionScale.toFixed(3)} (${settings.resolution.width}/${designWidth})`, 'color: #00aaff');

            // Initialize GPU compositor if enabled (with fallback)
            let actuallyUsingGPU = false;
            if (useGPU) {
                try {
                    const gpuInitSuccess = await gpuCompositor.initialize(this.canvas);
                    if (gpuInitSuccess) {
                        gpuCompositor.setResolution(settings.resolution.width, settings.resolution.height);
                        actuallyUsingGPU = true;
                        console.log('%c✨ GPU Compositor initialized for export', 'color: #00ff00');
                    }
                } catch (error) {
                    console.warn('%c⚠️ GPU initialization failed', 'color: #ff6600', error);
                }
            }

            // Determine and log acceleration mode
            this.accelerationMode = this.determineAccelerationMode(actuallyUsingGPU);
            this.logAccelerationMode(this.accelerationMode);

            // Pre-load all video elements
            console.log('%c📦 Pre-loading all video assets...', 'color: #00aaff');
            await this.preloadAllVideos(tracks);
            console.log('%c✅ All videos pre-loaded!', 'color: #00ff00');

            // === AUDIO PROCESSING ===
            console.log('%c🎵 Processing audio tracks...', 'color: #00aaff');
            const audioClips = audioMixer.getAudioClips(tracks);
            let mixedAudio: { audioBuffer: AudioBuffer; sampleRate: number; numberOfChannels: number } | null = null;

            if (audioClips.length > 0) {
                console.log(`%c   Found ${audioClips.length} audio source(s)`, 'color: #00aaff');
                mixedAudio = await audioMixer.mixAudio(audioClips, duration, 48000);
                if (mixedAudio) {
                    console.log('%c✅ Audio mixed successfully!', 'color: #00ff00');
                }
            } else {
                console.log('%c   No audio tracks found (video will be silent)', 'color: #ffaa00');
            }

            // Calculate frame parameters
            const totalFrames = Math.ceil(duration * settings.fps);
            const frameDurationMicros = Math.floor(1_000_000 / settings.fps);
            const bitrate = this.getBitrate(settings) * 1000; // Convert to bps

            console.log(`%c🎬 Rendering ${totalFrames} frames using H.264/MP4...`, 'font-weight: bold; color: #00ff00');

            // Set up mp4-muxer for H.264 with optional audio
            const muxerTarget = new Mp4ArrayBufferTarget();
            const muxerConfig: any = {
                target: muxerTarget,
                video: {
                    codec: 'avc', // H.264/AVC
                    width: settings.resolution.width,
                    height: settings.resolution.height,
                },
                fastStart: 'in-memory', // Enable fast start for streaming
            };

            // Add audio configuration if we have mixed audio
            if (mixedAudio) {
                muxerConfig.audio = {
                    codec: 'aac',
                    sampleRate: mixedAudio.sampleRate,
                    numberOfChannels: mixedAudio.numberOfChannels,
                };
            }

            const muxer = new Mp4Muxer(muxerConfig);

            // Set up VideoEncoder with H.264 for smooth VLC playback
            const encoder = new VideoEncoder({
                output: (chunk, meta) => {
                    muxer.addVideoChunk(chunk, meta);
                },
                error: (e) => {
                    console.error('[VideoEncoder] Error:', e);
                },
            });

            // Select appropriate H.264 level based on resolution:
            // - Level 3.1 (0x1f): max 1280x720 (720p)
            // - Level 4.0 (0x28): max 1920x1080 (1080p) 
            // - Level 5.1 (0x33): max 4096x2160 (4K)
            const resolutionArea = settings.resolution.width * settings.resolution.height;
            let avcLevel: string;
            let levelName: string;

            if (resolutionArea <= 921600) { // 1280x720
                avcLevel = 'avc1.42001f'; // Level 3.1
                levelName = '3.1';
            } else if (resolutionArea <= 2073600) { // 1920x1080
                avcLevel = 'avc1.420028'; // Level 4.0
                levelName = '4.0';
            } else {
                avcLevel = 'avc1.420033'; // Level 5.1 for 4K+
                levelName = '5.1';
            }

            encoder.configure({
                codec: avcLevel,
                width: settings.resolution.width,
                height: settings.resolution.height,
                bitrate: bitrate * 5, // High bitrate for quality
                framerate: settings.fps,
                avc: { format: 'avc' }, // Use AVC format for MP4 compatibility
                hardwareAcceleration: this.accelerationMode !== 'cpu' ? 'prefer-hardware' : 'prefer-software',
            });

            console.log(`%c⚙️ VideoEncoder configured: H.264 (${avcLevel}, Level ${levelName}), ${(bitrate * 5 / 1000).toFixed(0)}kbps, ${settings.fps}fps`, 'color: #00ff00');

            onProgress({ phase: 'rendering', progress: 0 });

            // Calculate resolution-aware settings for memory management
            const isHighRes = settings.resolution.width >= 3840 || settings.resolution.height >= 2160;
            const cacheCleanupInterval = isHighRes ? 10 : 60; // More aggressive for 4K
            const progressLogInterval = isHighRes ? 15 : 30;
            let lastLogTime = Date.now();

            console.log(`%c📊 Memory Management: ${isHighRes ? '4K/HIGH-RES MODE' : 'Standard mode'}`, 'color: #ffaa00');
            console.log(`   Cache cleanup: every ${cacheCleanupInterval} frames`);

            // Render and encode each frame
            for (let frameIndex = 0; frameIndex < totalFrames && !this.cancelled; frameIndex++) {
                const currentTime = frameIndex / settings.fps;
                const timestamp = frameIndex * frameDurationMicros;

                // Render frame to canvas
                await this.renderFrame(tracks, currentTime, dimension, settings, actuallyUsingGPU, frameIndex);

                // Create VideoFrame from canvas with exact timestamp
                const frame = new VideoFrame(this.canvas, {
                    timestamp: timestamp,
                    duration: frameDurationMicros,
                });

                // Keyframe every 15 frames (~0.5 second at 30fps) for good seeking without file bloat
                const isKeyframe = frameIndex % 15 === 0;
                encoder.encode(frame, { keyFrame: isKeyframe });
                frame.close();

                // Periodic memory management - more aggressive for 4K
                if ((frameIndex + 1) % cacheCleanupInterval === 0) {
                    this.clearCaches();

                    const memInfo = this.getMemoryInfo();
                    if (memInfo.percentage && isHighRes) {
                        console.log(`   📊 Memory: ${memInfo.used.toFixed(0)}MB / ${memInfo.limit?.toFixed(0) || '?'}MB (${memInfo.percentage.toFixed(1)}%)`);
                    }
                }

                // Update progress
                const progress = ((frameIndex + 1) / totalFrames) * 100;
                onProgress({
                    phase: 'rendering',
                    progress,
                    currentFrame: frameIndex + 1,
                    totalFrames,
                    estimatedTimeRemaining: Math.ceil((totalFrames - frameIndex - 1) / Math.max(1, settings.fps)),
                });

                // Log progress with timing
                if ((frameIndex + 1) % progressLogInterval === 0) {
                    const now = Date.now();
                    const elapsed = (now - lastLogTime) / 1000;
                    const framesPerSec = progressLogInterval / elapsed;
                    const remaining = ((totalFrames - frameIndex - 1) / framesPerSec).toFixed(0);
                    console.log(`%c⏳ ${progress.toFixed(1)}% | Frame ${frameIndex + 1}/${totalFrames} | ${framesPerSec.toFixed(1)} fps | ETA: ${remaining}s`, 'color: #ffaa00');
                    lastLogTime = now;
                }
            }

            if (this.cancelled) {
                encoder.close();
                throw new Error('Export cancelled by user');
            }

            // Flush encoder and finalize
            onProgress({ phase: 'encoding', progress: 90 });
            await encoder.flush();
            encoder.close();

            // === AUDIO ENCODING ===
            if (mixedAudio) {
                console.log('%c🎵 Encoding audio...', 'color: #00aaff');
                onProgress({ phase: 'encoding', progress: 92 });

                try {
                    // Create AudioEncoder
                    const audioEncoder = new AudioEncoder({
                        output: (chunk, meta) => {
                            muxer.addAudioChunk(chunk, meta);
                        },
                        error: (e) => {
                            console.error('[AudioEncoder] Error:', e);
                        },
                    });

                    // Configure encoder for AAC
                    audioEncoder.configure({
                        codec: 'mp4a.40.2', // AAC-LC
                        sampleRate: mixedAudio.sampleRate,
                        numberOfChannels: mixedAudio.numberOfChannels,
                        bitrate: 192000, // 192kbps
                    });

                    // Convert AudioBuffer to AudioData and encode
                    const numberOfChannels = mixedAudio.numberOfChannels;
                    const sampleRate = mixedAudio.sampleRate;
                    const totalSamples = mixedAudio.audioBuffer.length;

                    // Encode in chunks of ~1024 samples (typical AAC frame size is 1024)
                    const chunkSize = 1024;
                    const totalChunks = Math.ceil(totalSamples / chunkSize);

                    for (let i = 0; i < totalChunks; i++) {
                        const startSample = i * chunkSize;
                        const endSample = Math.min(startSample + chunkSize, totalSamples);
                        const samplesInChunk = endSample - startSample;

                        // Create PLANAR Float32Array for this chunk
                        // For f32-planar: [ch0_sample0, ch0_sample1, ...ch0_sampleN, ch1_sample0, ch1_sample1, ...ch1_sampleN]
                        const chunkData = new Float32Array(samplesInChunk * numberOfChannels);
                        for (let c = 0; c < numberOfChannels; c++) {
                            const channelData = mixedAudio.audioBuffer.getChannelData(c);
                            const channelOffset = c * samplesInChunk;
                            for (let s = 0; s < samplesInChunk; s++) {
                                chunkData[channelOffset + s] = channelData[startSample + s];
                            }
                        }

                        // Create AudioData with planar format
                        const audioData = new AudioData({
                            format: 'f32-planar',
                            sampleRate: sampleRate,
                            numberOfFrames: samplesInChunk,
                            numberOfChannels: numberOfChannels,
                            timestamp: Math.floor((startSample / sampleRate) * 1_000_000), // microseconds
                            data: chunkData,
                        });

                        audioEncoder.encode(audioData);
                        audioData.close();
                    }

                    // Flush and close audio encoder
                    await audioEncoder.flush();
                    audioEncoder.close();

                    console.log('%c✅ Audio encoded!', 'color: #00ff00');
                    onProgress({ phase: 'encoding', progress: 95 });
                } catch (audioError) {
                    console.warn('[ExportEngine] Audio encoding failed, video will be silent:', audioError);
                }
            }

            // Finalize muxer
            muxer.finalize();
            const buffer = muxerTarget.buffer;
            const blob = new Blob([buffer], { type: 'video/mp4' });

            onProgress({ phase: 'complete', progress: 100 });

            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`%c🎉 EXPORT COMPLETE!`, 'font-weight: bold; font-size: 16px; color: #00ff00');
            console.log(`%c📦 File size: ${(blob.size / (1024 * 1024)).toFixed(2)} MB`, 'color: #00aaff');
            console.log(`%c⏱️  Duration: ${duration.toFixed(2)}s (exact)`, 'color: #00aaff');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n');

            return blob;

        } catch (error) {
            console.error('[ExportEngine] Export failed:', error);
            onProgress({
                phase: 'error',
                progress: 0,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        } finally {
            this.cleanup();
            this.isExporting = false;
        }
    }

    /**
     * Fallback export using MediaRecorder for browsers without VideoEncoder
     */
    private async exportWithMediaRecorder(
        tracks: Track[],
        duration: number,
        dimension: CanvasDimension,
        settings: ExportSettings,
        onProgress: (progress: ExportProgress) => void
    ): Promise<Blob> {
        const recordedChunks: Blob[] = [];
        let mediaRecorder: MediaRecorder | null = null;

        try {
            onProgress({ phase: 'preparing', progress: 0 });

            // Initialize hardware acceleration
            await hardwareAccel.initialize();

            // Create offscreen canvas for rendering
            this.canvas = document.createElement('canvas');
            this.canvas.width = settings.resolution.width;
            this.canvas.height = settings.resolution.height;
            this.ctx = this.canvas.getContext('2d', { alpha: false });

            if (!this.ctx) {
                throw new Error('Failed to create canvas context');
            }

            // Pre-load all video elements
            await this.preloadAllVideos(tracks);

            // Set up MediaRecorder
            const stream = this.canvas.captureStream(settings.fps);
            const mimeType = this.getMimeType(settings);
            const bitrate = this.getBitrate(settings);

            mediaRecorder = new MediaRecorder(stream, {
                mimeType,
                videoBitsPerSecond: bitrate * 1000,
            });

            mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    recordedChunks.push(event.data);
                }
            };

            mediaRecorder.start(100);
            onProgress({ phase: 'rendering', progress: 0 });

            const totalFrames = Math.ceil(duration * settings.fps);
            const frameTime = 1000 / settings.fps;

            for (let frameIndex = 0; frameIndex < totalFrames && !this.cancelled; frameIndex++) {
                const currentTime = frameIndex / settings.fps;
                await this.renderFrame(tracks, currentTime, dimension, settings, false, frameIndex);

                // Periodic memory management (every 60 frames)
                if ((frameIndex + 1) % 60 === 0) {
                    this.clearCaches();
                }

                const progress = ((frameIndex + 1) / totalFrames) * 100;
                onProgress({
                    phase: 'rendering',
                    progress,
                    currentFrame: frameIndex + 1,
                    totalFrames,
                });

                // Wait for frame duration to match real-time (required for MediaRecorder)
                await new Promise(resolve => setTimeout(resolve, frameTime));
            }

            if (this.cancelled) {
                throw new Error('Export cancelled by user');
            }

            onProgress({ phase: 'encoding', progress: 90 });

            // Stop recording and get blob
            const blob = await new Promise<Blob>((resolve, reject) => {
                if (!mediaRecorder) {
                    reject(new Error('MediaRecorder not initialized'));
                    return;
                }
                mediaRecorder.onstop = () => {
                    resolve(new Blob(recordedChunks, { type: mediaRecorder!.mimeType }));
                };
                mediaRecorder.stop();
            });

            onProgress({ phase: 'complete', progress: 100 });
            return blob;

        } catch (error) {
            console.error('[ExportEngine] MediaRecorder export failed:', error);
            onProgress({
                phase: 'error',
                progress: 0,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        } finally {
            this.cleanup();
            this.isExporting = false;
        }
    }

    /**
     * Render a single frame at the specified time
     * Now handles transitions between clips
     */
    private async renderFrame(
        tracks: Track[],
        currentTime: number,
        dimension: CanvasDimension,
        settings: ExportSettings,
        useGPU: boolean,
        currentFrame: number
    ): Promise<void> {
        if (!this.canvas || !this.ctx) return;

        const ctx = this.ctx;
        const canvas = this.canvas;

        // Clear canvas
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (useGPU) {
            gpuCompositor.clear();
        }

        // Get all items to render (with transition info)
        const renderItems = this.getRenderItems(tracks, currentTime);

        // Debug: Log active items
        if (renderItems.length > 0 && currentFrame === 0) {
            console.log(`%c📋 Found ${renderItems.length} items to render:`, 'color: #00aaff');
            renderItems.forEach(({ item, role, transition }) => {
                const transitionInfo = transition ? ` [${role} in ${transition.type}]` : '';
                console.log(`   - ${item.type}: ${item.name || item.src} (${item.start}s - ${item.start + item.duration}s)${transitionInfo}`);
            });
        }

        // === CLIP ALL CONTENT TO CANVAS BOUNDS ===
        // This matches the preview behavior where CSS overflow:hidden clips content to container
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, canvas.width, canvas.height);
        ctx.clip();

        // Render each item (bottom to top)
        for (const renderItem of renderItems) {
            const { item, track, role, transition, transitionProgress } = renderItem;
            if (track.isHidden) continue;

            // Skip audio items (handled by audio tracks)
            if (item.type === 'audio') continue;

            // Calculate transition style if applicable
            let transitionStyle: TransitionStyle = {};
            if (transition && transition.type !== 'none') {
                transitionStyle = this.calculateTransitionStyle(transition.type, transition.direction || 'left', transitionProgress, role);
                // Debug: Log transition detection
                if (transitionProgress > 0.01 && transitionProgress < 0.99) {
                    console.log(`%c🎬 TRANSITION [${transition.type}] role=${role} progress=${transitionProgress.toFixed(2)} opacity=${transitionStyle.opacity?.toFixed(2) ?? 'N/A'}`,
                        'color: #ff6600; font-weight: bold');
                }
            }

            // Render based on type
            if (item.type === 'video' || item.type === 'image') {
                await this.renderMediaItemWithStyle(item, ctx, canvas, useGPU, currentTime, transitionStyle);
            } else if (item.type === 'color') {
                this.renderColorItem(item, ctx, canvas);
            } else if (item.type === 'text') {
                this.renderTextItem(item, ctx, canvas, currentTime);
            }
        }

        // Restore context to remove clip
        ctx.restore();
    }

    /**
     * Get all items to render with transition information
     * MATCHES Canvas.tsx renderItems logic exactly
     */
    private getRenderItems(tracks: Track[], currentTime: number): RenderItem[] {
        const renderItems: RenderItem[] = [];

        // Sort tracks by layer (background first)
        const sortedTracks = [...tracks].sort((a, b) => {
            if (a.id === 'main-video') return -1;
            if (b.id === 'main-video') return 1;
            return 0;
        });

        for (const track of sortedTracks) {
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
                if (itemsWithTransitions.length > 0) {
                    console.log(`%c📍 Track "${track.id}" has ${itemsWithTransitions.length} items with transitions:`, 'color: #ff00ff; font-weight: bold');
                    itemsWithTransitions.forEach(i => {
                        console.log(`   - "${i.name || i.src}" at ${i.start}s: ${i.transition?.type} (timing: ${i.transition?.timing || 'postfix'})`);
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

        // Sort by z-index: outgoing first, then main
        renderItems.sort((a, b) => {
            if (a.role === 'outgoing' && b.role === 'main') return -1;
            if (a.role === 'main' && b.role === 'outgoing') return 1;
            return 0;
        });

        return renderItems;
    }

    /**
     * Get all items that should be visible at the specified time
     */
    private getActiveItems(tracks: Track[], currentTime: number): Array<{ item: TimelineItem; track: Track }> {
        const activeItems: Array<{ item: TimelineItem; track: Track }> = [];

        // Sort tracks by layer (background first)
        const sortedTracks = [...tracks].sort((a, b) => {
            if (a.id === 'main-video') return -1;
            if (b.id === 'main-video') return 1;
            return 0;
        });

        for (const track of sortedTracks) {
            for (const item of track.items) {
                const itemStart = item.start;
                const itemEnd = item.start + item.duration;

                if (currentTime >= itemStart && currentTime < itemEnd) {
                    activeItems.push({ item, track });
                }
            }
        }

        // Debug: Log text items
        const textItems = activeItems.filter(({ item }) => item.type === 'text');
        if (textItems.length > 0) {
            console.log(`[ExportEngine] getActiveItems: Found ${textItems.length} text item(s) at t=${currentTime.toFixed(2)}s`);
        }

        return activeItems;
    }

    /**
     * Render a video or image item
     */
    private async renderMediaItem(
        item: TimelineItem,
        ctx: CanvasRenderingContext2D,
        canvas: HTMLCanvasElement,
        useGPU: boolean,
        currentTime: number
    ): Promise<void> {
        // Load media element at the correct time position
        const mediaEl = await this.loadMediaElement(item, currentTime);
        if (!mediaEl) {
            console.warn(`[ExportEngine] Failed to load media: ${item.name || item.src}`);
            return;
        }


        // Calculate position and size (pass media element for aspect ratio calculation)
        const { x, y, width, height } = this.calculateItemBounds(item, canvas, mediaEl);

        // Save context state
        ctx.save();

        // Apply transformations
        ctx.translate(x + width / 2, y + height / 2);
        if (item.rotation) ctx.rotate((item.rotation * Math.PI) / 180);
        if (item.flipH || item.flipV) ctx.scale(item.flipH ? -1 : 1, item.flipV ? -1 : 1);
        ctx.globalAlpha = (item.opacity ?? 100) / 100;

        // Apply CSS filters (brightness, contrast, saturation, blur)
        const filters: string[] = [];

        if (item.adjustments) {
            // Brightness (-100 to +100) -> (0 to 2)
            if (item.adjustments.brightness !== undefined && item.adjustments.brightness !== 0) {
                const value = 1 + (item.adjustments.brightness / 100);
                filters.push(`brightness(${value})`);
            }

            // Contrast (-100 to +100) -> (0 to 2)
            if (item.adjustments.contrast !== undefined && item.adjustments.contrast !== 0) {
                const value = 1 + (item.adjustments.contrast / 100);
                filters.push(`contrast(${value})`);
            }

            // Saturation (-100 to +100) -> (0 to 2)
            if (item.adjustments.saturation !== undefined && item.adjustments.saturation !== 0) {
                const value = 1 + (item.adjustments.saturation / 100);
                filters.push(`saturate(${value})`);
            }

            // Blur
            if (item.adjustments.sharpness !== undefined && item.adjustments.sharpness < 0) {
                const blurAmount = Math.abs(item.adjustments.sharpness) / 20;
                filters.push(`blur(${blurAmount}px)`);
            }
        }

        // Apply preset filter if set
        if (item.filter && item.filter !== 'none') {
            const filterStyle = this.getFilterStyle(item.filter);
            if (filterStyle) filters.push(filterStyle);
        }

        if (filters.length > 0) {
            ctx.filter = filters.join(' ');
        }

        // Draw media
        try {
            ctx.drawImage(mediaEl, -width / 2, -height / 2, width, height);
        } catch (error) {
            console.warn(`[ExportEngine] Failed to draw media: ${item.name || item.src}`, error);
        }

        ctx.restore();
    }

    /**
     * Render a media item with transition style applied
     * Combines item properties (filters, transforms) with transition effects
     */
    private async renderMediaItemWithStyle(
        item: TimelineItem,
        ctx: CanvasRenderingContext2D,
        canvas: HTMLCanvasElement,
        useGPU: boolean,
        currentTime: number,
        transitionStyle: TransitionStyle
    ): Promise<void> {
        // Load media element at the correct time position
        const mediaEl = await this.loadMediaElement(item, currentTime);
        if (!mediaEl) {
            console.warn(`[ExportEngine] Failed to load media: ${item.name || item.src}`);
            return;
        }

        // Calculate position and size
        const { x, y, width, height } = this.calculateItemBounds(item, canvas, mediaEl);

        // Apply animation style for images/videos (Phase 2)
        const animStyle = this.calculateAnimationStyle(item, currentTime);

        ctx.save();

        // Apply transition opacity
        const baseOpacity = (item.opacity ?? 100) / 100;
        const transitionOpacity = transitionStyle.opacity ?? 1;
        const animOpacity = animStyle.opacity ?? 1;
        ctx.globalAlpha = baseOpacity * transitionOpacity * animOpacity;

        // Calculate combined transforms
        let scaleX = 1, scaleY = 1;
        let translateX = 0, translateY = 0;
        let rotation = item.rotation || 0;

        // Apply item flips
        if (item.flipH) scaleX *= - 1;
        if (item.flipV) scaleY *= -1;

        // Apply transition transforms
        if (transitionStyle.scale !== undefined) {
            scaleX *= transitionStyle.scale;
            scaleY *= transitionStyle.scale;
        }
        if (transitionStyle.scaleX !== undefined) scaleX *= transitionStyle.scaleX;
        if (transitionStyle.scaleY !== undefined) scaleY *= transitionStyle.scaleY;
        if (transitionStyle.translateX !== undefined) {
            translateX += (transitionStyle.translateX / 100) * canvas.width;
        }
        if (transitionStyle.translateY !== undefined) {
            translateY += (transitionStyle.translateY / 100) * canvas.height;
        }
        if (transitionStyle.rotate !== undefined) {
            rotation += transitionStyle.rotate;
        }

        // Apply animation transforms
        if (animStyle.scale !== undefined) {
            scaleX *= animStyle.scale;
            scaleY *= animStyle.scale;
        }
        if (animStyle.scaleX !== undefined) scaleX *= animStyle.scaleX;
        if (animStyle.scaleY !== undefined) scaleY *= animStyle.scaleY;
        if (animStyle.translateX !== undefined) translateX += animStyle.translateX;
        if (animStyle.translateY !== undefined) translateY += animStyle.translateY;
        if (animStyle.rotate !== undefined) rotation += animStyle.rotate;

        // Apply combined transforms
        ctx.translate(x + width / 2 + translateX, y + height / 2 + translateY);
        if (rotation) ctx.rotate((rotation * Math.PI) / 180);
        if (scaleX !== 1 || scaleY !== 1) ctx.scale(scaleX, scaleY);

        // Build filter string
        const filters: string[] = [];

        // Item adjustments
        if (item.adjustments) {
            if (item.adjustments.brightness !== undefined && item.adjustments.brightness !== 0) {
                filters.push(`brightness(${1 + item.adjustments.brightness / 100})`);
            }
            if (item.adjustments.contrast !== undefined && item.adjustments.contrast !== 0) {
                filters.push(`contrast(${1 + item.adjustments.contrast / 100})`);
            }
            if (item.adjustments.saturation !== undefined && item.adjustments.saturation !== 0) {
                filters.push(`saturate(${1 + item.adjustments.saturation / 100})`);
            }
            if (item.adjustments.sharpness !== undefined && item.adjustments.sharpness < 0) {
                filters.push(`blur(${Math.abs(item.adjustments.sharpness) / 20}px)`);
            }
        }

        // Preset filter
        if (item.filter && item.filter !== 'none') {
            const filterStyle = this.getFilterStyle(item.filter);
            if (filterStyle) filters.push(filterStyle);
        }

        // Transition blur
        if (transitionStyle.blur) {
            filters.push(`blur(${transitionStyle.blur}px)`);
        }

        if (animStyle.blur) {
            filters.push(`blur(${animStyle.blur}px)`);
        }
        if (animStyle.brightness !== undefined) {
            filters.push(`brightness(${animStyle.brightness})`);
        }
        if (animStyle.contrast !== undefined) {
            filters.push(`contrast(${animStyle.contrast})`);
        }
        if (animStyle.saturate !== undefined) {
            filters.push(`saturate(${animStyle.saturate})`);
        }
        if (animStyle.hueRotate !== undefined) {
            filters.push(`hue-rotate(${animStyle.hueRotate}deg)`);
        }

        // Transition brightness
        if (transitionStyle.brightness !== undefined) {
            filters.push(`brightness(${transitionStyle.brightness})`);
        }

        // Transition contrast
        if (transitionStyle.contrast !== undefined && transitionStyle.contrast !== 1) {
            filters.push(`contrast(${transitionStyle.contrast})`);
        }

        // Transition saturate
        if (transitionStyle.saturate !== undefined && transitionStyle.saturate !== 1) {
            filters.push(`saturate(${transitionStyle.saturate})`);
        }

        // Transition sepia
        if (transitionStyle.sepia !== undefined && transitionStyle.sepia !== 0) {
            filters.push(`sepia(${transitionStyle.sepia})`);
        }

        // Transition hue-rotate
        if (transitionStyle.hueRotate !== undefined && transitionStyle.hueRotate !== 0) {
            filters.push(`hue-rotate(${transitionStyle.hueRotate}deg)`);
        }

        if (filters.length > 0) {
            ctx.filter = filters.join(' ');
        }

        // Apply blend mode if specified
        if (transitionStyle.blendMode) {
            ctx.globalCompositeOperation = transitionStyle.blendMode;
        }

        // Apply clip path for shape/wipe transitions
        if (transitionStyle.clipType && transitionStyle.clipType !== 'none') {
            ctx.beginPath();

            if (transitionStyle.clipType === 'inset' && transitionStyle.clipInset) {
                // Inset clip: top, right, bottom, left as percentages
                const clipTop = (transitionStyle.clipInset.top / 100) * height;
                const clipRight = (transitionStyle.clipInset.right / 100) * width;
                const clipBottom = (transitionStyle.clipInset.bottom / 100) * height;
                const clipLeft = (transitionStyle.clipInset.left / 100) * width;
                ctx.rect(
                    -width / 2 + clipLeft,
                    -height / 2 + clipTop,
                    width - clipLeft - clipRight,
                    height - clipTop - clipBottom
                );
            } else if (transitionStyle.clipType === 'circle' && transitionStyle.clipCircle) {
                // Circle clip: radius as %, cx/cy as %
                const radius = (transitionStyle.clipCircle.radius / 100) * Math.max(width, height);
                const cx = (transitionStyle.clipCircle.cx - 50) / 100 * width;
                const cy = (transitionStyle.clipCircle.cy - 50) / 100 * height;
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            } else if (transitionStyle.clipType === 'polygon' && transitionStyle.clipPolygon) {
                // Polygon clip: array of points as percentages
                const points = transitionStyle.clipPolygon;
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

        // Draw media with crop support
        try {
            const crop = item.crop || { x: 50, y: 50, zoom: 1 };

            // Apply crop zoom by scaling the source region
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
            // When zoom > 1, we only show a portion of the image
            const visibleWidth = sourceWidth / cropZoom;
            const visibleHeight = sourceHeight / cropZoom;

            // Calculate source offset based on crop pan position (0-100%)
            // At x=50, y=50, we center the visible region
            const maxOffsetX = sourceWidth - visibleWidth;
            const maxOffsetY = sourceHeight - visibleHeight;
            const srcX = (crop.x / 100) * maxOffsetX;
            const srcY = (crop.y / 100) * maxOffsetY;

            // Draw with 9-argument form: (img, sx, sy, sw, sh, dx, dy, dw, dh)
            ctx.drawImage(
                mediaEl,
                srcX, srcY, visibleWidth, visibleHeight,  // Source region (cropped)
                -width / 2, -height / 2, width, height    // Destination
            );

            // Apply background color overlay (tint)
            if (item.backgroundColor) {
                ctx.save();
                ctx.globalCompositeOperation = 'multiply';
                ctx.globalAlpha = 0.5;
                ctx.fillStyle = item.backgroundColor;
                ctx.fillRect(-width / 2, -height / 2, width, height);
                ctx.restore();
            }

            // Draw border if defined (after image)
            if (item.border && item.border.width > 0 && !item.isBackground) {
                ctx.strokeStyle = item.border.color || '#000000';
                ctx.lineWidth = item.border.width;
                // Draw border around the item
                ctx.strokeRect(-width / 2, -height / 2, width, height);
            }
        } catch (error) {
            console.warn(`[ExportEngine] Failed to draw media: ${item.name || item.src}`, error);
        }

        ctx.restore();
    }

    /**
     * Calculate transition style based on type, direction, and progress
     * Matches Canvas.tsx getTransitionStyle exactly
     */
    private calculateTransitionStyle(
        type: string,
        direction: string,
        progress: number,
        role: 'main' | 'outgoing'
    ): TransitionStyle {
        const p = progress;
        const outP = 1 - p;

        // Direction multipliers
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
                    ? { opacity: dissolveEase, brightness: 0.98 + dissolveEase * 0.02 }
                    : { opacity: 1 - dissolveEase, brightness: 1 - (1 - dissolveEase) * 0.02 };
            }
            case 'film-dissolve': {
                const filmP = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
                return role === 'main'
                    ? { opacity: filmP }
                    : { opacity: 1 - filmP };
            }
            case 'additive-dissolve':
                return role === 'main' ? { opacity: p } : { opacity: outP };
            case 'dip-to-black':
                if (role === 'outgoing') {
                    return p < 0.5
                        ? { opacity: 1 - p * 2, brightness: 1 - p * 1.2 }
                        : { opacity: 0.05 };
                }
                return p > 0.5
                    ? { opacity: (p - 0.5) * 2, brightness: 0.4 + (p - 0.5) * 1.2 }
                    : { opacity: 0.05 };
            case 'dip-to-white':
                if (role === 'outgoing') {
                    return p < 0.5
                        ? { opacity: 1 - p * 2, brightness: 1 + p * 3 }
                        : { opacity: 0.05 };
                }
                return p > 0.5
                    ? { opacity: (p - 0.5) * 2, brightness: 2.5 - (p - 0.5) * 3 }
                    : { opacity: 0.05 };
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
                    ? { translateX: xMult * 100 * outP, translateY: yMult * 100 * outP, blur: Math.sin(p * Math.PI) * 5 }
                    : { translateX: xMult * -100 * p, translateY: yMult * -100 * p, blur: Math.sin(p * Math.PI) * 5 };

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
                // Plus-shape expanding from center
                const easeCross = easeOutCubic(p);
                const w = 20 + (80 * easeCross);
                const halfW = w / 2;
                return role === 'main'
                    ? {
                        clipType: 'polygon', clipPolygon: [
                            { x: 50 - halfW, y: 0 }, { x: 50 + halfW, y: 0 },
                            { x: 50 + halfW, y: 50 - halfW }, { x: 100, y: 50 - halfW },
                            { x: 100, y: 50 + halfW }, { x: 50 + halfW, y: 50 + halfW },
                            { x: 50 + halfW, y: 100 }, { x: 50 - halfW, y: 100 },
                            { x: 50 - halfW, y: 50 + halfW }, { x: 0, y: 50 + halfW },
                            { x: 0, y: 50 - halfW }, { x: 50 - halfW, y: 50 - halfW }
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
            case 'split': {
                // Split from center
                const easeS = easeOutCubic(p);
                const insetH = 50 * (1 - easeS);
                const insetV = 50 * (1 - easeS);
                return role === 'main'
                    ? { clipType: 'inset', clipInset: direction === 'up' || direction === 'down' ? { top: insetV, right: 0, bottom: insetV, left: 0 } : { top: 0, right: insetH, bottom: 0, left: insetH } }
                    : {};
            }
            case 'clock-wipe':
            case 'radial-wipe': {
                // Clock wipe - approximated with circle expanding
                const easeC = easeOutCubic(p);
                return role === 'main'
                    ? { clipType: 'circle', clipCircle: { radius: easeC * 75, cx: 50, cy: 50 } }
                    : {};
            }
            case 'venetian-blinds': {
                // Simplified venetian blinds as horizontal wipe
                const easeV = easeOutCubic(p);
                return role === 'main'
                    ? { clipType: 'inset', clipInset: { top: 0, right: 100 - easeV * 100, bottom: 0, left: 0 }, brightness: 0.8 + 0.2 * p }
                    : { brightness: 1 - p * 0.2 };
            }
            case 'checker-wipe': {
                // Simplified checker as dissolve with opacity
                const easeChk = easeOutCubic(p);
                return role === 'main'
                    ? { opacity: easeChk, brightness: 0.8 + 0.2 * p }
                    : { opacity: 1 - easeChk * 0.7, brightness: 1 - p * 0.2 };
            }
            case 'zig-zag': {
                // Simplified zig-zag as diagonal wipe
                const easeZ = easeOutCubic(p);
                return role === 'main'
                    ? { clipType: 'inset', clipInset: { top: 0, right: 100 - easeZ * 100, bottom: 0, left: 0 }, brightness: 0.8 + 0.2 * p }
                    : { brightness: 1 - p * 0.2 };
            }

            // === ZOOMS ===
            case 'cross-zoom': {
                const blurAmount = Math.sin(p * Math.PI) * 10;
                if (role === 'outgoing') {
                    return { scale: 1 + p * 3, blur: blurAmount, brightness: 1 + p * 0.5, opacity: outP };
                }
                return { scale: 3 - p * 2, blur: blurAmount, brightness: 1.5 - p * 0.5, opacity: p };
            }
            case 'zoom-in':
                return role === 'main'
                    ? { scale: 0.5 + 0.5 * p, opacity: p }
                    : { opacity: outP };
            case 'zoom-out':
                return role === 'outgoing'
                    ? { scale: 1 + p * 0.5, opacity: outP }
                    : { opacity: p };

            // === SPINS ===
            case 'spin':
                return role === 'outgoing'
                    ? { rotate: p * 360, scale: outP, opacity: outP }
                    : { rotate: (1 - p) * -360, scale: p, opacity: p };
            case 'spin-3d':
                return role === 'main'
                    ? { rotate: (1 - p) * -90, opacity: p }
                    : { rotate: p * 90, opacity: outP };

            // === 3D TRANSITIONS ===
            case 'cube-rotate': {
                const cubeEase = easeOutCubic(p);
                return role === 'main'
                    ? { rotate: (1 - cubeEase) * -90, brightness: 0.7 + cubeEase * 0.3, opacity: cubeEase }
                    : { rotate: cubeEase * 90, brightness: 1 - cubeEase * 0.3, opacity: 1 - cubeEase };
            }
            case 'flip-3d': {
                const flipEase = easeOutCubic(p);
                return role === 'main'
                    ? { scaleY: flipEase, brightness: 0.6 + flipEase * 0.4, opacity: flipEase }
                    : { scaleY: 1 - flipEase, brightness: 1 - flipEase * 0.4, opacity: 1 - flipEase };
            }
            case 'page-curl':
            case 'page-peel': {
                const peelEase = easeOutCubic(p);
                return role === 'main'
                    ? { rotate: (1 - peelEase) * -5, opacity: peelEase }
                    : { brightness: 1 - peelEase * 0.2 };
            }

            // === SHAPES ===
            case 'shape-circle': {
                const circleEase = easeOutCubic(p);
                return role === 'main'
                    ? { clipType: 'circle', clipCircle: { radius: circleEase * 75, cx: 50, cy: 50 } }
                    : {};
            }
            case 'shape-heart':
            case 'heart': {
                const heartEase = easeOutCubic(p);
                const heartSize = heartEase * 50;
                return role === 'main'
                    ? {
                        clipType: 'polygon', clipPolygon: [
                            { x: 50, y: 50 + heartSize },
                            { x: 50 - heartSize, y: 50 - heartSize * 0.4 },
                            { x: 50, y: 50 - heartSize },
                            { x: 50 + heartSize, y: 50 - heartSize * 0.4 }
                        ]
                    }
                    : {};
            }
            case 'shape-triangle':
            case 'triangle': {
                const triEase = easeOutCubic(p);
                const triSize = triEase * 50;
                return role === 'main'
                    ? {
                        clipType: 'polygon', clipPolygon: [
                            { x: 50, y: 50 - triSize },
                            { x: 50 + triSize, y: 50 + triSize },
                            { x: 50 - triSize, y: 50 + triSize }
                        ]
                    }
                    : {};
            }
            case 'mosaic-grid': {
                const mosaicEase = easeOutCubic(p);
                return role === 'main'
                    ? { scale: 0.5 + 0.5 * mosaicEase, opacity: mosaicEase }
                    : {};
            }

            // === FLASH ===
            case 'flash':
                return role === 'outgoing'
                    ? { opacity: p < 0.5 ? 1 : 0 }
                    : { opacity: p >= 0.5 ? 1 : 0 };

            // === BLUR ===
            case 'blur':
            case 'zoom-blur':
                return role === 'outgoing'
                    ? { blur: p * 20, opacity: outP }
                    : { blur: outP * 20, opacity: p };

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
                if (role === 'main') {
                    return {
                        translateX: xMult * 100 * outP,
                        translateY: yMult * 100 * outP,
                        scale: 0.8 + 0.2 * p,
                        blur: outP * 3,
                        opacity: 0.3 + 0.7 * p
                    };
                }
                return { scale: 1 - p * 0.2, brightness: 1 - p * 0.4, blur: p * 2, opacity: 1 - p * 0.3 };

            // === MORPH ===
            case 'morph-cut':
                return role === 'main'
                    ? { opacity: p, scale: 0.95 + 0.05 * p }
                    : { opacity: outP, scale: 1 + 0.05 * outP };

            // === PAGE ===
            case 'page-peel':
                return role === 'main'
                    ? { rotate: (1 - p) * -5, opacity: p }
                    : { brightness: 1 - p * 0.2 };

            // === FILM & LIGHT EFFECTS ===
            case 'film-burn': {
                const burnIntensity = Math.sin(p * Math.PI);
                return {
                    brightness: 1 + burnIntensity * 3,
                    sepia: burnIntensity * 0.5,
                    saturate: 1 + burnIntensity,
                    contrast: 1 - burnIntensity * 0.2,
                    scale: 1 + burnIntensity * 0.1,
                    opacity: role === 'main' ? p : outP
                };
            }
            case 'light-leak':
                return role === 'main'
                    ? { sepia: 1 - p, brightness: 1 + (1 - p), opacity: p }
                    : { sepia: p, brightness: 1 + p, opacity: outP };
            case 'luma-dissolve': {
                const lumaP = 1 - Math.pow(1 - p, 2);
                return role === 'main'
                    ? { brightness: 0.7 + lumaP * 0.3, opacity: lumaP }
                    : { brightness: 1 - lumaP * 0.3, opacity: 1 - lumaP };
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
                return role === 'main' ? { opacity: p } : { opacity: outP };
            case 'datamosh': {
                return {
                    scale: 1 + Math.sin(p * 8) * 0.08,
                    opacity: role === 'main' ? p : outP
                };
            }
            case 'chromatic-aberration':
                return { opacity: role === 'main' ? p : outP };

            // === DISTORTION ===
            case 'ripple':
                return role === 'main'
                    ? { scale: 1 + Math.sin(p * 10) * 0.05, opacity: p }
                    : { opacity: outP };
            case 'ripple-dissolve':
                return {
                    scale: 1 + Math.sin(p * Math.PI * 4) * 0.05,
                    blur: Math.sin(p * Math.PI) * 2,
                    opacity: role === 'main' ? p : outP
                };
            case 'stretch':
                return role === 'main'
                    ? { scaleX: 0.1 + 0.9 * p, opacity: p }
                    : { scaleX: 1 + p, opacity: outP };
            case 'liquid':
                return { opacity: role === 'main' ? p : outP };

            // === MOVEMENT ===
            case 'flow':
                return role === 'main'
                    ? { translateX: xMult * 100 * outP, translateY: yMult * 100 * outP, scale: 0.9 + 0.1 * p, opacity: p }
                    : { translateX: xMult * -50 * p, translateY: yMult * -50 * p, scale: 1 - 0.1 * p, opacity: outP };
            case 'smooth-wipe':
                return role === 'main'
                    ? { translateX: 50 * outP, opacity: p }
                    : { translateX: -50 * p, opacity: outP };
            case 'tile-drop':
                return role === 'main'
                    ? { translateY: -100 * outP, opacity: p }
                    : { translateY: 100 * p, opacity: outP };
            case 'whip-pan':
                return role === 'main'
                    ? { translateX: 100 * outP }
                    : { translateX: -100 * p };
            case 'film-roll':
                return role === 'main'
                    ? { translateY: 100 * outP }
                    : { translateY: -100 * p };

            // === ADVANCED DISSOLVES ===
            case 'non-additive-dissolve':
                return { opacity: role === 'main' ? Math.pow(p, 2) : Math.pow(outP, 2) };
            case 'flash-zoom-in':
                return role === 'main'
                    ? { scale: 2 - p, brightness: 1 + (1 - p) * 5, opacity: p }
                    : { scale: 1 + p, brightness: 1 + p * 5, opacity: outP };
            case 'flash-zoom-out':
                return role === 'main'
                    ? { scale: 0.5 + p * 0.5, brightness: 1 + (1 - p) * 5, opacity: p }
                    : { scale: 1 - p * 0.5, brightness: 1 + p * 5, opacity: outP };

            // === ADDITIONAL TRANSITIONS (from Canvas.tsx) ===
            case 'fade-color': {
                if (role === 'outgoing') {
                    if (p < 0.5) {
                        const fade = p * 2;
                        return { brightness: 1 - fade * 0.5, saturate: 1 - fade * 0.7, opacity: 1 - Math.pow(fade, 1.5) };
                    }
                    return { opacity: 0.01 };
                }
                if (p > 0.5) {
                    const fade = (p - 0.5) * 2;
                    return { brightness: 0.5 + fade * 0.5, saturate: 0.3 + fade * 0.7, opacity: Math.pow(fade, 0.7) };
                }
                return { opacity: 0.01 };
            }
            case 'brush-reveal': {
                const brushEase = easeOutCubic(p);
                return role === 'main'
                    ? { clipType: 'circle', clipCircle: { radius: brushEase * 75, cx: 50, cy: 50 }, contrast: 1.2, sepia: 0.2 }
                    : {};
            }
            case 'ink-splash': {
                const inkEase = easeOutCubic(p);
                return role === 'main'
                    ? { clipType: 'circle', clipCircle: { radius: inkEase * 75, cx: 50, cy: 50 }, contrast: 1.5 }
                    : {};
            }
            case 'speed-blur':
                return role === 'main'
                    ? { scale: 1.2, opacity: p }
                    : { scale: 0.8, opacity: outP };
            case 'warp-zoom':
                return role === 'main'
                    ? { scale: 0.5 + p * 0.5, opacity: p }
                    : { scale: 1 + p * 1.5, opacity: outP };
            case 'band-slide':
                return role === 'main'
                    ? { translateX: xMult * 100 * outP, translateY: yMult * 100 * outP }
                    : { translateX: xMult * -100 * p, translateY: yMult * -100 * p };
            case 'multi-panel': {
                const panelEase = easeOutCubic(p);
                return role === 'main'
                    ? { clipType: 'inset', clipInset: { top: 0, right: 100 - panelEase * 100, bottom: 0, left: 0 }, scale: 0.8 + 0.2 * panelEase }
                    : {};
            }
            case 'split-screen': {
                const splitEase = easeOutCubic(p);
                const ss = 50 * (1 - splitEase);
                return role === 'main'
                    ? { clipType: 'inset', clipInset: { top: 0, right: ss, bottom: 0, left: ss } }
                    : {};
            }
            case 'simple-wipe':
                return role === 'main'
                    ? { clipType: 'inset', clipInset: direction === 'left' ? { top: 0, right: 100 - p * 100, bottom: 0, left: 0 } : direction === 'right' ? { top: 0, right: 0, bottom: 0, left: 100 - p * 100 } : direction === 'up' ? { top: 100 - p * 100, right: 0, bottom: 0, left: 0 } : { top: 0, right: 0, bottom: 100 - p * 100, left: 0 } }
                    : {};
            case 'fade-dissolve':
                if (role === 'outgoing') return { opacity: p < 0.5 ? 1 - p * 2 : 0.05 };
                return { opacity: p > 0.5 ? (p - 0.5) * 2 : 0.05 };

            // DEFAULT
            default:
                return { opacity: role === 'main' ? p : outP };
        }
    }


    /**
     * Get CSS filter string for preset filter
     */
    private getFilterStyle(filterName: string): string {
        switch (filterName) {
            case 'vintage':
                return 'sepia(0.5) contrast(1.2) saturate(0.8)';
            case 'cinematic':
                return 'contrast(1.3) saturate(0.9) brightness(0.95)';
            case 'warm':
                return 'sepia(0.3) saturate(1.3)';
            case 'cold':
                return 'hue-rotate(180deg) saturate(1.2)';
            case 'bw':
            case 'black-white':
                return 'grayscale(1)';
            default:
                return '';
        }
    }

    /**
     * Render a solid color item
     */
    private renderColorItem(item: TimelineItem, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
        const { x, y, width, height } = this.calculateItemBounds(item, canvas);

        ctx.save();
        ctx.globalAlpha = (item.opacity ?? 100) / 100;

        const colorSrc = item.src || '';

        // Check if it's a gradient (linear or radial)
        if (colorSrc.includes('linear-gradient')) {
            const gradientFill = this.parseLinearGradient(colorSrc, x, y, width, height, ctx);
            ctx.fillStyle = gradientFill || '#000000';
        } else if (colorSrc.includes('radial-gradient')) {
            const gradientFill = this.parseRadialGradient(colorSrc, x, y, width, height, ctx);
            ctx.fillStyle = gradientFill || '#000000';
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
    private parseLinearGradient(css: string, x: number, y: number, width: number, height: number, ctx: CanvasRenderingContext2D): CanvasGradient | null {
        try {
            const match = css.match(/linear-gradient\(([^)]+)\)/);
            if (!match) return null;

            const content = match[1];
            const parts = content.split(',').map(s => s.trim());

            let angle = 180;
            let colorStartIndex = 0;

            const firstPart = parts[0].toLowerCase();
            if (firstPart.includes('deg')) {
                angle = parseFloat(firstPart);
                colorStartIndex = 1;
            } else if (firstPart === 'to right') { angle = 90; colorStartIndex = 1; }
            else if (firstPart === 'to left') { angle = 270; colorStartIndex = 1; }
            else if (firstPart === 'to bottom') { angle = 180; colorStartIndex = 1; }
            else if (firstPart === 'to top') { angle = 0; colorStartIndex = 1; }
            else if (firstPart.includes('to bottom right') || firstPart.includes('to right bottom')) { angle = 135; colorStartIndex = 1; }
            else if (firstPart.includes('to bottom left') || firstPart.includes('to left bottom')) { angle = 225; colorStartIndex = 1; }
            else if (firstPart.includes('to top right') || firstPart.includes('to right top')) { angle = 45; colorStartIndex = 1; }
            else if (firstPart.includes('to top left') || firstPart.includes('to left top')) { angle = 315; colorStartIndex = 1; }

            const colors = parts.slice(colorStartIndex);
            if (colors.length < 2) return null;

            const radians = (angle - 90) * (Math.PI / 180);
            const cx = x + width / 2;
            const cy = y + height / 2;
            const diagonal = Math.sqrt(width * width + height * height) / 2;

            const x1 = cx - Math.cos(radians) * diagonal;
            const y1 = cy - Math.sin(radians) * diagonal;
            const x2 = cx + Math.cos(radians) * diagonal;
            const y2 = cy + Math.sin(radians) * diagonal;

            const gradient = ctx.createLinearGradient(x1, y1, x2, y2);

            colors.forEach((color, i) => {
                const colorParts = color.trim().split(/\s+/);
                const colorValue = colorParts[0];
                const stop = colorParts[1] ? parseFloat(colorParts[1]) / 100 : i / (colors.length - 1);
                gradient.addColorStop(Math.max(0, Math.min(1, stop)), colorValue);
            });

            return gradient;
        } catch (err) {
            console.warn('[ExportEngine] Failed to parse linear-gradient:', css, err);
            return null;
        }
    }

    /**
     * Parse CSS radial-gradient and create Canvas gradient
     */
    private parseRadialGradient(css: string, x: number, y: number, width: number, height: number, ctx: CanvasRenderingContext2D): CanvasGradient | null {
        try {
            const match = css.match(/radial-gradient\(([^)]+)\)/);
            if (!match) return null;

            const content = match[1];
            const parts = content.split(',').map(s => s.trim());

            // Find colors (skip shape/size/position prefixes)
            let colorStartIndex = 0;
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i].toLowerCase();
                if (part.includes('circle') || part.includes('ellipse') || part.includes('at ') || part.includes('closest') || part.includes('farthest')) {
                    colorStartIndex = i + 1;
                } else {
                    break;
                }
            }

            let colors = parts.slice(colorStartIndex);
            if (colors.length < 2) {
                colors = parts.filter(p => !p.toLowerCase().includes('circle') && !p.toLowerCase().includes('ellipse'));
                if (colors.length < 2) return null;
            }

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
        } catch (err) {
            console.warn('[ExportEngine] Failed to parse radial-gradient:', css, err);
            return null;
        }
    }

    /**
     * Render a text item with ALL features to match preview exactly
     * Supports: text effects, animations, textDecoration, textTransform, listType, multiline
     */
    private renderTextItem(item: TimelineItem, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, currentTime: number): void {
        const { x, y, width, height } = this.calculateItemBounds(item, canvas);
        ctx.save();

        // Scale fontSize based on export resolution (design is at 1080p)
        const baseFontSize = item.fontSize || 40;
        const fontSize = baseFontSize * this.resolutionScale;
        const fontStyle = item.fontStyle || 'normal';
        const fontWeight = item.fontWeight || 'normal';
        const lineHeight = fontSize * 1.4; // Match CSS lineHeight: 1.4
        ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${item.fontFamily || 'Inter'}`;
        ctx.fillStyle = item.color || '#000000';
        ctx.textAlign = (item.textAlign as CanvasTextAlign) || 'center';
        ctx.textBaseline = 'top';

        // Get text and apply textTransform
        let text = item.name || item.src || '';
        if (item.textTransform === 'uppercase') {
            text = text.toUpperCase();
        } else if (item.textTransform === 'lowercase') {
            text = text.toLowerCase();
        }

        // === APPLY ANIMATIONS ===
        const animStyle = this.calculateAnimationStyle(item, currentTime);

        // Debug: Log text rendering with animation
        console.log(`[ExportEngine] Rendering text "${text.substring(0, 20)}..." at t=${currentTime.toFixed(2)}s`, {
            animation: item.animation?.type || 'none',
            animStyle,
            position: { x, y, width, height }
        });

        // Calculate text position - MATCH Canvas.tsx getItemPositionAndTransform
        // Canvas.tsx uses: left = 50 + item.x %, transform = translate(-50%, -50%)
        // This means: position at center + offset, then shift back by half width/height

        let textX: number;
        let textY: number;

        // Apply text alignment adjustments (matching Canvas.tsx lines 1058-1063)
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
            // Middle: center vertically
            textY = y + height / 2 - fontSize / 2;
        }

        // Apply transformations from animation - translate to text position first
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
        if (animStyle.translateX || animStyle.translateY) {
            ctx.translate(animStyle.translateX || 0, animStyle.translateY || 0);
        }

        // Apply blur filter if needed
        if (animStyle.blur) {
            ctx.filter = `blur(${animStyle.blur}px)`;
        }

        // Apply opacity from both animation and item
        const baseOpacity = (item.opacity ?? 100) / 100;
        const animOpacity = animStyle.opacity ?? 1;
        ctx.globalAlpha = baseOpacity * animOpacity;

        // Get effect properties (scale by resolution for consistent appearance)
        const effect = item.textEffect;
        const effectType = effect?.type || 'none';
        const effColor = effect?.color || '#000000';
        const intensity = effect?.intensity ?? 50;
        const offset = effect?.offset ?? 50;
        const dist = ((offset / 100) * 20) * this.resolutionScale;
        const blur = ((intensity / 100) * 20) * this.resolutionScale;

        // === RENDER TEXT (with multiline and list support) ===
        const lines = text.split('\n');
        let currentY = 0;

        for (let i = 0; i < lines.length; i++) {
            let lineText = lines[i];

            // Apply list formatting
            if (item.listType === 'bullet') {
                lineText = '• ' + lineText;
            } else if (item.listType === 'number') {
                lineText = `${i + 1}. ` + lineText;
            }

            // Draw based on effect type
            switch (effectType) {
                case 'shadow':
                    ctx.shadowColor = effColor;
                    ctx.shadowBlur = blur;
                    ctx.shadowOffsetX = dist;
                    ctx.shadowOffsetY = dist;
                    ctx.fillText(lineText, 0, currentY);
                    break;

                case 'lift':
                    ctx.shadowColor = 'rgba(0,0,0,0.5)';
                    ctx.shadowBlur = blur + 10;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = dist * 0.5 + 4;
                    ctx.fillText(lineText, 0, currentY);
                    break;

                case 'outline':
                    ctx.strokeStyle = effColor;
                    ctx.lineWidth = (intensity / 100) * 3 + 1;
                    ctx.strokeText(lineText, 0, currentY);
                    ctx.fillText(lineText, 0, currentY);
                    break;

                case 'hollow':
                    ctx.strokeStyle = item.color || '#000000';
                    ctx.lineWidth = (intensity / 100) * 3 + 1;
                    ctx.strokeText(lineText, 0, currentY);
                    // Don't fill - hollow effect shows only stroke
                    break;

                case 'neon':
                    ctx.shadowColor = effColor;
                    ctx.shadowBlur = intensity * 0.4;
                    ctx.fillText(lineText, 0, currentY);
                    ctx.shadowBlur = intensity * 0.2;
                    ctx.fillText(lineText, 0, currentY);
                    ctx.shadowBlur = intensity * 0.1;
                    ctx.fillText(lineText, 0, currentY);
                    break;

                case 'glitch':
                    const gOff = (offset / 100) * 5 + 2;
                    // Cyan layer
                    ctx.fillStyle = '#00ffff';
                    ctx.fillText(lineText, -gOff, currentY - gOff);
                    // Magenta layer
                    ctx.fillStyle = '#ff00ff';
                    ctx.fillText(lineText, gOff, currentY + gOff);
                    // Original
                    ctx.fillStyle = item.color || '#000000';
                    ctx.fillText(lineText, 0, currentY);
                    break;

                case 'echo':
                    const echoAlpha = ctx.globalAlpha;
                    ctx.globalAlpha = echoAlpha * 0.2;
                    ctx.fillText(lineText, dist * 3, currentY + dist * 3);
                    ctx.globalAlpha = echoAlpha * 0.4;
                    ctx.fillText(lineText, dist * 2, currentY + dist * 2);
                    ctx.globalAlpha = echoAlpha * 0.8;
                    ctx.fillText(lineText, dist, currentY + dist);
                    ctx.globalAlpha = echoAlpha;
                    ctx.fillText(lineText, 0, currentY);
                    break;

                case 'splice':
                    ctx.strokeStyle = item.color || '#000000';
                    ctx.lineWidth = (intensity / 100) * 3 + 1;
                    ctx.strokeText(lineText, 0, currentY);
                    ctx.fillStyle = effColor;
                    ctx.fillText(lineText, dist + 2, currentY + dist + 2);
                    ctx.fillStyle = item.color || '#000000';
                    ctx.fillText(lineText, 0, currentY);
                    break;

                case 'background':
                    const textMetrics = ctx.measureText(lineText);
                    const textWidth = textMetrics.width;
                    const textHeight = fontSize * 1.2;
                    const padX = 8;
                    const padY = 4;
                    // Calculate background position based on alignment
                    let bgX = -padX;
                    if (ctx.textAlign === 'center') {
                        bgX = -textWidth / 2 - padX;
                    } else if (ctx.textAlign === 'right') {
                        bgX = -textWidth - padX;
                    }
                    // Draw background
                    ctx.fillStyle = effColor;
                    ctx.fillRect(bgX, currentY - padY, textWidth + padX * 2, textHeight + padY * 2);
                    // Draw text
                    ctx.fillStyle = item.color || '#000000';
                    ctx.fillText(lineText, 0, currentY);
                    break;

                default:
                    // No effect or 'none' - just draw text
                    ctx.fillText(lineText, 0, currentY);
                    break;
            }

            // Draw text decoration (underline or strikethrough)
            if (item.textDecoration && item.textDecoration !== 'none') {
                this.drawTextDecoration(ctx, lineText, 0, currentY, fontSize, item.textDecoration, item.color || '#000000');
            }

            currentY += lineHeight;
        }

        ctx.restore();
    }

    /**
     * Draw text decoration (underline or strikethrough)
     */
    private drawTextDecoration(
        ctx: CanvasRenderingContext2D,
        text: string,
        x: number,
        y: number,
        fontSize: number,
        decoration: string,
        color: string
    ): void {
        const textMetrics = ctx.measureText(text);
        const textWidth = textMetrics.width;

        // Calculate line position based on text alignment
        let lineX = x;
        if (ctx.textAlign === 'center') {
            lineX = x - textWidth / 2;
        } else if (ctx.textAlign === 'right') {
            lineX = x - textWidth;
        }

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, fontSize / 20);
        ctx.beginPath();

        if (decoration === 'underline') {
            const underlineY = y + fontSize * 1.1;
            ctx.moveTo(lineX, underlineY);
            ctx.lineTo(lineX + textWidth, underlineY);
        } else if (decoration === 'line-through') {
            const strikeY = y + fontSize * 0.5;
            ctx.moveTo(lineX, strikeY);
            ctx.lineTo(lineX + textWidth, strikeY);
        }

        ctx.stroke();
        ctx.restore();
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
            // Approximate cubic-bezier(0.2, 0.8, 0.2, 1) with ease-out feel
            return t < 0.5
                ? 4 * t * t * t
                : 1 - Math.pow(-2 * t + 2, 3) / 2;
        };

        const p = cubicBezier(progress);

        // Helper for multi-stop keyframes
        const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

        switch (animType) {
            // === BASIC (from animations.css) ===
            case 'fade-in':
                // 0%: opacity 0 → 100%: opacity 1
                return { opacity: p };

            case 'boom':
                // 0%: scale(0.8), opacity 0 → 50%: scale(1.1) → 100%: scale(1), opacity 1
                if (progress < 0.5) {
                    const t = progress / 0.5;
                    return { scale: 0.8 + 0.3 * t, opacity: t };
                } else {
                    const t = (progress - 0.5) / 0.5;
                    return { scale: 1.1 - 0.1 * t, opacity: 1 };
                }

            // === BOUNCE (4-stop keyframes) ===
            case 'bounce-left':
                // 0%: translateX(-100%), opacity 0 → 60%: translateX(20px) → 80%: translateX(-10px) → 100%: translateX(0)
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
                // 0%: translateX(100%) → 60%: translateX(-20px) → 80%: translateX(10px) → 100%: translateX(0)
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
                // 0%: translateY(100%) → 60%: translateY(-20px) → 80%: translateY(10px) → 100%: translateY(0)
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
                // 0%: translateY(-100%) → 60%: translateY(20px) → 80%: translateY(-10px) → 100%: translateY(0)
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

            // === ROTATION ===
            case 'rotate-cw-1':
                // from: rotate(-360deg), opacity 0 → to: rotate(0), opacity 1
                return { rotate: -360 + 360 * p, opacity: p };

            case 'rotate-cw-2':
                return { rotate: -180 + 180 * p, opacity: p };

            case 'rotate-ccw':
                // from: rotate(360deg) → to: rotate(0)
                return { rotate: 360 - 360 * p, opacity: p };

            case 'spin-open':
                // 0%: scale(0.1), rotate(720deg), opacity 0 → 100%: scale(1), rotate(0), opacity 1
                return { scale: 0.1 + 0.9 * p, rotate: 720 - 720 * p, opacity: p };

            case 'spin-1':
                // from: rotate(-90deg) scale(0.5), opacity 0 → to: rotate(0) scale(1), opacity 1
                return { rotate: -90 + 90 * p, scale: 0.5 + 0.5 * p, opacity: p };

            // === SLIDE / MOVE (CORRECTED DIRECTIONS from CSS) ===
            case 'slide-down-up-1':
                // from: translateY(100%), opacity 0 → to: translateY(0), opacity 1
                return { translateY: 100 - 100 * p, opacity: p };

            case 'move-left':
                // CSS: from translateX(100%) → to translateX(0) (comes from RIGHT)
                return { translateX: 100 - 100 * p, opacity: p };

            case 'move-right':
                // CSS: from translateX(-100%) → to translateX(0) (comes from LEFT)
                return { translateX: -100 + 100 * p, opacity: p };

            case 'move-top':
                // CSS: from translateY(100%) → to translateY(0) (comes from BOTTOM)
                return { translateY: 100 - 100 * p, opacity: p };

            case 'move-bottom':
                // CSS: from translateY(-100%) → to translateY(0) (comes from TOP)
                return { translateY: -100 + 100 * p, opacity: p };

            // === FADE + MOVEMENT ===
            case 'fade-slide-left':
                // CSS: from translateX(50px), opacity 0 → to translateX(0), opacity 1
                return { translateX: 50 - 50 * p, opacity: p };

            case 'fade-slide-right':
                // CSS: from translateX(-50px), opacity 0 → to translateX(0), opacity 1
                return { translateX: -50 + 50 * p, opacity: p };

            case 'fade-slide-up':
                // CSS: from translateY(50px) → to translateY(0)
                return { translateY: 50 - 50 * p, opacity: p };

            case 'fade-slide-down':
                // CSS: from translateY(-50px) → to translateY(0)
                return { translateY: -50 + 50 * p, opacity: p };

            case 'fade-zoom-in':
                // CSS: from scale(0.8), opacity 0 → to scale(1), opacity 1
                return { scale: 0.8 + 0.2 * p, opacity: p };

            case 'fade-zoom-out':
                // CSS: from scale(1.2), opacity 0 → to scale(1), opacity 1
                return { scale: 1.2 - 0.2 * p, opacity: p };

            // === BLUR/FLASH (simulated - Canvas 2D can't do blur) ===
            // === BLUR/FLASH (simulated - Canvas can do blur/filters now) ===
            case 'motion-blur':
                // CSS: from blur(20px), scale(1.1), opacity 0 → to blur(0), scale(1), opacity 1
                return { scale: 1.1 - 0.1 * p, opacity: p, blur: 20 * (1 - p) };

            case 'blur-in':
                return { opacity: p, blur: 10 * (1 - p) };

            case 'blurry-eject':
                // 0%: scale(0.5), opacity 0 → 60%: scale(1.05) → 100%: scale(1), opacity 1
                if (progress < 0.6) {
                    const t = progress / 0.6;
                    return { scale: 0.5 + 0.55 * t, blur: 5 * (1 - t), opacity: t };
                } else {
                    const t = (progress - 0.6) / 0.4;
                    return { scale: 1.05 - 0.05 * t, opacity: 1, blur: 0 };
                }

            case 'flash-drop':
                // CSS: from translateY(-50px), brightness(3), opacity 0 → to translateY(0), brightness(1), opacity 1
                return { translateY: -50 + 50 * p, opacity: p, blur: 10 * (1 - p), brightness: 3 - 2 * p };

            case 'flash-open':
                // CSS: from scale(0.5), brightness(5), opacity 0 → to scale(1), brightness(1), opacity 1
                return { scale: 0.5 + 0.5 * p, opacity: p, brightness: 5 - 4 * p };

            case 'black-hole':
                // CSS: from scale(0) rotate(180deg), opacity 0 → to scale(1) rotate(0), opacity 1
                return { scale: p, rotate: 180 - 180 * p, opacity: p, contrast: 2 - p };

            case 'pixelated-motion':
                return { opacity: p, blur: 10 * (1 - p), contrast: 2 - p };

            case 'screen-flicker':
                // Multi-stop flicker effect: 0%→20%→40%→60%→80%→100%
                if (progress < 0.2) return { opacity: progress * 2.5, brightness: 0.5 + 1.5 * (progress / 0.2) };
                if (progress < 0.4) return { opacity: 0.2 + 0.3 * Math.random(), brightness: 2 };
                if (progress < 0.6) return { opacity: 0.5 + 0.5 * ((progress - 0.4) / 0.2), brightness: 2 - 0.5 * ((progress - 0.4) / 0.2) };
                if (progress < 0.8) return { opacity: 0.8 + 0.2 * Math.random(), brightness: 1.5 };
                return { opacity: 1, brightness: 1 };

            case 'pulse-open':
                // 0%: scale(1.2), opacity 0 → 50%: scale(0.9) → 100%: scale(1), opacity 1
                if (progress < 0.5) {
                    const t = progress / 0.5;
                    return { scale: 1.2 - 0.3 * t, blur: 2 * (1 - t), opacity: t };
                } else {
                    const t = (progress - 0.5) / 0.5;
                    return { scale: 0.9 + 0.1 * t, opacity: 1 };
                }

            case 'rgb-drop':
                // CSS: from translateY(-50px), opacity 0 → to translateY(0), opacity 1
                return { translateY: -50 + 50 * p, opacity: p, brightness: 1 + (1 - p), saturate: 1.5 };

            // === CREATIVE/MASK (approximated) ===
            case 'round-open':
                // CSS: from clip-path: circle(0%) → to clip-path: circle(100%)
                // Approximated with scale
                return { scale: p, opacity: p };

            case 'expansion':
                // CSS: from scaleX(0), opacity 0 → to scale(1), opacity 1
                return { scaleX: p, opacity: p };

            case 'old-tv':
                // 0%: scaleY(0.01) scaleX(0) → 50%: scaleY(0.01) scaleX(1) → 100%: scaleY(1) scaleX(1)
                if (progress < 0.5) {
                    const t = progress / 0.5;
                    return { scaleY: 0.01, scaleX: t, opacity: t };
                } else {
                    const t = (progress - 0.5) / 0.5;
                    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
                    return { scaleY: lerp(0.01, 1, t), scaleX: 1, opacity: 1 };
                }

            case 'shard-roll':
                // CSS: from rotate(360deg) scale(0) → to rotate(0) scale(1)
                return { rotate: 360 - 360 * p, scale: p, opacity: p };

            case 'tear-paper':
                // CSS uses clip-path - approximate with translateY
                return { translateY: -50 + 50 * p, opacity: p };

            // === FLIP (3D approximated with scaleY/scaleX for rotateX/rotateY) ===
            // Use minimum scale of 0.01 to prevent blank screen
            case 'flip-down-1': {
                // CSS: from perspective rotateX(90deg) → simulate with scaleY
                const minScale = 0.01;
                return { scaleY: minScale + (1 - minScale) * p, opacity: p };
            }
            case 'flip-down-2': {
                // CSS: from rotateX(90deg) scale(0.8) → simulate with scaleY + scale
                const minScale = 0.01;
                return { scaleY: minScale + (1 - minScale) * p, scale: 0.8 + 0.2 * p, opacity: p };
            }
            case 'flip-up-1': {
                // CSS: from rotateX(-90deg) → simulate with scaleY
                const minScale = 0.01;
                return { scaleY: minScale + (1 - minScale) * p, opacity: p };
            }
            case 'flip-up-2': {
                const minScale = 0.01;
                return { scaleY: minScale + (1 - minScale) * p, scale: 0.8 + 0.2 * p, opacity: p };
            }

            // === FLY ===
            case 'fly-in-rotate':
                // CSS: from translateX(-100%) rotate(-90deg), opacity 0 → to translateX(0) rotate(0), opacity 1
                return { translateX: -100 + 100 * p, rotate: -90 + 90 * p, opacity: p };

            case 'fly-in-flip': {
                // CSS: from translateX(-100%) rotateY(90deg) → simulate rotateY with scaleX
                const minScale = 0.01;
                return { translateX: -100 + 100 * p, scaleX: minScale + (1 - minScale) * p, opacity: p };
            }

            case 'fly-to-zoom': {
                // CSS: from scale(0) translateX(-100%), opacity 0 → to scale(1) translateX(0), opacity 1
                const minScale = 0.01;
                return { scale: minScale + (1 - minScale) * p, translateX: -100 + 100 * p, opacity: p };
            }

            case 'grow-shrink':
                // 0%: scale(0.8), opacity 0 → 60%: scale(1.2) → 100%: scale(1), opacity 1
                if (progress < 0.6) {
                    const t = progress / 0.6;
                    return { scale: 0.8 + 0.4 * t, opacity: t };
                } else {
                    const t = (progress - 0.6) / 0.4;
                    return { scale: 1.2 - 0.2 * t, opacity: 1 };
                }

            // === STRETCH ===
            case 'stretch-in-left':
                // CSS: from scaleX(2) translateX(-50%) → to scaleX(1) translateX(0)
                return { scaleX: 2 - p, translateX: -50 + 50 * p, opacity: p, blur: 5 * (1 - p) };

            case 'stretch-in-right':
                // CSS: from scaleX(2) translateX(50%) → to scaleX(1) translateX(0)
                return { scaleX: 2 - p, translateX: 50 - 50 * p, opacity: p, blur: 5 * (1 - p) };

            case 'stretch-in-up':
                // CSS: from scaleY(2) translateY(50%) → to scaleY(1) translateY(0)
                return { scaleY: 2 - p, translateY: 50 - 50 * p, opacity: p, blur: 5 * (1 - p) };

            case 'stretch-in-down':
                // CSS: from scaleY(2) translateY(-50%) → to scaleY(1) translateY(0)
                return { scaleY: 2 - p, translateY: -50 + 50 * p, opacity: p, blur: 5 * (1 - p) };

            case 'stretch-to-full':
                // CSS: from scale(0.5), opacity 0 → to scale(1), opacity 1
                return { scale: 0.5 + 0.5 * p, opacity: p };

            // === ZOOM ===
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

            case 'zoom-out-1':
                // CSS: from scale(1.5), opacity 0 → to scale(1), opacity 1
                return { scale: 1.5 - 0.5 * p, opacity: p };

            case 'zoom-out-2':
                return { scale: 2 - p, opacity: p };

            case 'zoom-out-3':
                return { scale: 3 - 2 * p, opacity: p, blur: 5 * (1 - p) };

            case 'wham':
                // Quick overshoot zoom with blur and rotate (from CSS)
                if (progress < 0.7) {
                    const t = progress / 0.7;
                    return { scale: 2 - 0.9 * t, rotate: 10 - 10 * t, blur: 10 * (1 - t), opacity: t };
                } else {
                    const t = (progress - 0.7) / 0.3;
                    return { scale: 1.1 - 0.1 * t, rotate: 0, blur: 0, opacity: 1 };
                }

            // === POSITION-BASED ===
            case 'to-left-1':
                // CSS: from translateX(100%), opacity 0 → to translateX(0), opacity 1
                return { translateX: 100 - 100 * p, opacity: p };

            case 'to-left-2':
                return { translateX: 50 - 50 * p, opacity: p };

            case 'to-right-1':
                return { translateX: -100 + 100 * p, opacity: p };

            case 'to-right-2':
                return { translateX: -50 + 50 * p, opacity: p };

            case 'up-down-1':
                // Multi-keyframe bounce
                if (progress < 0.2) return { translateY: lerp(-20, 20, progress / 0.2), opacity: progress * 5 };
                if (progress < 0.4) return { translateY: lerp(20, -10, (progress - 0.2) / 0.2), opacity: 1 };
                if (progress < 0.6) return { translateY: lerp(-10, 10, (progress - 0.4) / 0.2), opacity: 1 };
                if (progress < 0.8) return { translateY: lerp(10, -5, (progress - 0.6) / 0.2), opacity: 1 };
                return { translateY: lerp(-5, 0, (progress - 0.8) / 0.2), opacity: 1 };

            case 'up-down-2':
                return { translateY: 20 - 20 * p, opacity: p };

            // Missing animations from CSS
            case 'pan-enter-left':
                return { translateX: -100 + 100 * p, opacity: p };

            case 'pan-enter-right':
                return { translateX: 100 - 100 * p, opacity: p };

            case 'shake-up-down':
                // Multi-keyframe shake (same as up-down-1)
                if (progress < 0.2) return { translateY: lerp(-20, 20, progress / 0.2), opacity: progress * 5 };
                if (progress < 0.4) return { translateY: lerp(20, -10, (progress - 0.2) / 0.2), opacity: 1 };
                if (progress < 0.6) return { translateY: lerp(-10, 10, (progress - 0.4) / 0.2), opacity: 1 };
                if (progress < 0.8) return { translateY: lerp(10, -5, (progress - 0.6) / 0.2), opacity: 1 };
                return { translateY: lerp(-5, 0, (progress - 0.8) / 0.2), opacity: 1 };

            default:
                return { opacity: p };
        }
    }

    /**
     * Calculate item bounds in canvas pixels
     * Respects the fit property for proper aspect ratio handling
     */
    private calculateItemBounds(
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
                    // Media is wider, fit to height and crop width
                    height = canvasHeight;
                    width = height * mediaAspect;
                } else {
                    // Media is taller, fit to width and crop height
                    width = canvasWidth;
                    height = width / mediaAspect;
                }
            } else {
                // Contain - fit inside canvas while maintaining aspect ratio (may letterbox)
                if (mediaAspect > canvasAspect) {
                    // Media is wider, fit to width
                    width = canvasWidth;
                    height = width / mediaAspect;
                } else {
                    // Media is taller, fit to height
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
     * Load media element (video or image)
     * For videos, seeks to the correct position based on timeline time
     */
    private async loadMediaElement(item: TimelineItem, currentTime: number): Promise<HTMLImageElement | HTMLVideoElement | null> {
        if (item.type === 'image') {
            // Check image cache
            let img = this.imageCache.get(item.src);
            if (img) {
                return img;
            }

            return new Promise((resolve) => {
                const newImg = new Image();
                newImg.crossOrigin = 'anonymous';
                newImg.onload = () => {
                    this.imageCache.set(item.src, newImg);
                    resolve(newImg);
                };
                newImg.onerror = () => {
                    console.error(`[ExportEngine] Failed to load image: ${item.src}`);
                    resolve(null);
                };
                newImg.src = item.src;
            });
        } else if (item.type === 'video') {
            // Get or create video element from cache
            let video = this.videoCache.get(item.id);

            if (video === undefined) {
                const newVideo = await this.createVideoElement(item);
                if (!newVideo) return null;
                video = newVideo;
                this.videoCache.set(item.id, video);
            }

            // Calculate the correct time position in the source video
            // Formula: timeInSourceVideo = offset + (currentTimelineTime - clipStartTime) * speed
            const speed = item.speed ?? 1;
            const offset = item.offset ?? 0;
            const timeInClip = (currentTime - item.start) * speed;
            const timeInSourceVideo = offset + timeInClip;

            // Clamp to valid video duration
            const clampedTime = Math.max(0, Math.min(timeInSourceVideo, video.duration - 0.01));

            // Seek to the correct time and wait for frame to be ready
            if (Math.abs(video.currentTime - clampedTime) > 0.01) {
                video.currentTime = clampedTime;

                // Wait for seek to complete with multiple fallback mechanisms
                await this.waitForVideoFrame(video);
            }

            return video;
        }

        return null;
    }

    /**
     * Wait for video frame to be ready after seeking
     * Fast but ensures frame is decoded
     */
    private async waitForVideoFrame(video: HTMLVideoElement): Promise<void> {
        return new Promise<void>((resolve) => {
            const videoAny = video as any;

            // requestVideoFrameCallback is fast AND guarantees frame is ready
            if (typeof videoAny.requestVideoFrameCallback === 'function') {
                videoAny.requestVideoFrameCallback(() => resolve());
                return;
            }

            // Fallback: wait for seeked + minimal decode time
            let isResolved = false;
            const done = () => {
                if (isResolved) return;
                isResolved = true;
                resolve();
            };

            video.addEventListener('seeked', () => {
                // Brief wait for decode - 16ms = 1 frame at 60fps
                setTimeout(done, 16);
            }, { once: true });

            // Quick timeout fallback
            setTimeout(done, 100);
        });
    }

    /**
     * Create and load a video element
     */
    private createVideoElement(item: TimelineItem): Promise<HTMLVideoElement | null> {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.muted = true;
            video.playsInline = true;
            video.preload = 'auto';

            const timeout = setTimeout(() => {
                console.error(`[ExportEngine] Video load timeout: ${item.src}`);
                resolve(null);
            }, 30000); // 30 second timeout

            video.onloadeddata = () => {
                clearTimeout(timeout);
                console.log(`[ExportEngine] Video loaded: ${item.name || item.src} (duration: ${video.duration.toFixed(2)}s)`);
                resolve(video);
            };

            video.onerror = (e) => {
                clearTimeout(timeout);
                console.error(`[ExportEngine] Failed to load video: ${item.src}`, e);
                resolve(null);
            };

            // For blob URLs or same-origin, NEVER set crossOrigin (causes loading failures)
            // For external URLs, try to set crossOrigin for canvas compatibility
            const isExternal = item.src.startsWith('http://') || item.src.startsWith('https://');
            const isBlobOrData = item.src.startsWith('blob:') || item.src.startsWith('data:');

            if (isExternal && !isBlobOrData) {
                video.crossOrigin = 'anonymous';
            }
            // Note: Do NOT set crossOrigin for blob/data URLs!

            video.src = item.src;
            video.load();
        });
    }

    /**
     * Pre-load all video elements from the timeline to ensure smooth export
     */
    private async preloadAllVideos(tracks: Track[]): Promise<void> {
        const videoItems: TimelineItem[] = [];

        // Collect all video items from all tracks
        for (const track of tracks) {
            for (const item of track.items) {
                if (item.type === 'video') {
                    videoItems.push(item);
                }
            }
        }

        if (videoItems.length === 0) {
            console.log('[ExportEngine] No video items to preload');
            return;
        }

        console.log(`[ExportEngine] Pre-loading ${videoItems.length} video(s)...`);

        // Load all videos in parallel
        const loadPromises = videoItems.map(async (item) => {
            // Skip if already cached
            if (this.videoCache.has(item.id)) {
                console.log(`   ✓ Already cached: ${item.name || item.id}`);
                return;
            }

            const video = await this.createVideoElement(item);
            if (video) {
                this.videoCache.set(item.id, video);

                // Pre-buffer the video by seeking through key positions
                try {
                    // Seek to start and wait
                    video.currentTime = item.offset ?? 0;
                    await new Promise<void>((resolve) => {
                        const onSeeked = () => {
                            video.removeEventListener('seeked', onSeeked);
                            resolve();
                        };
                        video.addEventListener('seeked', onSeeked);
                        setTimeout(resolve, 500);
                    });
                    console.log(`   ✓ Pre-loaded: ${item.name || item.id}`);
                } catch (e) {
                    console.warn(`   ⚠ Pre-buffer failed: ${item.name || item.id}`, e);
                }
            }
        });

        await Promise.all(loadPromises);
        console.log(`[ExportEngine] All ${videoItems.length} video(s) pre-loaded`);
    }

    /**
     * Set up audio tracks from timeline using Web Audio API
     * Creates a mixed audio stream from all audio clips in the timeline
     * Also extracts audio from video items (unless muteVideo is enabled)
     */
    private async setupAudioTracks(tracks: Track[], duration: number): Promise<MediaStreamTrack[]> {
        // Collect all audio sources: audio track items + video items with audio
        const audioItems: TimelineItem[] = [];

        // Get items from audio track
        const audioTrack = tracks.find(t => t.type === 'audio');
        if (audioTrack) {
            audioItems.push(...audioTrack.items);
        }

        // Get video items that have audio (not muted)
        const videoTrack = tracks.find(t => t.type === 'video');
        if (videoTrack) {
            for (const item of videoTrack.items) {
                if (item.type === 'video' && item.muteVideo !== true) {
                    audioItems.push(item);
                    console.log(`   🎬 Video with audio: ${item.name}`);
                } else if (item.type === 'video' && item.muteVideo === true) {
                    console.log(`   🔇 Video muted: ${item.name}`);
                }
            }
        }

        if (audioItems.length === 0) {
            console.log('%c🔇 No audio sources found (no audio tracks, videos muted or have no audio)', 'color: #ffaa00');
            return [];
        }

        try {
            console.log(`%c🎵 Setting up audio (${audioItems.length} source(s))...`, 'color: #00aaff');

            // Create AudioContext
            const audioContext = new AudioContext({ sampleRate: 48000 });
            const destination = audioContext.createMediaStreamDestination();

            // Load and schedule all audio clips
            const audioBuffers: Array<{ buffer: AudioBuffer; item: TimelineItem }> = [];

            for (const item of audioItems) {
                try {
                    const buffer = await this.loadAudioBuffer(audioContext, item.src);
                    if (buffer) {
                        audioBuffers.push({ buffer, item });
                        const emoji = item.type === 'video' ? '🎬' : '🎵';
                        console.log(`   ✓ ${emoji} Loaded: ${item.name || 'Audio clip'}`);
                    }
                } catch (error) {
                    console.warn(`   ✗ Failed to load audio from: ${item.name}`, error);
                }
            }

            if (audioBuffers.length === 0) {
                console.warn('%c⚠️ No audio could be loaded from any source', 'color: #ff6600');
                return [];
            }

            // Schedule all audio clips to play at their timeline positions
            for (const { buffer, item } of audioBuffers) {
                const source = audioContext.createBufferSource();
                source.buffer = buffer;

                // Create gain node for volume control
                const gainNode = audioContext.createGain();
                gainNode.gain.value = (item.volume ?? 100) / 100;

                // Connect: source → gain → destination
                source.connect(gainNode);
                gainNode.connect(destination);

                // Calculate time within clip (accounting for offset and speed)
                const speed = item.speed ?? 1;
                const offset = item.offset ?? 0;
                source.playbackRate.value = speed;

                // Schedule clip to start at its timeline position
                const startTime = item.start;
                const clipDuration = Math.min(item.duration / speed, buffer.duration - offset);

                // Start playback
                source.start(startTime, offset, clipDuration);

                const emoji = item.type === 'video' ? '🎬' : '🎵';
                console.log(`   ${emoji} Scheduled: ${item.name} at ${startTime.toFixed(2)}s (duration: ${clipDuration.toFixed(2)}s, volume: ${(item.volume ?? 100)}%)`);
            }

            // Get the audio stream track
            const audioTracks = destination.stream.getAudioTracks();

            if (audioTracks.length > 0) {
                console.log(`%c✅ Audio setup complete! ${audioTracks.length} track(s) ready`, 'color: #00ff00');
                return audioTracks;
            } else {
                console.warn('%c⚠️ No audio tracks in destination stream', 'color: #ff6600');
                return [];
            }

        } catch (error) {
            console.error('[ExportEngine] Audio setup failed:', error);
            return [];
        }
    }

    /**
     * Load audio file as AudioBuffer
     */
    private async loadAudioBuffer(audioContext: AudioContext, src: string): Promise<AudioBuffer | null> {
        try {
            const response = await fetch(src);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            return audioBuffer;
        } catch (error) {
            console.error(`Failed to load audio: ${src}`, error);
            return null;
        }
    }

    /**
     * Get appropriate MIME type for MediaRecorder
     */
    private getMimeType(settings: ExportSettings): string {
        const { format, encoder } = settings;

        if (format === 'mp4') {
            if (MediaRecorder.isTypeSupported('video/mp4;codecs=h264')) {
                return 'video/mp4;codecs=h264';
            }
        } else if (format === 'webm') {
            if (encoder === 'vp9' && MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
                return 'video/webm;codecs=vp9';
            }
            if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
                return 'video/webm;codecs=vp8';
            }
        }

        // Fallback
        return 'video/webm';
    }

    /**
     * Get bitrate based on quality and resolution
     */
    private getBitrate(settings: ExportSettings): number {
        const config = BITRATE_CONFIGS[settings.resolution.label];
        if (!config) return 10000; // Default 10 Mbps

        return config[settings.quality];
    }

    /**
     * Cancel ongoing export
     */
    cancel(): void {
        this.cancelled = true;
    }

    /**
     * Clear media caches to free memory
     */
    private clearCaches(): void {
        console.log('%c🧹 Clearing media caches...', 'color: #ffaa00');
        const videoCount = this.videoCache.size;
        for (const [key, video] of this.videoCache.entries()) {
            video.pause();
            video.src = '';
            video.load();
        }
        this.videoCache.clear();
        this.imageCache.clear();
        console.log(`   ✓ Cleared ${videoCount} videos`);
    }

    /**
     * Get memory usage
     */
    private getMemoryInfo(): { used: number; limit?: number; percentage?: number } {
        const memory = (performance as any).memory;
        if (memory) {
            const usedMB = memory.usedJSHeapSize / (1024 * 1024);
            const limitMB = memory.jsHeapSizeLimit / (1024 * 1024);
            return {
                used: usedMB,
                limit: limitMB,
                percentage: (usedMB / limitMB) * 100
            };
        }
        return { used: 0 };
    }




    /**
     * Cleanup resources
     */
    private cleanup(): void {
        // Clean up video elements
        for (const video of this.videoCache.values()) {
            video.pause();
            video.src = '';
            video.load();
        }
        this.videoCache.clear();
        this.imageCache.clear();

        this.canvas = null;
        this.ctx = null;
    }
}

export const exportEngine = new ExportEngine();
