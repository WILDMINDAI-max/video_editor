// ============================================
// GPU Compositor - WebGL2 Accelerated Rendering
// Adapted from editor_vd for VideoEditorPluginModal
// ============================================

import type {
    CompositorFrame,
    CompositorLayer,
    Transform,
    GPUTransitionParams,
} from '../types/engine';
import { hardwareAccel } from '../engine/HardwareAccel';

/**
 * GPU-accelerated compositor for multi-layer video compositing
 */
export class GPUCompositor {
    private static instance: GPUCompositor;
    private canvas: HTMLCanvasElement | null = null;
    private gl: WebGL2RenderingContext | null = null;
    private isInitialized: boolean = false;
    private programs: Map<string, WebGLProgram> = new Map();
    private textures: Map<string, WebGLTexture> = new Map();
    private vao: WebGLVertexArrayObject | null = null;
    private vertexBuffer: WebGLBuffer | null = null;
    private width: number = 1920;
    private height: number = 1080;

    private constructor() { }

    static getInstance(): GPUCompositor {
        if (!GPUCompositor.instance) {
            GPUCompositor.instance = new GPUCompositor();
        }
        return GPUCompositor.instance;
    }

    /**
     * Initialize compositor with canvas
     */
    async initialize(canvas: HTMLCanvasElement): Promise<boolean> {
        // If already initialized with the SAME canvas, just return true
        if (this.isInitialized && this.canvas === canvas) {
            return true;
        }

        // If canvas changed (e.g., after dimension change remount), reinitialize
        if (this.canvas !== canvas && this.isInitialized) {
            console.log('[GPUCompositor] Canvas element changed, reinitializing...');
            // Clean up old context
            this.dispose();
        }

        this.canvas = canvas;

        // Ensure hardware accel is initialized
        await hardwareAccel.initialize();

        if (!hardwareAccel.canUseWebGL2()) {
            console.warn('[GPUCompositor] WebGL2 not available (hardware check), falling back to 2D canvas');
            return false;
        }

        try {
            this.initWebGL2();
            if (!this.gl) {
                console.warn('[GPUCompositor] WebGL2 context is null after init, falling back to 2D canvas');
                return false;
            }
            this.isInitialized = true;
            console.log('[GPUCompositor] Initialized with WebGL2');
            return true;
        } catch (error) {
            console.warn('[GPUCompositor] Initialization failed, falling back to 2D canvas:', error);
            this.isInitialized = false;
            this.gl = null;
            return false;
        }
    }

    /**
     * Initialize WebGL2
     */
    private initWebGL2(): void {
        const gl = this.canvas!.getContext('webgl2', {
            alpha: true,
            antialias: false,
            depth: false,
            stencil: false,
            premultipliedAlpha: true,
            preserveDrawingBuffer: false,
            powerPreference: 'high-performance',
        });

        if (!gl) {
            throw new Error('WebGL2 not supported');
        }

        this.gl = gl;

        // Enable required extensions
        gl.getExtension('EXT_color_buffer_float');
        gl.getExtension('OES_texture_float_linear');

        // Initialize shaders
        this.initShaders();

        // Initialize vertex buffer for fullscreen quad
        this.initVertexBuffer();
    }

    /**
     * Initialize vertex buffer
     */
    private initVertexBuffer(): void {
        if (!this.gl) return;

        const gl = this.gl;

        // Create VAO
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        // Create vertex buffer (position + texCoord)
        const vertices = new Float32Array([
            -1, -1, 0, 1,  // bottom-left
            1, -1, 1, 1,  // bottom-right
            -1, 1, 0, 0,  // top-left
            1, 1, 1, 0,  // top-right
        ]);

        this.vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        // Setup vertex attributes
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);

        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

