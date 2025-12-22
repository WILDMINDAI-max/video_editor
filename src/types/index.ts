export type Tab = 'text' | 'uploads' | 'images' | 'videos' | 'audio' | 'projects' | 'tools' | 'library';

export interface Project {
    id: string;
    name: string;
    lastModified: string;
    thumbnail: string;
}

import React from 'react';
import { Move, ArrowRight, ZoomIn, RotateCw, Layers, Maximize, Minimize, ArrowUp, MoveRight, Wind, Droplet, Zap, CircleDot, Tv, Activity, Circle, MoveHorizontal, MoveVertical, ArrowDown, ZoomOut, Expand, Triangle, Scissors, RefreshCw, Send, ArrowLeft, Rocket, Scale, ArrowUpLeft, ArrowUpRight, ArrowDownLeft, ArrowDownRight, CornerLeftUp, CornerRightUp, CornerLeftDown, CornerRightDown, ChevronsLeft, ChevronsRight, ChevronsUp, ChevronsDown, MousePointerClick, Target, Eye, EyeOff, Aperture, Focus, Scan, Crosshair, Disc, Globe, Sun, Moon, Cloud, Star, Heart, Sparkles, Monitor, ArrowUpFromLine } from 'lucide-react';
export type ClipType = 'video' | 'audio' | 'image' | 'text' | 'color';

export type TransitionType =
    | 'none'
    | 'dissolve' | 'additive-dissolve' | 'dip-to-black' | 'dip-to-white' | 'film-dissolve'
    | 'iris-box' | 'iris-cross' | 'iris-diamond' | 'iris-round'
    | 'slide' | 'push' | 'split' | 'whip' | 'band-slide'
    | 'wipe' | 'band-wipe' | 'barn-doors' | 'checker-wipe' | 'clock-wipe' | 'radial-wipe' | 'venetian-blinds' | 'wedge-wipe' | 'zig-zag' | 'random-blocks'
    | 'cross-zoom' | 'morph-cut'
    | 'page-peel' | 'page-turn'
    | 'circle' | 'line-wipe' | 'match-move' | 'flow' | 'stack' | 'chop'
    | 'fade-dissolve' | 'flash-zoom-in' | 'flash-zoom-out' | 'film-roll'
    | 'non-additive-dissolve' | 'ripple-dissolve' | 'smooth-wipe' | 'spin' | 'zoom-blur' | 'glitch' | 'rgb-split' | 'film-burn'
    // New Filmora-style Transitions
    | 'luma-dissolve' | 'fade-color'
    | 'simple-wipe' | 'multi-panel' | 'split-screen'
    | 'zoom-in' | 'zoom-out' | 'warp-zoom'
    | 'spin-3d'
    | 'cube-rotate' | 'flip-3d' | 'page-curl'
    | 'shape-circle' | 'shape-heart' | 'shape-triangle'
    | 'chromatic-aberration' | 'pixelate' | 'datamosh'
    | 'flash' | 'light-leak'
    | 'ripple' | 'liquid' | 'stretch'
    | 'tile-drop' | 'mosaic-grid'
    | 'speed-blur' | 'whip-pan'
    | 'brush-reveal' | 'ink-splash';

export interface Transition {
    type: TransitionType;
    duration: number; // seconds
    speed?: number; // 0.1 (slow) to 2.0 (fast)
    direction?: 'left' | 'right' | 'up' | 'down' | 'in' | 'out';
    origin?: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'left' | 'right' | 'top' | 'bottom';
    timing?: 'prefix' | 'overlap' | 'postfix';
}

export interface Animation {
    type: string; // e.g., 'rise', 'pan', 'neon'
    category: 'page' | 'photo' | 'element';
    duration?: number; // seconds
    timing?: 'enter' | 'exit' | 'both';
}

export interface AnimationDefinition {
    id: string;
    name: string;
    category: string;
    icon: React.ReactNode;
}

export interface BorderStyle {
    color: string;
    width: number;
    style: 'solid' | 'dashed' | 'dotted' | 'none';
}

export interface TextEffect {
    type: 'none' | 'shadow' | 'lift' | 'hollow' | 'splice' | 'outline' | 'echo' | 'glitch' | 'neon' | 'background';
    color?: string;
    intensity?: number; // 0-100
    offset?: number; // 0-100
    direction?: number; // degrees
}

export interface Adjustments {
    // White Balance
    temperature: number; // -100 to 100
    tint: number; // -100 to 100

    // Light
    brightness: number; // -100 to 100
    contrast: number; // -100 to 100
    highlights: number; // -100 to 100
    shadows: number; // -100 to 100
    whites: number; // -100 to 100
    blacks: number; // -100 to 100

    // Color
    saturation: number; // -100 to 100
    vibrance: number; // -100 to 100
    hue: number; // -100 to 100 (Color Edit)

    // Texture
    sharpness: number; // -100 to 100
    clarity: number; // -100 to 100
    vignette: number; // 0 to 100
}

export const DEFAULT_ADJUSTMENTS: Adjustments = {
    temperature: 0, tint: 0,
    brightness: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
    saturation: 0, vibrance: 0, hue: 0,
    sharpness: 0, clarity: 0, vignette: 0
};

