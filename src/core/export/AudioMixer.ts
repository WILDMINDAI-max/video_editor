/**
 * AudioMixer - Web Audio API based audio mixing for client-side export
 * Handles mixing external audio tracks and video internal audio
 */

import type { Track, TimelineItem } from '@/types';

export interface AudioClip {
    source: string;       // URL or blob URL
    startTime: number;    // When to start playing in timeline (seconds)
    offset: number;       // Offset within the source audio (seconds)
    duration: number;     // How long to play (seconds)
    volume: number;       // 0-100
    type: 'audio' | 'video';
}

export interface MixedAudioResult {
    audioBuffer: AudioBuffer;
    sampleRate: number;
    numberOfChannels: number;
}

export class AudioMixer {
    private audioContext: AudioContext | null = null;

    /**
     * Extract all audio clips from tracks
     */
    getAudioClips(tracks: Track[]): AudioClip[] {
        const clips: AudioClip[] = [];

        for (const track of tracks) {
            // External audio tracks
            if (track.type === 'audio') {
                for (const item of track.items) {
                    if (item.type === 'audio' && item.src) {
                        clips.push({
                            source: item.src,
                            startTime: item.start,
                            offset: item.offset || 0,
                            duration: item.duration,
                            volume: item.volume ?? 100,
                            type: 'audio'
                        });
                    }
                }
            }

            // Video tracks - extract audio from videos (if not muted)
            if (track.type === 'video' || track.id === 'main-video') {
                for (const item of track.items) {
                    if (item.type === 'video' && item.src && !item.muteVideo) {
                        clips.push({
                            source: item.src,
                            startTime: item.start,
                            offset: item.offset || 0,
                            duration: item.duration,
                            volume: item.volume ?? 100,
                            type: 'video'
                        });
                    }
                }
            }
        }

        return clips;
    }