        gl.bindVertexArray(null);
    }

    /**
     * Initialize WebGL2 shaders
     */
    private initShaders(): void {
        if (!this.gl) return;

        // Basic compositing shader
        const compositeProgram = this.createProgram(
            this.gl,
            VERTEX_SHADER,
            FRAGMENT_SHADER_COMPOSITE
        );
        this.programs.set('composite', compositeProgram);

        // Transition shader
        const transitionProgram = this.createProgram(
            this.gl,
            VERTEX_SHADER,
            FRAGMENT_SHADER_TRANSITION
        );
        this.programs.set('transition', transitionProgram);
    }

    /**
     * Create WebGL program from shaders
     */
    private createProgram(
        gl: WebGL2RenderingContext,
        vertexSource: string,
        fragmentSource: string
    ): WebGLProgram {
        const vertexShader = this.compileShader(gl, gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = this.compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

        const program = gl.createProgram()!;
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error('Program link failed: ' + gl.getProgramInfoLog(program));
        }

        return program;
    }

    /**
     * Compile WebGL shader
     */
    private compileShader(
        gl: WebGL2RenderingContext,
        type: number,
        source: string
    ): WebGLShader {
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw new Error('Shader compile failed: ' + gl.getShaderInfoLog(shader));
        }

        return shader;
    }

    /**
     * Set output resolution
     */
    setResolution(width: number, height: number): void {
        this.width = width;
        this.height = height;

        if (this.canvas) {
            this.canvas.width = width;
            this.canvas.height = height;
        }

        // Update WebGL viewport to match new resolution
        if (this.gl) {
            this.gl.viewport(0, 0, width, height);
        }
    }

    /**
     * Clear the canvas (call at start of each frame)
     */
    clear(): void {
        if (!this.gl || !this.isInitialized) return;

        const gl = this.gl;
        gl.viewport(0, 0, this.width, this.height);
        gl.clearColor(0, 0, 0, 0); // Transparent
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    /**
     * Create or update texture from source
     */
    updateTexture(
        id: string,
        source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
    ): WebGLTexture | null {
        if (!this.gl) return null;

        const gl = this.gl;
        let texture = this.textures.get(id);

        if (!texture) {
            texture = gl.createTexture()!;
            this.textures.set(id, texture);
        }

        gl.bindTexture(gl.TEXTURE_2D, texture);

        try {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        } catch (e) {
            // Source not ready (video still loading)
            return null;
        }

        // Set texture parameters for high-quality scaling
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        return texture;
    }

    /**
     * Render a single layer with transform
     */
    renderLayer(
        source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
        transform: Transform,
        opacity: number = 1,
        filter?: string
    ): void {
        if (!this.gl || !this.isInitialized) return;

        const gl = this.gl;
        const program = this.programs.get('composite');
        if (!program) return;

        gl.useProgram(program);
        gl.bindVertexArray(this.vao);

        // Update texture
        const texture = this.updateTexture('layer_temp', source);
        if (!texture) return;

        // Set uniforms
        const transformMatrix = this.createTransformMatrix(transform);
        const matrixLocation = gl.getUniformLocation(program, 'u_transform');
        gl.uniformMatrix4fv(matrixLocation, false, transformMatrix);

        const opacityLocation = gl.getUniformLocation(program, 'u_opacity');
        gl.uniform1f(opacityLocation, opacity);

        // Bind texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        const textureLocation = gl.getUniformLocation(program, 'u_texture');
        gl.uniform1i(textureLocation, 0);

        // Draw
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        gl.bindVertexArray(null);
    }

    /**
     * Render full frame with all layers
     */
    renderFrame(frame: CompositorFrame): void {
        if (!this.gl || !this.isInitialized) return;

        const gl = this.gl;

        // Set viewport
        gl.viewport(0, 0, frame.width, frame.height);

        // Clear
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Enable blending
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // Render each layer (bottom to top)
        for (const layer of frame.layers) {
            if (!layer.visible || !layer.source) continue;

            // Handle transition rendering
            if (layer.transitionType && layer.transitionProgress !== undefined) {
                this.renderLayerWithTransition(layer);
            } else {
                this.renderLayer(layer.source, layer.transform, layer.opacity);
            }
        }
    }

    /**
     * Render layer with transition effect
     */
    private renderLayerWithTransition(layer: CompositorLayer): void {
        if (!layer.source) return;

        const progress = layer.transitionProgress || 0;
        const isOutgoing = layer.isOutgoing;

        // Calculate opacity/transform based on transition type
        let opacity = layer.opacity;
        const transform = { ...layer.transform };

        switch (layer.transitionType) {
            case 'dissolve':
            case 'crossfade':
                opacity = isOutgoing ? (1 - progress) : progress;
                break;

            case 'dip-to-black':
                if (isOutgoing) {
                    opacity = progress < 0.5 ? 1 - (progress * 2) : 0;
                } else {
                    opacity = progress > 0.5 ? (progress - 0.5) * 2 : 0;
                }
                break;

            case 'slide':
            case 'push':
                if (!isOutgoing) {
                    transform.x = this.width * (1 - progress);
                } else {
                    transform.x = -this.width * progress;
                }
                break;

            case 'wipe':
                // Wipe is handled via clip rect in shader
                opacity = isOutgoing ? 1 : 1;
                break;

            default:
                opacity = isOutgoing ? (1 - progress) : progress;
        }

        this.renderLayer(layer.source, transform, opacity * layer.opacity);
    }

    /**
     * Create transform matrix from Transform object
     */
    private createTransformMatrix(transform: Transform): Float32Array {
        const matrix = new Float32Array(16);

        // Identity matrix
        matrix[0] = 1; matrix[5] = 1; matrix[10] = 1; matrix[15] = 1;

        // Apply transforms
        const cos = Math.cos(transform.rotation * Math.PI / 180);
        const sin = Math.sin(transform.rotation * Math.PI / 180);

        // Scale
        matrix[0] = transform.scaleX * cos;
        matrix[1] = transform.scaleX * sin;
        matrix[4] = -transform.scaleY * sin;
        matrix[5] = transform.scaleY * cos;

        // Translate
        matrix[12] = transform.x / this.width * 2;
        matrix[13] = -transform.y / this.height * 2;

        return matrix;
    }

    /**
     * Delete texture
     */
    deleteTexture(id: string): void {
        const texture = this.textures.get(id);
        if (texture && this.gl) {
            this.gl.deleteTexture(texture);
            this.textures.delete(id);
        }
    }

    /**
     * Get the canvas element
     */
    getCanvas(): HTMLCanvasElement | null {
        return this.canvas;
    }

    /**
     * Check if initialized
     */
    isReady(): boolean {
        return this.isInitialized;
    }

    /**
     * Cleanup resources
     */
    dispose(): void {
        if (this.gl) {
            for (const texture of this.textures.values()) {
                this.gl.deleteTexture(texture);
            }
            for (const program of this.programs.values()) {
                this.gl.deleteProgram(program);
            }
            if (this.vao) {
                this.gl.deleteVertexArray(this.vao);
            }
            if (this.vertexBuffer) {
                this.gl.deleteBuffer(this.vertexBuffer);
            }
        }

        this.textures.clear();
        this.programs.clear();
        this.isInitialized = false;
    }
}