export interface Filter {
    id: string;
    name: string;
    style: string; // CSS filter string suffix
}

export const FILTERS: Filter[] = [
    { id: 'none', name: 'None', style: '' },
    { id: 'bw', name: 'Black & White', style: 'grayscale(100%)' },
    { id: 'blockbuster', name: 'Blockbuster', style: 'contrast(120%) saturate(110%) sepia(20%) hue-rotate(-10deg)' },
    { id: 'boost-color', name: 'Boost Color', style: 'saturate(150%) contrast(110%)' },
    { id: 'brighten', name: 'Brighten', style: 'brightness(120%) contrast(105%)' },
    { id: 'cool', name: 'Cool', style: 'saturate(90%) hue-rotate(10deg) brightness(105%)' },
    { id: 'cool-max', name: 'Cool Max', style: 'saturate(80%) hue-rotate(20deg) brightness(110%) contrast(110%)' },
    { id: 'darken', name: 'Darken', style: 'brightness(80%) contrast(120%)' },
    { id: 'elegant', name: 'Elegant', style: 'sepia(10%) contrast(110%) brightness(105%) saturate(90%)' },
    { id: 'epic', name: 'Epic', style: 'contrast(130%) saturate(120%) sepia(15%)' },
    { id: 'fantasy', name: 'Fantasy', style: 'saturate(130%) brightness(110%) hue-rotate(-10deg) contrast(90%)' },
    { id: 'far-east', name: 'Far East', style: 'sepia(20%) contrast(110%) brightness(105%) hue-rotate(5deg)' },
    { id: 'film-stock', name: 'Film Stock', style: 'contrast(120%) saturate(90%) sepia(10%)' },
    { id: 'jungle', name: 'Jungle', style: 'saturate(140%) hue-rotate(-10deg) brightness(95%)' },
    { id: 'lomo', name: 'Lomo', style: 'contrast(130%) saturate(120%) sepia(10%)' }, // Vignette handled separately if needed, or approx with radial-gradient overlay (complex in CSS filter)
    { id: 'old-film', name: 'Old Film', style: 'sepia(50%) contrast(110%) grayscale(20%)' },
    { id: 'polaroid', name: 'Polaroid', style: 'contrast(110%) brightness(110%) sepia(20%) saturate(90%)' },
    { id: 'tv', name: 'TV', style: 'contrast(120%) brightness(110%) saturate(110%) blur(0.5px)' },
    { id: 'vignette-1', name: 'Vignette 1', style: 'brightness(90%) contrast(120%)' }, // Placeholder for vignette style
    { id: 'warm', name: 'Warm', style: 'sepia(20%) saturate(120%) brightness(105%)' },
    { id: 'warm-max', name: 'Warm Max', style: 'sepia(40%) saturate(140%) brightness(110%)' },
    { id: 'fresco', name: 'Fresco', style: 'sepia(30%) brightness(110%) contrast(110%)' },
    { id: 'belvedere', name: 'Belvedere', style: 'sepia(40%) contrast(90%)' },
    { id: 'flint', name: 'Flint', style: 'brightness(110%) contrast(90%) grayscale(20%)' },
    { id: 'luna', name: 'Luna', style: 'grayscale(100%) contrast(110%)' },
    { id: 'festive', name: 'Festive', style: 'saturate(150%) brightness(105%)' },
    { id: 'summer', name: 'Summer', style: 'saturate(120%) sepia(20%) brightness(110%)' },
];

