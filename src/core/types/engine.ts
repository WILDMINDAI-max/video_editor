// ============================================
// Engine Types for VideoEditorPluginModal
// Adapted from editor_vd for GPU-accelerated playback
// ============================================

// ============================================
// GPU & Hardware Types
// ============================================

export type GPUVendor = 'nvidia' | 'amd' | 'intel' | 'apple' | 'unknown';

export interface GPUCapabilities {
    vendor: GPUVendor;
    name: string;
    vram: number; // in bytes
    supportsHardwareDecode: boolean;
    supportsHardwareEncode: boolean;
    supportedDecoders: string[];
    supportedEncoders: string[];
    supportsWebGPU: boolean;
    supportsWebGL2: boolean;
    maxTextureSize: number;
}

export interface HardwareAccelConfig {
    decodeAccel: string;
    encodeAccel: string;
    gpuCompositing: boolean;
    preferHardware: boolean;
}

// ============================================
// Compositor Types
// ============================================

export interface Transform {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    opacity: number;
    anchorX: number;
    anchorY: number;
}

export const DEFAULT_TRANSFORM: Transform = {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    anchorX: 0.5,
    anchorY: 0.5,
};

export type BlendMode =
    | 'normal'
    | 'multiply'
    | 'screen'
    | 'overlay'
    | 'darken'
    | 'lighten';

export interface CompositorLayer {
    id: string;
    clipId: string;
    texture: WebGLTexture | null;
    source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | null;
    transform: Transform;
    blendMode: BlendMode;
    opacity: number;
    visible: boolean;
    zIndex: number;
    // Filter effects
    filter?: string;
    // Transition state
    transitionType?: string;
    transitionProgress?: number;
    isOutgoing?: boolean;
}

export interface CompositorFrame {
    timestamp: number;
    width: number;
    height: number;
    layers: CompositorLayer[];
}

// ============================================
// Playback Types
// ============================================

export interface PlaybackState {
    currentTime: number;
    isPlaying: boolean;
    playbackRate: number;
    duration: number;
    isSeeking: boolean;
}

export interface MediaElementState {
    id: string;
    element: HTMLVideoElement | HTMLAudioElement;
    startTime: number; // Position on timeline
    duration: number; // Duration on timeline
    offset: number; // Offset into source media
    speed: number;
    volume: number;
    muted: boolean;
}

// ============================================
// Cache Types
// ============================================

export interface FrameCacheEntry {
    timestamp: number;
    canvas: HTMLCanvasElement;
    lastAccessed: number;
    size: number; // bytes (width * height * 4)
}

export interface CacheStats {
    totalEntries: number;
    totalSize: number;
    maxSize: number;
    hitRate: number;
}

// ============================================
// Transition Types (GPU)
// ============================================

export type GPUTransitionType =
    | 'crossfade'
    | 'dip-to-black'
    | 'dip-to-white'
    | 'wipe-left'
    | 'wipe-right'
    | 'wipe-up'
    | 'wipe-down'
    | 'slide-left'
    | 'slide-right'
    | 'push-left'
    | 'push-right'
    | 'zoom-in'
    | 'zoom-out';

export interface GPUTransitionParams {
    type: GPUTransitionType;
    progress: number;
    direction?: 'left' | 'right' | 'up' | 'down';
}
