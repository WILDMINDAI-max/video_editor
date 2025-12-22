// ============================================
// Type Adapters - Bridge between Plugin & Engine types
// ============================================

import type { TimelineItem, Track, Transition as PluginTransition } from '@/types';
import type {
    CompositorLayer,
    Transform,
    DEFAULT_TRANSFORM,
    GPUTransitionParams
} from './types/engine';

/**
 * Convert a TimelineItem to a CompositorLayer
 */
export function timelineItemToCompositorLayer(
    item: TimelineItem,
    source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | null,
    zIndex: number = 0,
    transitionProgress?: number,
    isOutgoing?: boolean
): CompositorLayer {
    // Build transform from item properties
    const transform: Transform = {
        x: item.x || 0,
        y: item.y || 0,
        scaleX: item.flipH ? -1 : 1,
        scaleY: item.flipV ? -1 : 1,
        rotation: item.rotation || 0,
        opacity: (item.opacity ?? 100) / 100,
        anchorX: 0.5,
        anchorY: 0.5,
    };

    // Map transition type
    let transitionType: string | undefined;
    if (item.transition && item.transition.type !== 'none') {
        transitionType = mapTransitionType(item.transition.type);
    }

    return {
        id: `layer_${item.id}`,
        clipId: item.id,
        texture: null, // Will be created by compositor
        source,
        transform,
        blendMode: 'normal',
        opacity: (item.opacity ?? 100) / 100,
        visible: true,
        zIndex,
        filter: item.filter,
        transitionType,
        transitionProgress,
        isOutgoing,
    };
}

/**
 * Map plugin transition type to GPU transition type
 */
function mapTransitionType(pluginType: string): string {
    // Map common transitions
    const mapping: Record<string, string> = {
        'dissolve': 'crossfade',
        'fade-dissolve': 'crossfade',
        'cross-zoom': 'crossfade',
        'dip-to-black': 'dip-to-black',
        'dip-to-white': 'dip-to-white',
        'slide': 'slide',
        'push': 'push',
        'wipe': 'wipe-left',
        'simple-wipe': 'wipe-left',
    };

    return mapping[pluginType] || 'crossfade';
}

/**
 * Convert plugin transition to GPU transition params
 */
export function transitionToGPUParams(
    transition: PluginTransition,
    progress: number
): GPUTransitionParams {
    const type = mapTransitionType(transition.type) as GPUTransitionParams['type'];

    return {
        type,
        progress,
        direction: (transition.direction === 'left' || transition.direction === 'right' ||
            transition.direction === 'up' || transition.direction === 'down')
            ? transition.direction : 'left',
    };
}

/**
 * Get all visible layers at a specific time from tracks
 */
export function getVisibleLayersAtTime(
    tracks: Track[],
    currentTime: number,
    mediaRefs: { [key: string]: HTMLMediaElement | HTMLImageElement | null }
): {
    layers: Array<{
        item: TimelineItem;
        source: HTMLVideoElement | HTMLImageElement | null;
        zIndex: number;
        transitionProgress?: number;
        isOutgoing?: boolean;
    }>;
} {
    const layers: Array<{
        item: TimelineItem;
        source: HTMLVideoElement | HTMLImageElement | null;
        zIndex: number;
        transitionProgress?: number;
        isOutgoing?: boolean;
    }> = [];

    tracks.forEach((track, trackIndex) => {
        if (track.isHidden || track.type === 'audio') return;

        const zIndexBase = trackIndex * 10;
        const sortedItems = [...track.items].sort((a, b) => a.start - b.start);

        // Find active item at current time
        const activeItem = sortedItems.find(
            item => currentTime >= item.start && currentTime < item.start + item.duration
        );

        if (!activeItem) return;

        // Check for transition
        const transition = activeItem.transition;
        let transitionProgress: number | undefined;
        let outgoingItem: TimelineItem | undefined;

        if (transition && transition.type !== 'none') {
            const timeIntoClip = currentTime - activeItem.start;
            const transitionDuration = transition.duration || 1;

            if (timeIntoClip < transitionDuration) {
                transitionProgress = timeIntoClip / transitionDuration;

                // Find previous item for outgoing
                const activeIndex = sortedItems.indexOf(activeItem);
                if (activeIndex > 0) {
                    outgoingItem = sortedItems[activeIndex - 1];
                }
            }
        }

        // Add outgoing item if in transition
        if (outgoingItem && transitionProgress !== undefined) {
            const source = mediaRefs[outgoingItem.id] as HTMLVideoElement | HTMLImageElement | null;
            layers.push({
                item: outgoingItem,
                source,
                zIndex: zIndexBase,
                transitionProgress,
                isOutgoing: true,
            });
        }

        // Add active item
        const source = mediaRefs[activeItem.id] as HTMLVideoElement | HTMLImageElement | null;
        layers.push({
            item: activeItem,
            source,
            zIndex: zIndexBase + 1,
            transitionProgress,
            isOutgoing: false,
        });
    });

    return { layers };
}

/**
 * Calculate media time from timeline time
 */
export function calculateMediaTime(
    timelineTime: number,
    item: TimelineItem,
    role: 'main' | 'outgoing' = 'main'
): number {
    const speed = item.speed || 1;

    if (role === 'main') {
        return ((timelineTime - item.start) * speed) + item.offset;
    } else {
        // Outgoing: calculate from end of clip
        const clipEnd = item.start + item.duration;
        const timeFromEnd = timelineTime - clipEnd;
        return (item.duration * speed) + item.offset + (timeFromEnd * speed);
    }
}

/**
 * Check if an item is visible at a given time
 */
export function isItemVisibleAtTime(item: TimelineItem, time: number): boolean {
    return time >= item.start && time < item.start + item.duration;
}

/**
 * Get buffer window for pre-loading items
 */
export function getItemsInBufferWindow(
    tracks: Track[],
    currentTime: number,
    bufferBefore: number = 3,
    bufferAfter: number = 2
): TimelineItem[] {
    const items: TimelineItem[] = [];
    const startWindow = currentTime - bufferBefore;
    const endWindow = currentTime + bufferAfter;

    tracks.forEach(track => {
        if (track.type === 'audio') return;

        track.items.forEach(item => {
            // Check if item overlaps with buffer window
            const itemEnd = item.start + item.duration;
            if (item.start <= endWindow && itemEnd >= startWindow) {
                items.push(item);
            }
        });
    });

    return items;
}