export const FONTS = [
    // --- Sans-Serif ---
    { name: 'Inter', family: 'Inter, sans-serif' },
    { name: 'Roboto', family: 'Roboto, sans-serif' },
    { name: 'Open Sans', family: '"Open Sans", sans-serif' },
    { name: 'Lato', family: 'Lato, sans-serif' },
    { name: 'Montserrat', family: 'Montserrat, sans-serif' },
    { name: 'Poppins', family: 'Poppins, sans-serif' },
    { name: 'Helvetica', family: 'Helvetica, sans-serif' },
    { name: 'Arial', family: 'Arial, sans-serif' },
    { name: 'Futura', family: 'Futura, "Trebuchet MS", Arial, sans-serif' },
    { name: 'Avenir', family: 'Avenir, "Segoe UI", sans-serif' },
    { name: 'Proxima Nova', family: '"Proxima Nova", sans-serif' },
    { name: 'Segoe UI', family: '"Segoe UI", sans-serif' },
    { name: 'Ubuntu', family: 'Ubuntu, sans-serif' },
    { name: 'Noto Sans', family: '"Noto Sans", sans-serif' },
    { name: 'Source Sans Pro', family: '"Source Sans Pro", sans-serif' },
    { name: 'Nunito', family: 'Nunito, sans-serif' },
    { name: 'Raleway', family: 'Raleway, sans-serif' },
    { name: 'Oswald', family: 'Oswald, sans-serif' },
    { name: 'Bebas Neue', family: '"Bebas Neue", sans-serif' },
    { name: 'SF Pro', family: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' },
    { name: 'Arimo', family: 'Arimo, sans-serif' },
    { name: 'DM Sans', family: '"DM Sans", sans-serif' },
    { name: 'Quicksand', family: 'Quicksand, sans-serif' },

    // --- Serif ---
    { name: 'Times New Roman', family: '"Times New Roman", serif' },
    { name: 'Georgia', family: 'Georgia, serif' },
    { name: 'Merriweather', family: 'Merriweather, serif' },
    { name: 'Playfair Display', family: '"Playfair Display", serif' },
    { name: 'Garamond', family: '"EB Garamond", serif' },
    { name: 'Baskerville', family: '"Libre Baskerville", serif' },
    { name: 'Bodoni', family: '"Bodoni Moda", serif' },
    { name: 'Didot', family: '"Didot", "Bodoni MT", serif' },
    { name: 'Cambria', family: 'Cambria, serif' },
    { name: 'Caslon', family: '"Libre Caslon Text", serif' },
    { name: 'Palatino', family: '"Palatino Linotype", "Book Antiqua", Palatino, serif' },
    { name: 'Lora', family: 'Lora, serif' },
    { name: 'Crimson Text', family: '"Crimson Text", serif' },
    { name: 'Spectral', family: 'Spectral, serif' },
    { name: 'Constantia', family: 'Constantia, serif' },

    // --- Slab Serif ---
    { name: 'Rockwell', family: 'Rockwell, "Courier Bold", serif' },
    { name: 'Roboto Slab', family: '"Roboto Slab", serif' },
    { name: 'Arvo', family: 'Arvo, serif' },
    { name: 'Egyptienne', family: '"Courier New", serif' },
    { name: 'Clarendon', family: 'Clarendon, serif' },

    // --- Monospace ---
    { name: 'Courier New', family: '"Courier New", monospace' },
    { name: 'Consolas', family: 'Consolas, monospace' },
    { name: 'Fira Code', family: '"Fira Code", monospace' },
    { name: 'JetBrains Mono', family: '"JetBrains Mono", monospace' },
    { name: 'Source Code Pro', family: '"Source Code Pro", monospace' },
    { name: 'Menlo', family: 'Menlo, monospace' },
    { name: 'Monaco', family: 'Monaco, monospace' },
    { name: 'Inconsolata', family: 'Inconsolata, monospace' },
    { name: 'IBM Plex Mono', family: '"IBM Plex Mono", monospace' },
    { name: 'Ubuntu Mono', family: '"Ubuntu Mono", monospace' },

    // --- Script ---
    { name: 'Pacifico', family: 'Pacifico, cursive' },
    { name: 'Lobster', family: 'Lobster, cursive' },
    { name: 'Great Vibes', family: '"Great Vibes", cursive' },
    { name: 'Dancing Script', family: '"Dancing Script", cursive' },
    { name: 'Brush Script', family: '"Brush Script MT", cursive' },
    { name: 'Parisienne', family: 'Parisienne, cursive' },

    // --- Display ---
    { name: 'Impact', family: 'Impact, sans-serif' },
    { name: 'Anton', family: 'Anton, sans-serif' },
    { name: 'League Spartan', family: '"League Spartan", sans-serif' },
    { name: 'Cooper Black', family: '"Cooper Black", serif' },
    { name: 'Blackletter', family: '"UnifrakturMaguntia", cursive' },
    { name: 'Archivo Black', family: '"Archivo Black", sans-serif' },
    { name: 'Abril Fatface', family: '"Abril Fatface", display' },
    { name: 'Alfa Slab One', family: '"Alfa Slab One", display' },
    { name: 'Shrikhand', family: 'Shrikhand, display' },
    { name: 'Stardos Stencil', family: '"Stardos Stencil", display' },
    { name: 'Rye', family: '"Rye", display' },
    { name: 'Tilt Neon', family: '"Tilt Neon", display' },

    // --- Corporate ---
    { name: 'Tahoma', family: 'Tahoma, sans-serif' },
    { name: 'Verdana', family: 'Verdana, sans-serif' },
    { name: 'Calibri', family: 'Calibri, sans-serif' },
    { name: 'Candara', family: 'Candara, sans-serif' },
    { name: 'Trebuchet MS', family: '"Trebuchet MS", sans-serif' },
    { name: 'Gill Sans', family: '"Gill Sans", sans-serif' },
    { name: 'Franklin Gothic', family: '"Franklin Gothic Medium", sans-serif' },
    { name: 'Lucida Sans', family: '"Lucida Sans", sans-serif' },
];

export interface FontCombination {
    id: string;
    name: string;
    label: string;
    category: string;
    style: Partial<TimelineItem>;
}

export const FONT_COMBINATIONS: FontCombination[] = [
    {
        id: 'fc_glow',
        name: 'Glow',
        label: 'glow up',
        category: 'Neon',
        style: {
            fontFamily: '"Quicksand", sans-serif',
            fontWeight: 'bold',
            color: '#ccff00',
            textEffect: { type: 'neon', color: '#ccff00', intensity: 80, offset: 0 },
            fontSize: 80
        }
    },
    {
        id: 'fc_party',
        name: 'Party',
        label: 'NOW OPEN',
        category: 'Marketing',
        style: {
            fontFamily: '"Poppins", sans-serif',
            fontWeight: 'bold',
            color: '#8b5cf6',
            textEffect: { type: 'splice', color: '#fbbf24', intensity: 0, offset: 30 },
            fontSize: 70
        }
    },
    {
        id: 'fc_beach',
        name: 'Retro',
        label: 'Beach Please',
        category: 'Retro',
        style: {
            fontFamily: '"Lobster", cursive',
            color: '#22d3ee',
            textEffect: { type: 'lift', color: '#facc15', intensity: 20, offset: 20 },
            fontSize: 80
        }
    },
    {
        id: 'fc_tech',
        name: 'Cyber',
        label: 'PRESS START',
        category: 'Tech',
        style: {
            fontFamily: '"Fira Code", monospace',
            fontWeight: 'bold',
            color: '#00ff00',
            textEffect: { type: 'glitch', color: '#ff00ff', intensity: 60, offset: 40 },
            fontSize: 50
        }
    },
    {
        id: 'fc_elegant',
        name: 'Luxury',
        label: 'Business Model',
        category: 'Elegant',
        style: {
            fontFamily: '"Playfair Display", serif',
            fontStyle: 'italic',
            color: '#1f2937',
            fontSize: 70
        }
    },
    {
        id: 'fc_sale',
        name: 'Sale',
        label: 'HUGE SALE',
        category: 'Marketing',
        style: {
            fontFamily: '"Anton", sans-serif',
            color: '#ef4444',
            fontSize: 100,
            textEffect: { type: 'shadow', color: '#000000', intensity: 30, offset: 15 }
        }
    },
    {
        id: 'fc_life',
        name: 'Vlog',
        label: 'A day in my life',
        category: 'Social',
        style: {
            fontFamily: '"Brittany", cursive',
            color: '#8b5cf6',
            fontSize: 90
        }
    },
    {
        id: 'fc_coffee',
        name: 'Organic',
        label: 'Coffee Break',
        category: 'Casual',
        style: {
            fontFamily: '"Cooper Black", serif',
            color: '#3f6212',
            fontSize: 60
        }
    },
    {
        id: 'fc_vibe',
        name: 'Vibe',
        label: 'VIBE',
        category: 'Retro',
        style: {
            fontFamily: '"Shrikhand", display',
            color: '#db2777',
            textEffect: { type: 'echo', color: '#db2777', intensity: 40, offset: 40 },
            fontSize: 90
        }
    },
    {
        id: 'fc_golden',
        name: 'Classy',
        label: 'GOLDEN HOUR',
        category: 'Elegant',
        style: {
            fontFamily: '"Playfair Display", serif',
            fontWeight: 'bold',
            color: '#ca8a04',
            textEffect: { type: 'shadow', color: '#ca8a04', intensity: 50, offset: 0 }, // Soft glow
            fontSize: 65
        }
    },
    {
        id: 'fc_wedding',
        name: 'Wedding',
        label: 'Bride & Groom',
        category: 'Elegant',
        style: {
            fontFamily: '"Great Vibes", cursive',
            color: '#111827',
            fontSize: 80
        }
    },
    {
        id: 'fc_thankyou',
        name: '3D',
        label: 'Thank You',
        category: 'Fun',
        style: {
            fontFamily: '"Abril Fatface", display',
            color: '#f472b6',
            textEffect: { type: 'splice', color: '#831843', intensity: 0, offset: 25 },
            fontSize: 70
        }
    },
    {
        id: 'fc_future',
        name: 'Modern',
        label: 'FUTURE READY',
        category: 'Tech',
        style: {
            fontFamily: '"Montserrat", sans-serif',
            fontWeight: 'bold',
            color: 'transparent',
            textEffect: { type: 'outline', color: '#000000', intensity: 2, offset: 0 },
            fontSize: 60
        }
    },
    {
        id: 'fc_journal',
        name: 'Editorial',
        label: 'BUSINESS JOURNAL',
        category: 'Corporate',
        style: {
            fontFamily: '"Lora", serif',
            fontWeight: 'bold',
            color: '#000000',
            fontSize: 50
        }
    },
    {
        id: 'fc_paint',
        name: 'Brush',
        label: 'Custom Paint',
        category: 'Artistic',
        style: {
            fontFamily: '"Brush Script MT", cursive',
            color: '#ea580c',
            fontSize: 80,
            rotation: -5
        }
    }
];

export interface TimelineItem {
    id: string;
    type: ClipType;
    src: string;
    name: string;
    thumbnail?: string;

    // Timing
    start: number; // Start time on timeline (seconds)
    duration: number; // Duration on timeline (seconds)
    offset: number; // Start time within the source media (for trimming)

    // Visuals
    trackId: string;
    layer: number; // Z-index
    isLocked?: boolean; // Cannot be moved/edited
    isBackground?: boolean; // Fills canvas, lowest z-index

    // Styling
    backgroundColor?: string; // Background color behind the content
    opacity?: number; // 0 to 100
    flipH?: boolean;
    flipV?: boolean;
    rotation?: number; // degrees
    scale?: number; // Legacy scaling, preferred to use width/height for overlays now
    width?: number; // Width in % of canvas
    height?: number; // Height in % of canvas
    x?: number; // Position X in % (-50 to 50 relative to center)
    y?: number; // Position Y in % (-50 to 50 relative to center)

    // Text Styling
    fontSize?: number;
    fontFamily?: string;
    color?: string;
    fontWeight?: 'normal' | 'bold';
    fontStyle?: 'normal' | 'italic';
    textDecoration?: 'none' | 'underline' | 'line-through';
    textAlign?: 'left' | 'center' | 'right' | 'justify';
    verticalAlign?: 'top' | 'middle' | 'bottom';
    textTransform?: 'none' | 'uppercase' | 'lowercase';
    listType?: 'none' | 'bullet' | 'number';
    textEffect?: TextEffect;

    // Border & Radius
    border?: BorderStyle;
    borderRadius?: number;

    // Animation
    animation?: Animation;

    // Audio & Speed
    volume?: number; // 0 to 100
    speed?: number; // 0.1 to 5.0 (multiplier)
    muteVideo?: boolean; // Completely mute video audio


    // Crop & Mask
    crop?: { x: number; y: number; zoom: number }; // x,y in % (0-100), zoom multiplier (>=1)
    maskImage?: string; // Data URL for alpha mask (eraser)

    // Image Editing
    fit?: 'cover' | 'contain' | 'fill'; // Object fit mode
    adjustments?: Adjustments;
    filter?: string; // Filter ID
    filterIntensity?: number; // 0 to 100

    // Transition IN (from previous clip to this one)
    transition?: Transition;
}

export interface Track {
    id: string;
    type: 'video' | 'audio' | 'overlay';
    name: string;
    items: TimelineItem[];
    isMuted?: boolean;
    isHidden?: boolean;
}

// Helper to generate CSS filter string for Adjustments ONLY
export const getAdjustmentStyle = (item: TimelineItem, scale: number = 1) => {
    const adj = item.adjustments || DEFAULT_ADJUSTMENTS;

    const filters: string[] = [];

    // Calculate effective values
    let effBrightness = adj.brightness;
    let effContrast = adj.contrast;
    let effSaturation = adj.saturation;

    // Highlights (Approx)
    effBrightness += (adj.highlights * 0.15);
    effContrast += (adj.highlights * 0.05);

    // Shadows (Approx)
    effBrightness += (adj.shadows * 0.15);
    effContrast -= (adj.shadows * 0.1);

    // Whites (Approx)
    effBrightness += (adj.whites * 0.15);

    // Blacks (Approx)
    effBrightness += (adj.blacks * 0.15);

    // Clarity (Approx)
    effContrast += (adj.clarity * 0.2);

    // Vibrance (Approx)
    effSaturation += (adj.vibrance * 0.5);

    // Apply Standard Adjustments
    if (effBrightness !== 0) filters.push(`brightness(${100 + effBrightness}%)`);
    if (effContrast !== 0) filters.push(`contrast(${100 + effContrast}%)`);
    if (effSaturation !== 0) filters.push(`saturate(${100 + effSaturation}%)`);
    if (adj.hue !== 0) filters.push(`hue-rotate(${adj.hue * 1.8}deg)`);

    // Temp/Tint (Approximation)
    if (adj.temperature !== 0) filters.push(adj.temperature > 0 ? `sepia(${adj.temperature * 0.3}%)` : `hue-rotate(${adj.temperature * -0.3}deg)`);
    if (adj.tint !== 0) filters.push(`hue-rotate(${adj.tint}deg)`);

    // Texture (Approximation)
    if (adj.sharpness < 0) filters.push(`blur(${-adj.sharpness * 0.05 * scale}px)`);

    return filters.join(' ');
};

// Helper to get Preset Filter Style string
export const getPresetFilterStyle = (filterId: string) => {
    const filterDef = FILTERS.find(f => f.id === filterId);
    if (filterDef && filterDef.id !== 'none') {
        return filterDef.style;
    }
    return '';
};

// Legacy helper for compatibility (combines everything, ignores intensity blending)
export const getComputedFilterStyle = (item: TimelineItem) => {
    const adj = getAdjustmentStyle(item);
    const pre = getPresetFilterStyle(item.filter || 'none');
    return `${adj} ${pre}`.trim();
}

// Helper to generate CSS for Text Effects
export const getTextEffectStyle = (effect: TextEffect, itemColor: string = '#000000', scale: number = 1): React.CSSProperties => {
    if (!effect || effect.type === 'none') return {};

    const { type, color = '#000000', intensity = 50, offset = 50 } = effect;
    const effColor = color;

    const dist = (offset / 100) * 20 * scale; // 0 to 20px * scale
    const blur = (intensity / 100) * 20 * scale; // 0 to 20px * scale

    const shadowX = dist;
    const shadowY = dist;

    switch (type) {
        case 'shadow':
            return { textShadow: `${shadowX}px ${shadowY}px ${blur}px ${effColor}` };
        case 'lift':
            return { textShadow: `0px ${dist * 0.5 + 4 * scale}px ${blur + 10 * scale}px rgba(0,0,0,0.5)` };
        case 'hollow':
            return {
                WebkitTextStroke: `${((intensity / 100) * 3 + 1) * scale}px ${itemColor}`,
                color: 'transparent'
            };
        case 'splice':
            return {
                WebkitTextStroke: `${((intensity / 100) * 3 + 1) * scale}px ${itemColor}`,
                color: 'transparent',
                textShadow: `${shadowX + 2 * scale}px ${shadowY + 2 * scale}px 0px ${effColor}`
            };
        case 'outline':
            return {
                WebkitTextStroke: `${((intensity / 100) * 3 + 1) * scale}px ${effColor}`,
                color: itemColor
            };
        case 'echo':
            return {
                textShadow: `
                    ${shadowX}px ${shadowY}px 0px ${effColor}80,
                    ${shadowX * 2}px ${shadowY * 2}px 0px ${effColor}40,
                    ${shadowX * 3}px ${shadowY * 3}px 0px ${effColor}20
                `
            };
        case 'glitch':
            const gOff = ((offset / 100) * 5 + 2) * scale;
            return {
                textShadow: `
                    ${-gOff}px ${-gOff}px 0px #00ffff,
                    ${gOff}px ${gOff}px 0px #ff00ff
                `
            };
        case 'neon':
            return {
                textShadow: `
                    0 0 ${intensity * 0.1 * scale}px ${effColor},
                    0 0 ${intensity * 0.2 * scale}px ${effColor},
                    0 0 ${intensity * 0.4 * scale}px ${effColor}
                `,
                color: itemColor || '#ffffff'
            };
        case 'background':
            return {
                backgroundColor: effColor,
                padding: `${4 * scale}px ${8 * scale}px`,
                boxDecorationBreak: 'clone',
                WebkitBoxDecorationBreak: 'clone'
            };
        default:
            return {};
    }
};

export interface CanvasDimension {
    width: number;
    height: number;
    name: string;
}

export const RESIZE_OPTIONS: CanvasDimension[] = [
    { name: 'Instagram Story', width: 1080, height: 1920 },
    { name: 'Instagram Post', width: 1080, height: 1080 },
    { name: 'Facebook Post', width: 940, height: 788 },
    { name: 'YouTube Video', width: 1920, height: 1080 },
    { name: 'TikTok Video', width: 1080, height: 1920 },
    { name: 'Mobile Video', width: 1080, height: 1920 },
    { name: 'Presentation (16:9)', width: 1920, height: 1080 },
    { name: 'Document (A4)', width: 794, height: 1123 },
    { name: 'Logo', width: 500, height: 500 },
];

export const MOCK_UPLOADS = [
    { id: '1', type: 'image', src: 'https://picsum.photos/300/300?random=1', thumbnail: 'https://picsum.photos/300/300?random=1', name: 'Travel 1' },
    { id: '2', type: 'image', src: 'https://picsum.photos/300/300?random=2', thumbnail: 'https://picsum.photos/300/300?random=2', name: 'Food' },
    { id: '3', type: 'image', src: 'https://picsum.photos/300/300?random=3', thumbnail: 'https://picsum.photos/300/300?random=3', name: 'Nature' },
];

export const MOCK_IMAGES = [
    { id: 's1', src: 'https://images.unsplash.com/photo-1682687220742-aba13b6e50ba?auto=format&fit=crop&w=300&q=80', name: 'Mountain' },
    { id: 's2', src: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=300&q=80', name: 'Forest' },
    { id: 's3', src: 'https://images.unsplash.com/photo-1472214103451-9374bd1c7dd1?auto=format&fit=crop&w=300&q=80', name: 'River' },
];

export const MOCK_VIDEOS = [
    { id: 'v1', src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', thumbnail: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg', name: 'Big Buck Bunny', duration: '00:09:56' },
    { id: 'v2', src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', thumbnail: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ElephantsDream.jpg', name: 'Elephant Dream', duration: '00:10:53' },
    { id: 'v3', src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', thumbnail: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerBlazes.jpg', name: 'For Bigger Blazes', duration: '00:00:15' },
];

export const MOCK_AUDIO = [
    { id: 'a2', src: 'https://actions.google.com/sounds/v1/water/waves_crashing_on_rock_beach.ogg', name: 'Ocean Waves', duration: '0:45', category: 'Nature' },
    { id: 'a3', src: 'https://actions.google.com/sounds/v1/weather/rain_heavy_loud.ogg', name: 'Heavy Rain', duration: '0:30', category: 'Nature' },
];

export const MOCK_TEXT_STYLES = [
    { id: 'ts1', preview: 'Heading', fontSize: 60, fontWeight: 'bold' },
    { id: 'ts2', preview: 'Subheading', fontSize: 40, fontWeight: 'bold' },
    { id: 'ts3', preview: 'Body Text', fontSize: 24, fontWeight: 'normal' },
    { id: 'ts4', preview: 'Caption', fontSize: 18, fontWeight: 'normal' },
];

export const MOCK_PROJECTS: Project[] = [
    { id: 'p1', name: 'Summer Vacation Reel', lastModified: '2 mins ago', thumbnail: 'https://picsum.photos/100/100?random=10' },
    { id: 'p2', name: 'Q3 Marketing Promo', lastModified: 'Yesterday', thumbnail: 'https://picsum.photos/100/100?random=11' },
];

export const DEFAULT_DOCUMENT_COLORS = [
    '#ffffff', '#000000', '#ef4444', '#22c55e', '#3b82f6',
    '#eab308', '#a855f7', '#ec4899', '#9ca3af', '#4b5563'
];

export const GRADIENT_COLORS = [
    'linear-gradient(to right, #ff7e5f, #feb47b)',
    'linear-gradient(to right, #6a11cb, #2575fc)',
    'linear-gradient(to right, #ffecd2, #fcb69f)',
    'linear-gradient(to right, #00c6ff, #0072ff)',
    'linear-gradient(to right, #f093fb, #f5576c)'
];

export const ANIMATION_CATEGORIES = [
    'Basic', 'Bounce', 'Rotation', 'Slide', 'Fade', 'Blur', 'Creative', 'Flip', 'Fly', 'Stretch', 'Zoom'
];
export const ANIMATIONS: AnimationDefinition[] = [
    // ✅ BASIC
    { id: 'fade-in', name: 'Fade In', category: 'Basic', icon: React.createElement(Eye, { size: 16 }) },
    { id: 'boom', name: 'Boom', category: 'Basic', icon: React.createElement(Maximize, { size: 16 }) },

    // ✅ BOUNCE
    { id: 'bounce-left', name: 'Bounce Left', category: 'Bounce', icon: React.createElement(ArrowRight, { size: 16 }) },
    { id: 'bounce-right', name: 'Bounce Right', category: 'Bounce', icon: React.createElement(ArrowLeft, { size: 16 }) },
    { id: 'bounce-up', name: 'Bounce Up', category: 'Bounce', icon: React.createElement(ArrowUp, { size: 16 }) },
    { id: 'bounce-down', name: 'Bounce Down', category: 'Bounce', icon: React.createElement(ArrowDown, { size: 16 }) },

    // ✅ ROTATION
    { id: 'rotate-cw-1', name: 'Rotate CW', category: 'Rotation', icon: React.createElement(RotateCw, { size: 16 }) },
    { id: 'rotate-ccw', name: 'Rotate CCW', category: 'Rotation', icon: React.createElement(RotateCw, { size: 16, className: "-scale-x-100" }) },
    { id: 'spin-open', name: 'Spin Open', category: 'Rotation', icon: React.createElement(Disc, { size: 16 }) },
    { id: 'spin-1', name: 'Spin 1', category: 'Rotation', icon: React.createElement(RefreshCw, { size: 16 }) },

    // ✅ SLIDE
    { id: 'slide-down-up-1', name: 'Slide Up', category: 'Slide', icon: React.createElement(ArrowUpFromLine, { size: 16 }) },
    { id: 'move-left', name: 'Move Left', category: 'Slide', icon: React.createElement(ChevronsLeft, { size: 16 }) },
    { id: 'move-right', name: 'Move Right', category: 'Slide', icon: React.createElement(ChevronsRight, { size: 16 }) },
    { id: 'move-top', name: 'Move Top', category: 'Slide', icon: React.createElement(ChevronsUp, { size: 16 }) },
    { id: 'move-bottom', name: 'Move Bottom', category: 'Slide', icon: React.createElement(ChevronsDown, { size: 16 }) },

    // ✅ FADE + MOVEMENT
    { id: 'fade-slide-left', name: 'Fade Slide Left', category: 'Fade', icon: React.createElement(MoveHorizontal, { size: 16, className: "opacity-50" }) },
    { id: 'fade-slide-right', name: 'Fade Slide Right', category: 'Fade', icon: React.createElement(MoveHorizontal, { size: 16, className: "opacity-50 scale-x-[-1]" }) },
    { id: 'fade-slide-up', name: 'Fade Slide Up', category: 'Fade', icon: React.createElement(MoveVertical, { size: 16, className: "opacity-50" }) },
    { id: 'fade-slide-down', name: 'Fade Slide Down', category: 'Fade', icon: React.createElement(MoveVertical, { size: 16, className: "opacity-50 scale-y-[-1]" }) },
    { id: 'fade-zoom-in', name: 'Fade Zoom In', category: 'Fade', icon: React.createElement(ZoomIn, { size: 16, className: "opacity-50" }) },
    { id: 'fade-zoom-out', name: 'Fade Zoom Out', category: 'Fade', icon: React.createElement(ZoomOut, { size: 16, className: "opacity-50" }) },

    // ✅ BLUR / FLASH / DISTORTION
    { id: 'motion-blur', name: 'Motion Blur', category: 'Blur', icon: React.createElement(Wind, { size: 16 }) },
    { id: 'blur-in', name: 'Blur In', category: 'Blur', icon: React.createElement(Droplet, { size: 16 }) },
    { id: 'blurry-eject', name: 'Blurry Eject', category: 'Blur', icon: React.createElement(Activity, { size: 16 }) },
    { id: 'flash-drop', name: 'Flash Drop', category: 'Blur', icon: React.createElement(Zap, { size: 16 }) },
    { id: 'flash-open', name: 'Flash Open', category: 'Blur', icon: React.createElement(Sun, { size: 16 }) },
    { id: 'pulse-open', name: 'Pulse Open', category: 'Blur', icon: React.createElement(CircleDot, { size: 16 }) },
    { id: 'screen-flicker', name: 'Screen Flicker', category: 'Blur', icon: React.createElement(Tv, { size: 16 }) },
    { id: 'rgb-drop', name: 'RGB Drop', category: 'Blur', icon: React.createElement(Layers, { size: 16 }) },

    // ✅ CREATIVE
    { id: 'round-open', name: 'Round Open', category: 'Creative', icon: React.createElement(Circle, { size: 16 }) },
    { id: 'expansion', name: 'Expansion', category: 'Creative', icon: React.createElement(Expand, { size: 16 }) },
    { id: 'old-tv', name: 'Old TV', category: 'Creative', icon: React.createElement(Monitor, { size: 16 }) },
    { id: 'shard-roll', name: 'Shard Roll', category: 'Creative', icon: React.createElement(Triangle, { size: 16 }) },
    { id: 'tear-paper', name: 'Tear Paper', category: 'Creative', icon: React.createElement(Scissors, { size: 16 }) },

    // ✅ FLIP
    { id: 'flip-down-1', name: 'Flip Down 1', category: 'Flip', icon: React.createElement(CornerRightDown, { size: 16 }) },
    { id: 'flip-down-2', name: 'Flip Down 2', category: 'Flip', icon: React.createElement(CornerLeftDown, { size: 16 }) },
    { id: 'flip-up-1', name: 'Flip Up 1', category: 'Flip', icon: React.createElement(CornerRightUp, { size: 16 }) },
    { id: 'flip-up-2', name: 'Flip Up 2', category: 'Flip', icon: React.createElement(CornerLeftUp, { size: 16 }) },

    // ✅ FLY / ROTATE / GROW
    { id: 'fly-in-rotate', name: 'Fly In Rotate', category: 'Fly', icon: React.createElement(Send, { size: 16 }) },
    { id: 'fly-in-flip', name: 'Fly In Flip', category: 'Fly', icon: React.createElement(Rocket, { size: 16 }) },
    { id: 'fly-to-zoom', name: 'Fly To Zoom', category: 'Fly', icon: React.createElement(MousePointerClick, { size: 16 }) },
    { id: 'grow-shrink', name: 'Grow Shrink', category: 'Fly', icon: React.createElement(Scale, { size: 16 }) },

    // ✅ STRETCH
    { id: 'stretch-in-left', name: 'Stretch Left', category: 'Stretch', icon: React.createElement(ArrowLeft, { size: 20, strokeWidth: 3 }) },
    { id: 'stretch-in-right', name: 'Stretch Right', category: 'Stretch', icon: React.createElement(MoveRight, { size: 16 }) },
    { id: 'stretch-in-up', name: 'Stretch Up', category: 'Stretch', icon: React.createElement(ArrowUp, { size: 20, strokeWidth: 3 }) },
    { id: 'stretch-in-down', name: 'Stretch Down', category: 'Stretch', icon: React.createElement(ArrowDown, { size: 20, strokeWidth: 3 }) },
    { id: 'stretch-to-full', name: 'Stretch Full', category: 'Stretch', icon: React.createElement(Maximize, { size: 16, className: "scale-125" }) },

    // ✅ ZOOM
    { id: 'tiny-zoom', name: 'Tiny Zoom', category: 'Zoom', icon: React.createElement(Scan, { size: 16 }) },
    { id: 'zoom-in-center', name: 'Zoom Center', category: 'Zoom', icon: React.createElement(Focus, { size: 16 }) },
    { id: 'zoom-in-left', name: 'Zoom Left', category: 'Zoom', icon: React.createElement(ArrowUpLeft, { size: 16 }) },
    { id: 'zoom-in-right', name: 'Zoom Right', category: 'Zoom', icon: React.createElement(ArrowUpRight, { size: 16 }) },
    { id: 'zoom-in-top', name: 'Zoom Top', category: 'Zoom', icon: React.createElement(ArrowDownLeft, { size: 16 }) },
    { id: 'zoom-in-bottom', name: 'Zoom Bottom', category: 'Zoom', icon: React.createElement(ArrowDownRight, { size: 16 }) },
    { id: 'zoom-in-1', name: 'Zoom In', category: 'Zoom', icon: React.createElement(ZoomIn, { size: 16 }) },
    { id: 'zoom-out-1', name: 'Zoom Out', category: 'Zoom', icon: React.createElement(ZoomOut, { size: 16 }) },
    { id: 'wham', name: 'Wham', category: 'Zoom', icon: React.createElement(Target, { size: 16 }) },
];
