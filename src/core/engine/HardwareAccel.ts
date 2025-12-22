// ============================================
// Hardware Acceleration Detection & Configuration
// Adapted from editor_vd for VideoEditorPluginModal
// ============================================

import type { GPUCapabilities, GPUVendor, HardwareAccelConfig } from '../types/engine';

/**
 * Detects GPU capabilities and available hardware acceleration
 */
export class HardwareAccel {
    private static instance: HardwareAccel;
    private capabilities: GPUCapabilities | null = null;
    private config: HardwareAccelConfig;
    private initialized: boolean = false;

    private constructor() {
        this.config = {
            decodeAccel: 'none',
            encodeAccel: 'none',
            gpuCompositing: true,
            preferHardware: true,
        };
    }

    static getInstance(): HardwareAccel {
        if (!HardwareAccel.instance) {
            HardwareAccel.instance = new HardwareAccel();
        }
        return HardwareAccel.instance;
    }

    /**
     * Initialize and detect hardware capabilities
     */
    async initialize(): Promise<GPUCapabilities> {
        if (this.initialized && this.capabilities) {
            return this.capabilities;
        }

        const capabilities = await this.detectGPU();
        this.capabilities = capabilities;
        this.config = this.determineOptimalConfig(capabilities);
        this.initialized = true;

        // Enhanced logging to clearly show dedicated GPU detection
        const isDedicatedGPU = capabilities.vendor === 'nvidia' || capabilities.vendor === 'amd';
        const gpuType = isDedicatedGPU ? '🎮 DEDICATED GPU' : '💻 INTEGRATED GPU';

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`%c${gpuType} DETECTED`, 'font-weight: bold; font-size: 14px; color: ' + (isDedicatedGPU ? '#00ff00' : '#ffaa00'));
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`%c🎯 GPU Name: ${capabilities.name}`, 'font-weight: bold');
        console.log(`%c⚡ Vendor: ${capabilities.vendor.toUpperCase()}`, 'color: #00aaff');
        console.log(`%c💾 VRAM: ${(capabilities.vram / (1024 * 1024 * 1024)).toFixed(1)} GB`, 'color: #ff00ff');
        console.log(`%c🌐 WebGPU: ${capabilities.supportsWebGPU ? '✅ Supported' : '❌ Not Available'}`, capabilities.supportsWebGPU ? 'color: #00ff00' : 'color: #ff0000');
        console.log(`%c🎨 WebGL2: ${capabilities.supportsWebGL2 ? '✅ Supported' : '❌ Not Available'}`, capabilities.supportsWebGL2 ? 'color: #00ff00' : 'color: #ff0000');
        console.log(`%c📐 Max Texture: ${capabilities.maxTextureSize}px`, 'color: #ffaa00');
        console.log(`%c🎬 8K Support: ${this.canHandle8K() ? '✅ YES' : '❌ NO'}`, this.canHandle8K() ? 'color: #00ff00' : 'color: #ff0000');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        return capabilities;
    }

    /**
     * Detect GPU and its capabilities
     */
    private async detectGPU(): Promise<GPUCapabilities> {
        // Try WebGPU first
        const webgpuSupport = await this.checkWebGPUSupport();

        // Fallback to WebGL2 for GPU info
        const webglInfo = this.getWebGLInfo();

        const vendor = this.detectVendor(webglInfo.renderer);

        return {
            vendor,
            name: webglInfo.renderer,
            vram: this.estimateVRAM(vendor),
            supportsHardwareDecode: this.checkHardwareDecodeSupport(vendor),
            supportsHardwareEncode: this.checkHardwareEncodeSupport(vendor),
            supportedDecoders: this.getSupportedDecoders(vendor),
            supportedEncoders: this.getSupportedEncoders(vendor),
            supportsWebGPU: webgpuSupport,
            supportsWebGL2: !!webglInfo.gl,
            maxTextureSize: webglInfo.maxTextureSize,
        };
    }

    /**
     * Check WebGPU support
     */
    private async checkWebGPUSupport(): Promise<boolean> {
        if (!('gpu' in navigator)) {
            return false;
        }

        try {
            // Use any to handle WebGPU types that may not be available in all TS environments
            const gpu = (navigator as any).gpu;
            const adapter = await gpu.requestAdapter({
                powerPreference: 'high-performance',
            });
            return adapter !== null;
        } catch {
            return false;
        }
    }

    /**
     * Get WebGL2 info for GPU detection
     */
    private getWebGLInfo(): { gl: WebGL2RenderingContext | null; renderer: string; maxTextureSize: number } {
        const canvas = document.createElement('canvas');

        const gl = canvas.getContext('webgl2', {
            powerPreference: 'high-performance',
            failIfMajorPerformanceCaveat: false,
        });

        if (!gl) {
            return { gl: null, renderer: 'Unknown', maxTextureSize: 4096 };
        }

        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = debugInfo
            ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
            : 'Unknown GPU';

        const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);

        return { gl, renderer, maxTextureSize };
    }

    /**
     * Detect GPU vendor from renderer string
     */
    private detectVendor(renderer: string): GPUVendor {
        const lowerRenderer = renderer.toLowerCase();

        if (lowerRenderer.includes('nvidia') || lowerRenderer.includes('geforce') || lowerRenderer.includes('rtx') || lowerRenderer.includes('gtx')) {
            return 'nvidia';
        }
        if (lowerRenderer.includes('amd') || lowerRenderer.includes('radeon') || lowerRenderer.includes('rx ')) {
            return 'amd';
        }
        if (lowerRenderer.includes('intel') || lowerRenderer.includes('uhd') || lowerRenderer.includes('iris')) {
            return 'intel';
        }
        if (lowerRenderer.includes('apple') || lowerRenderer.includes('m1') || lowerRenderer.includes('m2') || lowerRenderer.includes('m3')) {
            return 'apple';
        }

        return 'unknown';
    }

    /**
     * Estimate VRAM based on vendor
     */
    private estimateVRAM(vendor: GPUVendor): number {
        switch (vendor) {
            case 'nvidia':
                return 8 * 1024 * 1024 * 1024; // 8GB
            case 'amd':
                return 8 * 1024 * 1024 * 1024; // 8GB
            case 'intel':
                return 2 * 1024 * 1024 * 1024; // 2GB (shared memory)
            case 'apple':
                return 16 * 1024 * 1024 * 1024; // 16GB (unified memory)
            default:
                return 4 * 1024 * 1024 * 1024; // 4GB default
        }
    }

    /**
     * Check if hardware decode is supported
     */
    private checkHardwareDecodeSupport(vendor: GPUVendor): boolean {
        return vendor !== 'unknown';
    }

    /**
     * Check if hardware encode is supported
     */
    private checkHardwareEncodeSupport(vendor: GPUVendor): boolean {
        return vendor !== 'unknown';
    }

    /**
     * Get list of supported hardware decoders
     */
    private getSupportedDecoders(vendor: GPUVendor): string[] {
        const common = ['h264'];

        switch (vendor) {
            case 'nvidia':
                return [...common, 'hevc', 'av1', 'vp9', 'vp8'];
            case 'amd':
                return [...common, 'hevc', 'av1', 'vp9'];
            case 'intel':
                return [...common, 'hevc', 'av1', 'vp9'];
            case 'apple':
                return [...common, 'hevc', 'prores'];
            default:
                return common;
        }
    }

    /**
     * Get list of supported hardware encoders
     */
    private getSupportedEncoders(vendor: GPUVendor): string[] {
        switch (vendor) {
            case 'nvidia':
                return ['h264_nvenc', 'hevc_nvenc', 'av1_nvenc'];
            case 'amd':
                return ['h264_amf', 'hevc_amf', 'av1_amf'];
            case 'intel':
                return ['h264_qsv', 'hevc_qsv', 'av1_qsv'];
            case 'apple':
                return ['h264_videotoolbox', 'hevc_videotoolbox'];
            default:
                return [];
        }
    }

    /**
     * Determine optimal hardware acceleration config
     */
    private determineOptimalConfig(capabilities: GPUCapabilities): HardwareAccelConfig {
        return {
            decodeAccel: capabilities.supportsHardwareDecode ? 'auto' : 'none',
            encodeAccel: capabilities.supportsHardwareEncode ? 'auto' : 'none',
            gpuCompositing: capabilities.supportsWebGPU || capabilities.supportsWebGL2,
            preferHardware: true,
        };
    }

    /**
     * Get current capabilities
     */
    getCapabilities(): GPUCapabilities | null {
        return this.capabilities;
    }

    /**
     * Get current config
     */
    getConfig(): HardwareAccelConfig {
        return this.config;
    }

    /**
     * Check if WebGPU is available
     */
    canUseWebGPU(): boolean {
        return this.capabilities?.supportsWebGPU ?? false;
    }

    /**
     * Check if WebGL2 is available
     */
    canUseWebGL2(): boolean {
        return this.capabilities?.supportsWebGL2 ?? false;
    }

    /**
     * Check if system can handle 8K content
     */
    canHandle8K(): boolean {
        if (!this.capabilities) return false;

        const minVRAM = 8 * 1024 * 1024 * 1024;
        return (
            this.capabilities.vram >= minVRAM &&
            this.capabilities.supportsHardwareDecode &&
            this.capabilities.maxTextureSize >= 8192
        );
    }

    /**
     * Get recommended proxy resolution based on hardware
     */
    getRecommendedProxyResolution(): '720p' | '1080p' | '2k' | '4k' {
        if (!this.capabilities) return '720p';

        const vramGB = this.capabilities.vram / (1024 * 1024 * 1024);

        if (vramGB >= 24) return '4k';
        if (vramGB >= 12) return '2k';
        if (vramGB >= 6) return '1080p';
        return '720p';
    }

    /**
     * Check if GPU compositing is available
     */
    canUseGPUCompositing(): boolean {
        return this.config.gpuCompositing;
    }
}

export const hardwareAccel = HardwareAccel.getInstance();
