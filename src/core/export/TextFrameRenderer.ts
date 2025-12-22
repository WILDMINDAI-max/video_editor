// ============================================
// Text Frame Renderer
// Renders text items as transparent PNG frames for server-side export
// ============================================

import type { TimelineItem, Track } from '@/types';

interface FrameData {
    dataUrl: string;
    frameIndex: number;
}

interface TextFrameSequence {
    textItemId: string;
    frames: Blob[];
    fps: number;
    startTime: number;
    duration: number;
    width: number;
    height: number;
}

/**
 * Calculate animation style based on current time
 * This is a copy of ExportEngine's logic to keep dependencies minimal
 */
function calculateAnimationStyle(item: TimelineItem, currentTime: number): {
    opacity?: number;
    scale?: number;
    scaleX?: number;
    scaleY?: number;
    rotate?: number;
    translateX?: number;
    translateY?: number;
    blur?: number;
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
        case 'blurry-eject':
            if (progress < 0.6) {
                const t = progress / 0.6;
                return { scale: 0.5 + 0.55 * t, blur: 5 * (1 - t), opacity: t };
            } else {
                const t = (progress - 0.6) / 0.4;
                return { scale: 1.05 - 0.05 * t, opacity: 1 };
            }
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

        case 'round-open': return { scale: p, opacity: p };
        case 'expansion': return { scaleX: p, opacity: p };
        case 'old-tv':
            if (progress < 0.5) {
                const t = progress / 0.5;
                return { scaleY: 0.01, scaleX: t, opacity: t };
            } else {
                const t = (progress - 0.5) / 0.5;
                return { scaleY: lerp(0.01, 1, t), scaleX: 1, opacity: 1 };
            }
        case 'shard-roll': return { rotate: 360 - 360 * p, scale: p, opacity: p };

        // FLIP ANIMATIONS: CSS uses rotateX/rotateY with perspective for 3D effect
        // In 2D Canvas, we simulate this by scaling the axis being rotated
        case 'flip-down-1':
            // Flip from top (rotateX: 90deg -> 0): simulate with scaleY
            return { scaleY: p, opacity: p };
        case 'flip-down-2':
            // Flip from top with scale
            return { scaleY: p, scale: 0.8 + 0.2 * p, opacity: p };
        case 'flip-up-1':
            // Flip from bottom: simulate with scaleY
            return { scaleY: p, opacity: p };
        case 'flip-up-2':
            // Flip from bottom with scale
            return { scaleY: p, scale: 0.8 + 0.2 * p, opacity: p };

        case 'fly-in-rotate': return { translateX: -100 + 100 * p, rotate: -90 + 90 * p, opacity: p };
        case 'fly-in-flip':
            // Fly in from left while rotating on Y axis (simulated with scaleX)
            return { translateX: -100 + 100 * p, scaleX: p, opacity: p };
        case 'fly-to-zoom': return { scale: p, translateX: -100 + 100 * p, opacity: p };

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

        case 'tiny-zoom': return { scale: p, opacity: p };
        case 'zoom-in-center':
        case 'zoom-in-1': return { scale: 0.5 + 0.5 * p, opacity: p };
        case 'zoom-in-left': return { scale: 0.5 + 0.5 * p, translateX: -30 + 30 * p, opacity: p };
        case 'zoom-in-right': return { scale: 0.5 + 0.5 * p, translateX: 30 - 30 * p, opacity: p };
        case 'zoom-in-top': return { scale: 0.5 + 0.5 * p, translateY: -30 + 30 * p, opacity: p };
        case 'zoom-in-bottom': return { scale: 0.5 + 0.5 * p, translateY: 30 - 30 * p, opacity: p };
        case 'zoom-out-1': return { scale: 1.5 - 0.5 * p, opacity: p };

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
 * Render a single text frame to canvas
 */
function renderTextFrame(
    item: TimelineItem,
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    currentTime: number
): void {
    // Clear canvas with transparent background
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const fontSize = item.fontSize || 40;
    const fontStyle = item.fontStyle || 'normal';
    const fontWeight = item.fontWeight || 'normal';
    const lineHeight = fontSize * 1.4;
    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${item.fontFamily || 'Inter'}`;
    ctx.fillStyle = item.color || '#000000';
    // Calculate bounds based on canvas size (MATCH ExportEngine.ts logic)
    const width = item.width ? (item.width / 100) * canvas.width : canvas.width * 0.5;
    const height = item.height ? (item.height / 100) * canvas.height : canvas.height * 0.5;
    const x = ((item.x ?? 0) / 100) * canvas.width;
    const y = ((item.y ?? 0) / 100) * canvas.height;

    // Calculate alignment
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

    ctx.textBaseline = 'top';

    if (verticalAlign === 'top') {
        textY = y;
    } else if (verticalAlign === 'bottom') {
        textY = y + height - fontSize;
    } else {
        // Middle: center vertically
        textY = y + height / 2 - fontSize / 2;
    }

    let text = item.name || item.src || '';
    if (item.textTransform === 'uppercase') text = text.toUpperCase();
    else if (item.textTransform === 'lowercase') text = text.toLowerCase();

    const animStyle = calculateAnimationStyle(item, currentTime);

    ctx.save();
    ctx.translate(textX, textY);

    if (item.rotation) ctx.rotate((item.rotation * Math.PI) / 180);

    // Combine uniform scale with independent x/y scale
    const sX = (animStyle.scale ?? 1) * (animStyle.scaleX ?? 1);
    const sY = (animStyle.scale ?? 1) * (animStyle.scaleY ?? 1);

    if (sX !== 1 || sY !== 1) {
        ctx.scale(sX, sY);
    }

    if (animStyle.rotate) ctx.rotate((animStyle.rotate * Math.PI) / 180);
    // Animation translateX/Y are percentages - convert to pixels
    const animTranslateX = (animStyle.translateX ?? 0) / 100 * canvas.width;
    const animTranslateY = (animStyle.translateY ?? 0) / 100 * canvas.height;
    if (animTranslateX !== 0 || animTranslateY !== 0) {
        ctx.translate(animTranslateX, animTranslateY);
    }

    // Apply blur filter if needed
    if (animStyle.blur) {
        ctx.filter = `blur(${animStyle.blur}px)`;
    }

    const baseOpacity = (item.opacity ?? 100) / 100;
    const animOpacity = animStyle.opacity ?? 1;
    ctx.globalAlpha = baseOpacity * animOpacity;

    const effect = item.textEffect;
    const effectType = effect?.type || 'none';
    const effColor = effect?.color || '#000000';
    const intensity = effect?.intensity ?? 50;
    const offset = effect?.offset ?? 50;
    const dist = (offset / 100) * 20;
    const blur = (intensity / 100) * 20;

    const lines = text.split('\n');
    let currentY = -((lines.length - 1) * lineHeight) / 2;

    for (let i = 0; i < lines.length; i++) {
        let lineText = lines[i];
        if (item.listType === 'bullet') lineText = '• ' + lineText;
        else if (item.listType === 'number') lineText = `${i + 1}. ` + lineText;

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
                ctx.fillStyle = '#00ffff';
                ctx.fillText(lineText, -gOff, currentY - gOff);
                ctx.fillStyle = '#ff00ff';
                ctx.fillText(lineText, gOff, currentY + gOff);
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
                const padX = 8, padY = 4;
                ctx.fillStyle = effColor;
                ctx.fillRect(-textWidth / 2 - padX, currentY - padY, textWidth + padX * 2, textHeight + padY * 2);
                ctx.fillStyle = item.color || '#000000';
                ctx.fillText(lineText, 0, currentY);
                break;
            default:
                ctx.fillText(lineText, 0, currentY);
                break;
        }
        currentY += lineHeight;
    }
    ctx.restore();
}

/**
 * Render all frames for a text item
 */
export async function renderTextFrameSequence(
    item: TimelineItem,
    canvasWidth: number,
    canvasHeight: number,
    fps: number,
    onProgress?: (progress: number) => void
): Promise<TextFrameSequence> {
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d')!;

    const totalFrames = Math.ceil(item.duration * fps);
    const frames: Blob[] = [];

    for (let i = 0; i < totalFrames; i++) {
        const currentTime = item.start + (i / fps);
        renderTextFrame(item, canvas, ctx, currentTime);

        // Convert to blob
        const blob = await new Promise<Blob>((resolve) => {
            canvas.toBlob((blob) => resolve(blob!), 'image/png');
        });
        frames.push(blob);

        if (onProgress) {
            onProgress((i + 1) / totalFrames);
        }
    }

    return {
        textItemId: item.id,
        frames,
        fps,
        startTime: item.start,
        duration: item.duration,
        width: canvasWidth,
        height: canvasHeight
    };
}

/**
 * Collect all text items from tracks
 */
export function getTextItems(tracks: Track[]): TimelineItem[] {
    const textItems: TimelineItem[] = [];
    for (const track of tracks) {
        for (const item of track.items) {
            if (item.type === 'text') {
                textItems.push(item);
            }
        }
    }
    return textItems.sort((a, b) => a.start - b.start);
}

/**
 * Render text frames for all text items
 */
export async function renderAllTextFrames(
    tracks: Track[],
    canvasWidth: number,
    canvasHeight: number,
    fps: number,
    onProgress?: (phase: string, progress: number) => void
): Promise<TextFrameSequence[]> {
    const textItems = getTextItems(tracks);
    const sequences: TextFrameSequence[] = [];

    for (let i = 0; i < textItems.length; i++) {
        const item = textItems[i];
        onProgress?.(`Rendering text: ${item.name || 'Untitled'}`, i / textItems.length);

        const sequence = await renderTextFrameSequence(
            item,
            canvasWidth,
            canvasHeight,
            fps,
            (frameProgress) => {
                onProgress?.(`Rendering text: ${item.name || 'Untitled'}`, (i + frameProgress) / textItems.length);
            }
        );
        sequences.push(sequence);
    }

    return sequences;
}
