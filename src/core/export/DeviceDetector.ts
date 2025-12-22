// ============================================
// Device Capability Detection
// Detects system specs and provides export recommendations
// Prioritizes dedicated GPU (NVIDIA, AMD) over integrated GPU
// ============================================

import { hardwareAccel } from '../engine/HardwareAccel';
import type { DeviceCapabilities } from '../types/export';
import { RESOLUTION_PRESETS } from '../types/export';

export class DeviceDetector {
    private static instance: DeviceDetector;

    private constructor() { }

    static getInstance(): DeviceDetector {
        if (!DeviceDetector.instance) {
            DeviceDetector.instance = new DeviceDetector();
        }
        return DeviceDetector.instance;
    }

    /**
     * Analyze device capabilities for export recommendations
     * PRIORITIZES DEDICATED GPU: NVIDIA and AMD GPUs get highest priority
     */
    async getDeviceCapabilities(): Promise<DeviceCapabilities> {
        // Ensure hardware detection is initialized
        await hardwareAccel.initialize();

        const capabilities = hardwareAccel.getCapabilities();
        if (!capabilities) {
            // Fallback for unknown hardware
            return this.getDefaultCapabilities();
        }

        const { vendor, vram, supportsHardwareEncode } = capabilities;
        const vramGB = vram / (1024 * 1024 * 1024);

        // **DEDICATED GPU DETECTION**
        // NVIDIA and AMD are dedicated GPUs (highest priority)
        // Intel and Apple are typically integrated (lower priority)
        const isDedicatedGPU = vendor === 'nvidia' || vendor === 'amd';

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`%c🎬 EXPORT DEVICE DETECTION`, 'font-weight: bold; font-size: 14px; color: #00ff00');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`%c${isDedicatedGPU ? '🎮 DEDICATED GPU DETECTED' : '💻 INTEGRATED GPU DETECTED'}`, `font-weight: bold; color: ${isDedicatedGPU ? '#00ff00' : '#ffaa00'}`);
        console.log(`%c🎯 Vendor: ${vendor.toUpperCase()}`, 'font-weight: bold');
        console.log(`%c💾 VRAM: ${vramGB.toFixed(1)} GB`, 'color: #ff00ff');
        console.log(`%c⚡ Hardware Encoding: ${supportsHardwareEncode ? '✅ Available' : '❌ Not Available'}`, supportsHardwareEncode ? 'color: #00ff00' : 'color: #ff0000');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // Determine max recommended resolution based on GPU type and VRAM
        let maxResolution: { width: number; height: number; label: string } = { ...RESOLUTION_PRESETS[3] }; // Default: 1080p

        if (isDedicatedGPU) {
            // Dedicated GPU (NVIDIA/AMD)
            if (vramGB >= 8) {
                maxResolution = { ...RESOLUTION_PRESETS[5] }; // 4K
                console.log('%c✨ Recommended: 4K export enabled (Dedicated GPU with 8GB+ VRAM)', 'color: #00ff00');
            } else if (vramGB >= 6) {
                maxResolution = { ...RESOLUTION_PRESETS[4] }; // 1440p
                console.log('%c✨ Recommended: 1440p export (Dedicated GPU with 6GB+ VRAM)', 'color: #00ff00');
            } else {
                maxResolution = { ...RESOLUTION_PRESETS[3] }; // 1080p
                console.log('%c✨ Recommended: 1080p export (Dedicated GPU with lower VRAM)', 'color: #ffaa00');
            }
        } else {
            // Integrated GPU (Intel/Apple)
            if (vramGB >= 4 || vendor === 'apple') {
                maxResolution = { ...RESOLUTION_PRESETS[3] }; // 1080p
                console.log('%c✨ Recommended: 1080p export (Integrated GPU)', 'color: #ffaa00');
            } else {
                maxResolution = { ...RESOLUTION_PRESETS[2] }; // 720p
                console.log('%c⚠️ Recommended: 720p export (Low VRAM integrated GPU)', 'color: #ff6600');
            }
        }

        // Determine recommended resolutions (all resolutions up to max)
        const maxIndex = RESOLUTION_PRESETS.findIndex(r => r.label === maxResolution.label);
        const recommendedResolutions = RESOLUTION_PRESETS
            .slice(0, maxIndex + 1)
            .map(r => r.label);

        // Check MediaRecorder codec support (for client-side)
        // Note: Server-side FFmpeg supports all formats regardless of browser support
        const recommendedFormats: string[] = [];
        const recommendedEncoders: string[] = [];

        // MP4 is the most compatible format - always recommend first
        recommendedFormats.push('mp4');
        recommendedEncoders.push('h264');

        // Check WebM VP9 (best quality for web)
        if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
            recommendedFormats.push('webm');
            recommendedEncoders.push('vp9');
        } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
            recommendedFormats.push('webm');
            recommendedEncoders.push('vp8');
        }

        // MOV, MKV, AVI are always available via server-side FFmpeg
        // These are recommended for specific use cases
        recommendedFormats.push('mov', 'mkv', 'avi');
        recommendedEncoders.push('mpeg4'); // For AVI

        // Hardware encoding recommendation
        // Dedicated GPUs (NVIDIA, AMD) are MORE LIKELY to have hardware encoding
        const hardwareEncodingAvailable = isDedicatedGPU && supportsHardwareEncode;

        console.log(`%c📊 Supported Formats: ${recommendedFormats.join(', ')}`, 'color: #00aaff');
        console.log(`%c📊 Supported Encoders: ${recommendedEncoders.join(', ')}`, 'color: #00aaff');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        return {
            recommendedFormats,
            recommendedResolutions,
            recommendedEncoders,
            maxResolution,
            hardwareEncodingAvailable,
            isDedicatedGPU,
            gpuVendor: vendor,
            vramGB,
        };
    }

    /**
     * Fallback capabilities for unknown hardware
     */
    private getDefaultCapabilities(): DeviceCapabilities {
        console.warn('[DeviceDetector] Using default capabilities (hardware detection failed)');
        return {
            recommendedFormats: ['mp4', 'webm', 'mov', 'mkv', 'avi'],
            recommendedResolutions: ['360p', '480p', '720p'],
            recommendedEncoders: ['h264', 'vp8', 'mpeg4'],
            maxResolution: RESOLUTION_PRESETS[2], // 720p safe default
            hardwareEncodingAvailable: false,
            isDedicatedGPU: false,
            gpuVendor: 'unknown',
            vramGB: 2,
        };
    }

    /**
     * Check if a specific resolution is recommended for current device
     */
    isResolutionRecommended(resolutionLabel: string, capabilities: DeviceCapabilities): boolean {
        return capabilities.recommendedResolutions.includes(resolutionLabel);
    }

    /**
     * Check if a specific format is recommended for current device
     */
    isFormatRecommended(format: string, capabilities: DeviceCapabilities): boolean {
        return capabilities.recommendedFormats.includes(format);
    }

    /**
     * Check if a specific encoder is recommended for current device
     */
    isEncoderRecommended(encoder: string, capabilities: DeviceCapabilities): boolean {
        return capabilities.recommendedEncoders.includes(encoder);
    }
}

export const deviceDetector = DeviceDetector.getInstance();