// ============================================
// WebGL2 Shaders
// ============================================

const VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texCoord;

uniform mat4 u_transform;

out vec2 v_texCoord;

void main() {
    gl_Position = u_transform * vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
}
`;

const FRAGMENT_SHADER_COMPOSITE = `#version 300 es
precision highp float;

in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_opacity;

out vec4 fragColor;

void main() {
    vec4 color = texture(u_texture, v_texCoord);
    fragColor = vec4(color.rgb, color.a * u_opacity);
}
`;

const FRAGMENT_SHADER_TRANSITION = `#version 300 es
precision highp float;

in vec2 v_texCoord;
uniform sampler2D u_from;
uniform sampler2D u_to;
uniform float u_progress;
uniform int u_type;

out vec4 fragColor;

void main() {
    vec4 fromColor = texture(u_from, v_texCoord);
    vec4 toColor = texture(u_to, v_texCoord);
    
    // Crossfade (type 0)
    if (u_type == 0) {
        fragColor = mix(fromColor, toColor, u_progress);
    }
    // Dip to black (type 1)
    else if (u_type == 1) {
        float halfProgress = u_progress * 2.0;
        if (halfProgress < 1.0) {
            fragColor = mix(fromColor, vec4(0.0, 0.0, 0.0, 1.0), halfProgress);
        } else {
            fragColor = mix(vec4(0.0, 0.0, 0.0, 1.0), toColor, halfProgress - 1.0);
        }
    }
    // Wipe left (type 3)
    else if (u_type == 3) {
        fragColor = v_texCoord.x < u_progress ? toColor : fromColor;
    }
    // Wipe right (type 4)
    else if (u_type == 4) {
        fragColor = v_texCoord.x > (1.0 - u_progress) ? toColor : fromColor;
    }
    // Default: crossfade
    else {
        fragColor = mix(fromColor, toColor, u_progress);
    }
}
`;

export const gpuCompositor = GPUCompositor.getInstance();