    /**
     * Load audio from a URL into an AudioBuffer
     */
    private async loadAudio(url: string, targetSampleRate: number): Promise<AudioBuffer | null> {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();

            // Create a context with target sample rate for proper resampling
            const tempContext = new OfflineAudioContext(2, 1, targetSampleRate);
            const decoded = await tempContext.decodeAudioData(arrayBuffer);

            return decoded;
        } catch (error) {
            console.warn(`[AudioMixer] Failed to load audio from: ${url}`, error);
            return null;
        }
    }

    /**
     * Extract audio from a video file using AudioContext decoding
     * Most browsers can decode audio from video containers (mp4, webm)
     */
    private async extractVideoAudio(videoUrl: string, targetSampleRate: number): Promise<AudioBuffer | null> {
        try {
            // Fetch the video file
            const response = await fetch(videoUrl);
            const arrayBuffer = await response.arrayBuffer();

            // Create a context with target sample rate for proper resampling
            const tempContext = new OfflineAudioContext(2, 1, targetSampleRate);

            // Try to decode audio from video file
            // This works for most video formats that contain audio
            const decoded = await tempContext.decodeAudioData(arrayBuffer);
            console.log(`[AudioMixer] Extracted video audio: ${decoded.duration.toFixed(2)}s, ${decoded.numberOfChannels}ch, ${decoded.sampleRate}Hz`);

            return decoded;
        } catch (error) {
            console.warn(`[AudioMixer] Failed to extract audio from video: ${videoUrl}`, error);
            return null;
        }
    }

    /**
     * Resample an AudioBuffer to match target sample rate if different
     */
    private async resampleBuffer(buffer: AudioBuffer, targetSampleRate: number): Promise<AudioBuffer> {
        if (buffer.sampleRate === targetSampleRate) {
            return buffer;
        }

        // Calculate new length based on sample rate ratio
        const ratio = targetSampleRate / buffer.sampleRate;
        const newLength = Math.ceil(buffer.length * ratio);

        // Create offline context for resampling
        const offlineCtx = new OfflineAudioContext(
            buffer.numberOfChannels,
            newLength,
            targetSampleRate
        );

        // Create buffer source with original audio
        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(offlineCtx.destination);
        source.start(0);

        // Render resampled audio
        const resampled = await offlineCtx.startRendering();
        console.log(`[AudioMixer] Resampled: ${buffer.sampleRate}Hz -> ${targetSampleRate}Hz`);

        return resampled;
    }

    /**
     * Mix all audio clips into a single AudioBuffer
     */
    async mixAudio(clips: AudioClip[], totalDuration: number, sampleRate: number = 48000): Promise<MixedAudioResult | null> {
        if (clips.length === 0) {
            console.log('[AudioMixer] No audio clips to mix');
            return null;
        }

        console.log(`[AudioMixer] Mixing ${clips.length} audio clips at ${sampleRate}Hz...`);

        // Create offline context for rendering
        const numberOfChannels = 2; // Stereo
        const length = Math.ceil(totalDuration * sampleRate);
        const offlineContext = new OfflineAudioContext(numberOfChannels, length, sampleRate);

        // Load and schedule all clips
        for (const clip of clips) {
            try {
                // Load audio with target sample rate
                let audioBuffer = clip.type === 'video'
                    ? await this.extractVideoAudio(clip.source, sampleRate)
                    : await this.loadAudio(clip.source, sampleRate);

                if (!audioBuffer) {
                    console.warn(`[AudioMixer] Skipping clip - could not load: ${clip.source}`);
                    continue;
                }

                // Resample if needed (shouldn't be needed now, but as safety)
                if (audioBuffer.sampleRate !== sampleRate) {
                    audioBuffer = await this.resampleBuffer(audioBuffer, sampleRate);
                }

                // Create buffer source
                const sourceNode = offlineContext.createBufferSource();
                sourceNode.buffer = audioBuffer;

                // Create gain node for volume
                const gainNode = offlineContext.createGain();
                gainNode.gain.value = clip.volume / 100;

                // Connect nodes
                sourceNode.connect(gainNode);
                gainNode.connect(offlineContext.destination);

                // Calculate timing
                const startTime = Math.max(0, clip.startTime);
                const offset = Math.min(clip.offset, audioBuffer.duration);
                const maxDuration = audioBuffer.duration - offset;
                const duration = Math.min(clip.duration, maxDuration);

                // Schedule playback
                if (startTime < totalDuration && duration > 0 && offset >= 0) {
                    sourceNode.start(startTime, offset, duration);
                    console.log(`[AudioMixer] Scheduled: type=${clip.type}, start=${startTime.toFixed(2)}s, offset=${offset.toFixed(2)}s, dur=${duration.toFixed(2)}s, vol=${clip.volume}%`);
                }
            } catch (error) {
                console.warn(`[AudioMixer] Error processing clip:`, error);
            }
        }

        // Render mixed audio
        try {
            const mixedBuffer = await offlineContext.startRendering();
            console.log(`[AudioMixer] Mixed audio: ${mixedBuffer.duration.toFixed(2)}s, ${mixedBuffer.numberOfChannels} channels, ${sampleRate}Hz`);

            return {
                audioBuffer: mixedBuffer,
                sampleRate,
                numberOfChannels
            };
        } catch (error) {
            console.error('[AudioMixer] Failed to render mixed audio:', error);
            return null;
        }
    }

    /**
     * Convert AudioBuffer to Float32Array for audio encoding
     * Returns interleaved stereo samples
     */
    audioBufferToFloat32Array(buffer: AudioBuffer): Float32Array {
        const numberOfChannels = buffer.numberOfChannels;
        const length = buffer.length;
        const output = new Float32Array(length * numberOfChannels);

        for (let i = 0; i < length; i++) {
            for (let channel = 0; channel < numberOfChannels; channel++) {
                const channelData = buffer.getChannelData(channel);
                output[i * numberOfChannels + channel] = channelData[i];
            }
        }

        return output;
    }

    /**
     * Convert AudioBuffer to Int16 PCM for AAC encoding
     */
    audioBufferToInt16(buffer: AudioBuffer): Int16Array {
        const numberOfChannels = buffer.numberOfChannels;
        const length = buffer.length;
        const output = new Int16Array(length * numberOfChannels);

        for (let i = 0; i < length; i++) {
            for (let channel = 0; channel < numberOfChannels; channel++) {
                const sample = buffer.getChannelData(channel)[i];
                // Clamp and convert to 16-bit signed integer
                const clamped = Math.max(-1, Math.min(1, sample));
                output[i * numberOfChannels + channel] = clamped < 0
                    ? clamped * 0x8000
                    : clamped * 0x7FFF;
            }
        }

        return output;
    }

    /**
     * Cleanup resources
     */
    dispose(): void {
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }
}

// Singleton instance
export const audioMixer = new AudioMixer();
