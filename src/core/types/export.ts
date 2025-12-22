// ============================================
// Export Types & Interfaces
// ============================================

export interface ExportSettings {
    format: 'mp4' | 'webm' | 'mov' | 'mkv' | 'avi';
    resolution: {
        width: number;
        height: number;
        label: string;
    };
    quality: 'low' | 'medium' | 'high';
    fps: number;
    encoder: 'auto' | 'h264' | 'h265' | 'vp8' | 'vp9' | 'prores' | 'mpeg4';
    useGPU: boolean;
    projectName: string;
}

export interface ExportProgress {
    phase: 'preparing' | 'rendering' | 'encoding' | 'finalizing' | 'complete' | 'error';
    progress: number; // 0-100
    currentFrame?: number;
    totalFrames?: number;
    estimatedTimeRemaining?: number; // seconds
    error?: string;
}

export interface DeviceCapabilities {
    recommendedFormats: string[];
    recommendedResolutions: string[];
    recommendedEncoders: string[];
    maxResolution: { width: number; height: number; label: string };
    hardwareEncodingAvailable: boolean;
    isDedicatedGPU: boolean;
    gpuVendor: 'nvidia' | 'amd' | 'intel' | 'apple' | 'unknown';
    vramGB: number;
}

export interface BitrateConfig {
    low: number;    // kbps
    medium: number; // kbps
    high: number;   // kbps
}

export const RESOLUTION_PRESETS = [
    { width: 640, height: 360, label: '360p' },
    { width: 854, height: 480, label: '480p' },
    { width: 1280, height: 720, label: '720p' },
    { width: 1920, height: 1080, label: '1080p' },
    { width: 2560, height: 1440, label: '1440p' },
    { width: 3840, height: 2160, label: '4K' },
] as const;

// Bitrate configurations for different resolutions (kbps)
export const BITRATE_CONFIGS: Record<string, BitrateConfig> = {
    '360p': { low: 1000, medium: 1500, high: 2500 },
    '480p': { low: 2000, medium: 3000, high: 4500 },
    '720p': { low: 4000, medium: 6000, high: 8000 },
    '1080p': { low: 8000, medium: 12000, high: 16000 },
    '1440p': { low: 12000, medium: 18000, high: 24000 },
    '4K': { low: 25000, medium: 35000, high: 50000 },
};

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
    format: 'mp4',
    resolution: RESOLUTION_PRESETS[3], // 1080p
    quality: 'high',
    fps: 30,
    encoder: 'auto',
    useGPU: false, // Disabled - WebGL2 not available in offscreen canvas
    projectName: 'Untitled Video',
};
