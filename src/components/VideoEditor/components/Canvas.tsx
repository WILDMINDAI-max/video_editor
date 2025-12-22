import React, { useRef, useEffect, useState, useCallback } from 'react';
import { CanvasDimension, Track, TimelineItem, Transition, getAdjustmentStyle, getPresetFilterStyle, BorderStyle, FONTS, getTextEffectStyle } from '@/types';
// GPU-accelerated playback engine
import {
    gpuCompositor,
    frameCache,
    hardwareAccel,
    playbackController,
    initializeEngine,
    calculateMediaTime
} from '@/core';
import { Edit, Eraser, Scissors, Trash2, Crop, FlipHorizontal, FlipVertical, Droplets, Check, X, PaintBucket, Copy, CopyPlus, Lock, MoreHorizontal, Clipboard, ImageIcon, ImageMinus, MessageSquare, AlignCenter, AlignLeft, AlignRight, AlignJustify, AlignStartVertical, AlignEndVertical, AlignCenterVertical, RotateCw, MessageSquarePlus, Unlock, Sparkles, PlayCircle, Palette, Square, Circle, Minus, ChevronRight, ChevronLeft, Plus, Type, List, ListOrdered, Bold, Italic, Underline, Strikethrough, CaseUpper, Wand2 } from 'lucide-react';

interface CanvasProps {
    dimension: CanvasDimension;
    tracks: Track[];
    currentTime: number;
    isPlaying: boolean;
    previewTransition?: Transition | null;
    previewTargetId?: string | null;
    selectedItemId: string | null;

    // Global Interaction Props
    interactionMode: 'none' | 'crop' | 'erase';
    setInteractionMode: (mode: 'none' | 'crop' | 'erase') => void;
    eraserSettings: { size: number; type: 'erase' | 'restore'; showOriginal: boolean };

    onSelectClip: (trackId: string, itemId: string | null) => void;
    onUpdateClip: (trackId: string, item: TimelineItem, skipHistory?: boolean) => void;
    onDeleteClip: (trackId: string, itemId: string) => void;
    onSplitClip: () => void;
    onOpenEditPanel?: (view?: 'main' | 'adjust' | 'eraser' | 'color' | 'animate' | 'text-effects' | 'font') => void;
    onOpenColorPanel?: () => void;
    onCopy: (item: TimelineItem) => void;
    onPaste: (trackId: string) => void;
    onDuplicate: (trackId: string, itemId: string) => void;
    onLock: (trackId: string, itemId: string) => void;
    onDetach: (trackId: string, itemId: string) => void;
    onAlign: (trackId: string, itemId: string, align: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
    scalePercent: number;
    setScalePercent: (scale: number) => void;
    className?: string;
}

const PRESET_COLORS = [
    'transparent', '#ffffff', '#000000', '#ef4444', '#f97316', '#f59e0b',
    '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
    '#d946ef', '#f43f5e', '#71717a'
];

const MAX_RENDER_WIDTH = 1920;

interface RenderItem {
    item: TimelineItem;
    role: 'main' | 'outgoing';
    opacity?: number;
    transition?: Transition;
    transitionProgress?: number;
    zIndexBase: number;
    isBuffered?: boolean;
}

const Canvas: React.FC<CanvasProps> = ({
    dimension, tracks, currentTime, isPlaying,
    previewTransition, previewTargetId, selectedItemId,
    interactionMode, setInteractionMode, eraserSettings,
    onSelectClip, onUpdateClip, onDeleteClip, onSplitClip,
    onOpenEditPanel, onOpenColorPanel,
    onCopy, onPaste, onDuplicate, onLock, onDetach, onAlign,
    scalePercent, setScalePercent, className
}) => {

    const [previewProgress, setPreviewProgress] = useState(0.5);

    // Performance: Calculate render scale
    // If project is 8K (7680px), renderScale will be 0.25 (1920/7680)
    // The internal DOM will be 1920px wide, but displayed at full size via CSS transform
    const renderScale = Math.min(1, MAX_RENDER_WIDTH / dimension.width);
    const renderWidth = dimension.width * renderScale;
    const renderHeight = dimension.height * renderScale;


    // Crop State
    const [cropState, setCropState] = useState<{ x: number, y: number, zoom: number }>({ x: 50, y: 50, zoom: 1 });

    // Text Editing State
    const [isEditingText, setIsEditingText] = useState(false);
    const textInputRef = useRef<HTMLDivElement>(null); // Can be div, ul, or ol

    // Eraser State
    const eraserCanvasRef = useRef<HTMLCanvasElement>(null);
    const compositeCanvasRef = useRef<HTMLCanvasElement>(null);
    const originalImageRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [cursorPos, setCursorPos] = useState<{ x: number, y: number } | null>(null);

    // Drag State for Overlay Items
    const [isDraggingItem, setIsDraggingItem] = useState(false);
    const dragStartRef = useRef<{ x: number, y: number } | null>(null);
    const itemStartPosRef = useRef<{ x: number, y: number } | null>(null);

    // Resize State
    const [isResizing, setIsResizing] = useState(false);
    const resizeStartRef = useRef<{
        startX: number;
        startY: number;
        originalWidth: number;
        originalHeight: number;
        originalX: number;
        originalY: number;
        rotation: number;
        handle: string;
    } | null>(null);

    // Rotate State
    const [isRotating, setIsRotating] = useState(false);
    const rotateCenterRef = useRef<{ cx: number, cy: number } | null>(null);

    // Refs for media elements
    const mediaRefs = useRef<{ [key: string]: HTMLMediaElement | HTMLImageElement | null }>({});
    const mainCanvasRef = useRef<HTMLCanvasElement>(null);

    // Refs for toolbars
    const topToolbarRef = useRef<HTMLDivElement>(null);
    const bottomToolbarRef = useRef<HTMLDivElement>(null);
    const canvasWrapperRef = useRef<HTMLDivElement>(null);

    // GPU Compositor State
    const gpuCanvasRef = useRef<HTMLCanvasElement>(null);
    const [gpuReady, setGpuReady] = useState(false);
    const [gpuInfo, setGpuInfo] = useState<{ name: string; can8K: boolean } | null>(null);

    // Initialize GPU compositor on mount
    useEffect(() => {
        let mounted = true;

        const init = async () => {
            try {
                const result = await initializeEngine();
                if (!mounted) return;

                console.log('[Canvas] GPU Engine initialized:', result);
                setGpuInfo({ name: result.gpuName, can8K: result.can8K });

                // Initialize compositor with GPU canvas if available
                if (gpuCanvasRef.current && result.webgl2) {
                    const success = await gpuCompositor.initialize(gpuCanvasRef.current);
                    if (success) {
                        gpuCompositor.setResolution(renderWidth, renderHeight);
                        setGpuReady(true);
                        console.log('[Canvas] GPU Compositor ready');
                    }
                }
            } catch (error) {
                console.warn('[Canvas] GPU initialization failed, using 2D fallback:', error);
            }
        };

        init();

        return () => {
            mounted = false;
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Update compositor resolution and reinitialize when dimensions change (DOM remounts with new canvas)
    useEffect(() => {
        const reinitCompositor = async () => {
            if (gpuCanvasRef.current) {
                // Reinitialize with the new canvas element after dimension change remount
                const success = await gpuCompositor.initialize(gpuCanvasRef.current);
                if (success) {
                    gpuCompositor.setResolution(renderWidth, renderHeight);
                    setGpuReady(true);
                    console.log('[Canvas] GPU Compositor reinitialized after dimension change');
                } else {
                    setGpuReady(false);
                }
            }
        };

        // Small delay to ensure canvas ref is updated after remount
        const timer = setTimeout(reinitCompositor, 50);
        return () => clearTimeout(timer);
    }, [renderWidth, renderHeight]);

    // Close popups on outside click (checking all toolbars)
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            const inTop = topToolbarRef.current && topToolbarRef.current.contains(target);
            const inBottom = bottomToolbarRef.current && bottomToolbarRef.current.contains(target);

            if (!inTop && !inBottom) {
                // setActivePopup(null); // Removed
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Initialize Crop State when entering crop mode
    useEffect(() => {
        if (interactionMode === 'crop' && selectedItemId) {
            const track = tracks.find(t => t.items.some(i => i.id === selectedItemId));
            const item = track?.items.find(i => i.id === selectedItemId);
            if (item) {
                setCropState(item.crop || { x: 50, y: 50, zoom: 1 });
            }
        }
    }, [interactionMode, selectedItemId, tracks]);

    useEffect(() => {
        if (previewTransition) {
            const start = Date.now();
            const dur = (previewTransition.duration || 1) * 1000;
            const interval = setInterval(() => {
                const elapsed = Date.now() - start;
                const p = (elapsed % dur) / dur;
                setPreviewProgress(p);
            }, 16);
            return () => clearInterval(interval);
        }
    }, [previewTransition]);

    // --- Eraser Helpers ---
    const handleEraserMouseDown = (e: React.MouseEvent, item: TimelineItem) => {
        if (interactionMode !== 'erase') return;
        e.stopPropagation(); e.preventDefault(); setIsDrawing(true); drawEraser(e);
    };
    const handleEraserMouseMove = (e: React.MouseEvent) => {
        if (interactionMode === 'erase') {
            setCursorPos({ x: e.clientX, y: e.clientY });
        }
        if (!isDrawing || interactionMode !== 'erase') return;
        drawEraser(e);
    };
    const handleEraserMouseUp = (trackId: string, item: TimelineItem) => {
        if (interactionMode !== 'erase') return;
        if (isDrawing) {
            setIsDrawing(false);
            if (eraserCanvasRef.current) {
                onUpdateClip(trackId, { ...item, maskImage: eraserCanvasRef.current.toDataURL() });
            }
        }
    };
    const drawEraser = (e: React.MouseEvent) => {
        const maskCanvas = eraserCanvasRef.current;
        const compositeCanvas = compositeCanvasRef.current;
        if (!maskCanvas || !compositeCanvas) return;
        const rect = compositeCanvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (maskCanvas.width / rect.width);
        const y = (e.clientY - rect.top) * (maskCanvas.height / rect.height);
        const radius = eraserSettings.size * (maskCanvas.width / rect.width);
        const ctx = maskCanvas.getContext('2d');
        if (ctx) {
            ctx.globalCompositeOperation = eraserSettings.type === 'erase' ? 'destination-out' : 'source-over';
            ctx.fillStyle = 'white';
            ctx.beginPath(); ctx.arc(x, y, radius / 2, 0, Math.PI * 2); ctx.fill();
            updateCompositeCanvas();
        }
    };
    const updateCompositeCanvas = () => {
        const maskCanvas = eraserCanvasRef.current;
        const compositeCanvas = compositeCanvasRef.current;
        const sourceMedia = originalImageRef.current;
        if (!maskCanvas || !compositeCanvas || !sourceMedia) return;
        const ctx = compositeCanvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, compositeCanvas.width, compositeCanvas.height);
        ctx.globalCompositeOperation = 'source-over';
        if (sourceMedia instanceof HTMLVideoElement) ctx.drawImage(sourceMedia, 0, 0, compositeCanvas.width, compositeCanvas.height);
        else ctx.drawImage(sourceMedia as HTMLImageElement, 0, 0, compositeCanvas.width, compositeCanvas.height);
        if (!eraserSettings.showOriginal) {
            ctx.globalCompositeOperation = 'destination-in';
            ctx.drawImage(maskCanvas, 0, 0, compositeCanvas.width, compositeCanvas.height);
        }
    };
    const initializeEraserCanvas = (item: TimelineItem) => {
        const maskCanvas = eraserCanvasRef.current;
        if (maskCanvas && item) {
            const ctx = maskCanvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
                if (item.maskImage) {
                    const img = new Image();
                    img.onload = () => { ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(img, 0, 0, maskCanvas.width, maskCanvas.height); updateCompositeCanvas(); };
                    img.src = item.maskImage;
                } else {
                    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = 'white'; ctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height); updateCompositeCanvas();
                }
            }
            if (item.type === 'image') {
                const img = new Image(); img.crossOrigin = "anonymous";
                img.onload = () => { originalImageRef.current = img; updateCompositeCanvas(); }; img.src = item.src;
            } else if (item.type === 'video') {
                const vid = document.createElement('video'); vid.crossOrigin = "anonymous"; vid.currentTime = 0;
                vid.onloadeddata = () => { originalImageRef.current = vid; updateCompositeCanvas(); }; vid.src = item.src;
            }
        }
    };
    useEffect(() => {
        if (interactionMode === 'erase' && selectedItemId) {
            const timer = setTimeout(() => {
                const track = tracks.find(t => t.items.some(i => i.id === selectedItemId));
                const item = track?.items.find(i => i.id === selectedItemId);
                if (item) initializeEraserCanvas(item);
            }, 50);
            return () => clearTimeout(timer);
        } else { setCursorPos(null); originalImageRef.current = null; }
    }, [interactionMode, selectedItemId]);
    useEffect(() => { if (interactionMode === 'erase') updateCompositeCanvas(); }, [eraserSettings.showOriginal]);

    // --- Helpers for Crop, Drag & Resize ---
    const handleCropDrag = (e: React.MouseEvent) => {
        if (interactionMode !== 'crop' && e.buttons !== 1) return;
        const deltaX = e.movementX; const deltaY = e.movementY; const speed = 0.2;
        setCropState(prev => ({ ...prev, x: Math.max(0, Math.min(100, prev.x - deltaX * speed)), y: Math.max(0, Math.min(100, prev.y - deltaY * speed)) }));
    };
    const saveCrop = (trackId: string, item: TimelineItem) => { onUpdateClip(trackId, { ...item, crop: cropState }); setInteractionMode('none'); };

    const handleItemMouseDown = (e: React.MouseEvent, item: TimelineItem) => {
        e.stopPropagation();
        onSelectClip(item.trackId, item.id);
        if (interactionMode === 'erase') { handleEraserMouseDown(e, item); return; }
        if (item.isLocked || item.isBackground || isResizing || isRotating || isEditingText) return;

        // Handle Double Click for Text to Edit
        if (item.type === 'text' && e.detail === 2) {
            setIsEditingText(true);
            setTimeout(() => {
                if (textInputRef.current) {
                    textInputRef.current.focus();
                    // Place cursor at end (simplified)
                    const range = document.createRange();
                    const sel = window.getSelection();
                    range.selectNodeContents(textInputRef.current);
                    range.collapse(false);
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                }
            }, 0);
            return;
        }

        setIsDraggingItem(true); dragStartRef.current = { x: e.clientX, y: e.clientY }; itemStartPosRef.current = { x: item.x || 0, y: item.y || 0 };
    };

    const handleItemDrag = (e: React.MouseEvent) => {
        if (!isDraggingItem || !dragStartRef.current || !itemStartPosRef.current || !selectedItemId || isResizing || isRotating) return;
        const currentScaleVal = scalePercent === 0 ? (Math.min((window.innerWidth - 400) / dimension.width, (window.innerHeight - 400) / dimension.height) * 0.85) : scalePercent / 100;
        const canvasWidthPx = dimension.width * currentScaleVal; const canvasHeightPx = dimension.height * currentScaleVal;
        const deltaX_px = e.clientX - dragStartRef.current.x; const deltaY_px = e.clientY - dragStartRef.current.y;
        const deltaX_pct = (deltaX_px / canvasWidthPx) * 100; const deltaY_pct = (deltaY_px / canvasHeightPx) * 100;
        const track = tracks.find(t => t.items.some(i => i.id === selectedItemId)); const item = track?.items.find(i => i.id === selectedItemId);
        if (item && track) { onUpdateClip(track.id, { ...item, x: (itemStartPosRef.current.x + deltaX_pct), y: (itemStartPosRef.current.y + deltaY_pct) }, true); }
    };

    const handleResizeMouseDown = (e: React.MouseEvent, item: TimelineItem, handle: string) => {
        e.stopPropagation(); e.preventDefault(); if (item.isLocked) return; setIsResizing(true);
        resizeStartRef.current = { startX: e.clientX, startY: e.clientY, originalWidth: item.width || 40, originalHeight: item.height || 22.5, originalX: item.x || 0, originalY: item.y || 0, rotation: item.rotation || 0, handle };
    };

    const handleResizeDrag = (e: React.MouseEvent) => {
        if (!isResizing || !resizeStartRef.current || !selectedItemId || !canvasWrapperRef.current) return;
        const track = tracks.find(t => t.items.some(i => i.id === selectedItemId)); const item = track?.items.find(i => i.id === selectedItemId);
        if (!item || !track) return;
        const { startX, startY, originalWidth, originalHeight, originalX, originalY, rotation, handle } = resizeStartRef.current;
        const rect = canvasWrapperRef.current.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const rawDeltaX = e.clientX - startX; const rawDeltaY = e.clientY - startY;
        const rad = rotation * (Math.PI / 180); const cos = Math.cos(rad); const sin = Math.sin(rad);

        // Project mouse movement onto item axes (in pixels)
        const localDeltaXPixels = (rawDeltaX * cos) + (rawDeltaY * sin);
        const localDeltaYPixels = (rawDeltaY * cos) - (rawDeltaX * sin);

        // Convert local delta to percentage of canvas dimensions
        const deltaX = (localDeltaXPixels / rect.width) * 100;
        const deltaY = (localDeltaYPixels / rect.height) * 100;

        let newW = originalWidth; let newH = originalHeight;
        let dCenterXPixels = 0; let dCenterYPixels = 0;

        // Calculate new dimensions and center shift (in pixels) based on handle
        if (handle.includes('e')) {
            newW = Math.max(1, originalWidth + deltaX);
            // We use the actual change in width (converted to pixels) to determine shift
            const actualDeltaXPixels = ((newW - originalWidth) / 100) * rect.width;
            dCenterXPixels = actualDeltaXPixels / 2;
        } else if (handle.includes('w')) {
            newW = Math.max(1, originalWidth - deltaX);
            const actualDeltaXPixels = ((newW - originalWidth) / 100) * rect.width;
            dCenterXPixels = -actualDeltaXPixels / 2;
        }

        if (handle.includes('s')) {
            newH = Math.max(1, originalHeight + deltaY);
            const actualDeltaYPixels = ((newH - originalHeight) / 100) * rect.height;
            dCenterYPixels = actualDeltaYPixels / 2;
        } else if (handle.includes('n')) {
            newH = Math.max(1, originalHeight - deltaY);
            const actualDeltaYPixels = ((newH - originalHeight) / 100) * rect.height;
            dCenterYPixels = -actualDeltaYPixels / 2;
        }

        // Rotate the center shift vector back to world space (pixels)
        const worldShiftXPixels = dCenterXPixels * cos - dCenterYPixels * sin;
        const worldShiftYPixels = dCenterXPixels * sin + dCenterYPixels * cos;

        // Convert world shift to percentage
        const worldShiftX = (worldShiftXPixels / rect.width) * 100;
        const worldShiftY = (worldShiftYPixels / rect.height) * 100;

        // For text, if we resize height, we might want to unset auto-height behavior or just let it clip/scroll?
        // Usually text boxes in design tools: width changes wrapping, height changes cropping or spacing.
        // For now, we update height. If it was auto, it will now be fixed % which is fine.
        onUpdateClip(track.id, { ...item, width: newW, height: item.type === 'text' ? undefined : newH, x: originalX + worldShiftX, y: originalY + worldShiftY }, true);
    };

    const handleRotateMouseDown = (e: React.MouseEvent, item: TimelineItem) => {
        e.stopPropagation(); e.preventDefault(); if (item.isLocked) return; setIsRotating(true);
        if (canvasWrapperRef.current) {
            const rect = canvasWrapperRef.current.getBoundingClientRect();
            rotateCenterRef.current = { cx: rect.left + rect.width / 2 + ((item.x || 0) / 100 * rect.width), cy: rect.top + rect.height / 2 + ((item.y || 0) / 100 * rect.height) };
        }
    };

    const handleRotateDrag = (e: React.MouseEvent) => {
        if (!isRotating || !rotateCenterRef.current || !selectedItemId) return;
        const { cx, cy } = rotateCenterRef.current;
        const dx = e.clientX - cx; const dy = e.clientY - cy;
        const degs = Math.atan2(dy, dx) * (180 / Math.PI);
        const track = tracks.find(t => t.items.some(i => i.id === selectedItemId)); const item = track?.items.find(i => i.id === selectedItemId);
        if (item && track) { onUpdateClip(track.id, { ...item, rotation: degs - 90 }, true); }
    };

    // --- Rendering Logic ---
    const renderItems = React.useMemo(() => {
        const active: RenderItem[] = [];

        tracks.forEach((track, trackIndex) => {
            if (track.isHidden) return;
            const zIndexBase = trackIndex * 10;

            if (track.type === 'video' || track.type === 'overlay') {
                const sortedItems = [...track.items].sort((a, b) => a.start - b.start);

                // 1. Find the item that *should* be playing at currentTime (Main Item)
                const mainItemIndex = sortedItems.findIndex(i => currentTime >= i.start && currentTime < i.start + i.duration);
                const mainItem = mainItemIndex !== -1 ? sortedItems[mainItemIndex] : undefined;

                // 2. Find the *next* item (for Prefix/Overlap-Left checks)
                // If mainItem exists, next is mainItemIndex + 1. If not, find first item starting after currentTime.
                let nextItemIndex = -1;
                if (mainItem) {
                    nextItemIndex = mainItemIndex + 1;
                } else {
                    nextItemIndex = sortedItems.findIndex(i => i.start > currentTime);
                }
                const nextItem = (nextItemIndex !== -1 && nextItemIndex < sortedItems.length) ? sortedItems[nextItemIndex] : undefined;

                let isTransitioning = false;
                let transition: Transition | undefined;
                let progress = 0;
                let outgoingItem: TimelineItem | undefined;
                let incomingItem: TimelineItem | undefined;

                // --- CHECK 1: Incoming Transition on Main Item (Postfix / Overlap-Right) ---
                if (mainItem) {
                    let t = mainItem.transition;
                    if (previewTransition && previewTargetId === mainItem.id) t = previewTransition;

                    if (t && t.type !== 'none') {
                        const timing = t.timing || 'postfix';
                        const timeIntoClip = currentTime - mainItem.start;

                        let transStart = 0;
                        if (timing === 'postfix') transStart = 0;
                        else if (timing === 'overlap') transStart = -t.duration / 2;
                        else if (timing === 'prefix') transStart = -t.duration;

                        // Check if we are in the transition window
                        // CRITICAL: Using <= to include exact end moment (p=1.0)
                        if (timeIntoClip >= transStart && timeIntoClip <= transStart + t.duration) {
                            isTransitioning = true;
                            transition = t;
                            progress = (timeIntoClip - transStart) / t.duration;
                            incomingItem = mainItem;
                            if (mainItemIndex > 0) outgoingItem = sortedItems[mainItemIndex - 1];
                        }
                    }
                }

                // --- CHECK 2: Outgoing Transition on Next Item (Prefix / Overlap-Left) ---
                // Only check if we haven't already found an active transition
                if (!isTransitioning && nextItem) {
                    let t = nextItem.transition;
                    if (previewTransition && previewTargetId === nextItem.id) t = previewTransition;

                    if (t && t.type !== 'none') {
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
                                // Calculate progress
                                // Start time relative to nextItem.start: -transDurationBeforeStart
                                // Current time relative to nextItem.start: -timeUntilNext
                                // Progress = (Current - Start) / Duration
                                // = (-timeUntilNext - (-transDurationBeforeStart)) / Duration
                                progress = (transDurationBeforeStart - timeUntilNext) / t.duration;

                                incomingItem = nextItem;
                                if (nextItemIndex > 0) outgoingItem = sortedItems[nextItemIndex - 1];
                            }
                        }
                    }
                }

                // --- RENDER ---
                if (isTransitioning && transition && incomingItem) {
                    // Render Outgoing (if exists)
                    if (outgoingItem) {
                        active.push({ item: outgoingItem, role: 'outgoing', zIndexBase, transition, transitionProgress: progress });
                    }
                    // Render Incoming (Main)
                    active.push({ item: incomingItem, role: 'main', transition, transitionProgress: progress, zIndexBase });
                } else if (mainItem) {
                    // No transition, just render main item
                    active.push({ item: mainItem, role: 'main', zIndexBase });
                } else if (nextItem && currentTime >= nextItem.start - 0.05) {
                    // FALLBACK: If approaching next clip but no main item, show next clip early
                    // This prevents black/white gaps at transition boundaries
                    active.push({ item: nextItem, role: 'main', zIndexBase });
                }

            } else {
                // Non-video tracks (simple render)
                const activeItems = track.items.filter(i => currentTime >= i.start && currentTime < i.start + i.duration);
                activeItems.forEach(item => { active.push({ item, role: 'main', zIndexBase }); });
            }
        });
        return active;
    }, [tracks, currentTime, previewTransition, previewTargetId]);

    // --- Buffered Items (Pre-mount nearby videos) ---
    const bufferedItems = React.useMemo(() => {
        const buffered: RenderItem[] = [];
        const renderedIds = new Set(renderItems.map(r => r.item.id));

        tracks.forEach((track, trackIndex) => {
            if (track.type !== 'video' || track.isHidden) return;
            track.items.forEach(item => {
                if (item.type !== 'video' && item.type !== 'image') return; // Only buffer heavy media
                if (renderedIds.has(item.id)) return;

                // Buffer window: 10 seconds before and 3 seconds after for aggressive pre-loading
                // Increased from 5s to 10s to prevent pauses after transitions
                if (currentTime >= item.start - 10 && currentTime < item.start + item.duration + 3) {
                    buffered.push({ item, role: 'main', zIndexBase: trackIndex * 10, isBuffered: true });
                }
            });
        });
        return buffered;
    }, [tracks, currentTime, renderItems]);
    // Use a ref to store the latest renderItems to avoid re-running the effect every frame
    const latestRenderItems = useRef(renderItems);
    latestRenderItems.current = renderItems;

    // Cache for video frames to prevent black screens/flickering when decoding lags
    const videoCacheRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());

    // Use a ref to store the latest bufferedItems
    const latestBufferedItems = useRef(bufferedItems);
    latestBufferedItems.current = bufferedItems;

    // --- Canvas Rendering Engine ---
    useEffect(() => {
        let animationFrameId: number;

        const render = () => {
            const canvas = mainCanvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Clear 2D canvas (used for overlay/fallback)
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Combine active and buffered items for processing
            const allItems = [
                ...latestRenderItems.current.map(i => ({ ...i, isBuffered: false })),
                ...latestBufferedItems.current.map(i => ({ ...i, isBuffered: true }))
            ];

            // --- GPU Compositor Rendering ---
            // If GPU compositor is ready, render video/image layers via GPU for smooth playback
            if (gpuReady) {
                // Clear GPU canvas at start of frame
                gpuCompositor.clear();

                // Render each video/image layer through GPU
                allItems.forEach(obj => {
                    const { item, isBuffered } = obj;
                    if (isBuffered) return;
                    if (item.type !== 'video' && item.type !== 'image') return;

                    // Skip animated items - they need DOM for CSS animations
                    if (item.animation) return;

                    // Skip transitioning items - they need DOM for CSS transitions
                    if ('transition' in obj && obj.transition) return;

                    const mediaEl = mediaRefs.current[item.id];
                    if (!mediaEl) return;

                    // Check if media is ready
                    if (mediaEl instanceof HTMLVideoElement && mediaEl.readyState < 2) return;
                    if (mediaEl instanceof HTMLImageElement && !mediaEl.complete) return;

                    // Calculate transform for this item
                    const transform = {
                        x: (item.x || 0) / 100 * canvas.width,
                        y: (item.y || 0) / 100 * canvas.height,
                        scaleX: item.flipH ? -1 : 1,
                        scaleY: item.flipV ? -1 : 1,
                        rotation: item.rotation || 0,
                        opacity: (item.opacity ?? 100) / 100,
                        anchorX: 0.5,
                        anchorY: 0.5,
                    };

                    // Render layer through GPU compositor
                    gpuCompositor.renderLayer(
                        mediaEl as HTMLVideoElement | HTMLImageElement,
                        transform,
                        transform.opacity
                    );

                    // Cache frame for seeking (prevents black screens)
                    if (mediaEl instanceof HTMLVideoElement) {
                        frameCache.warmCache(item.id, mediaEl.currentTime, mediaEl);
                    }
                });
            }

            // --- 2D Canvas Rendering (Non-GPU items and fallback) ---
            // When GPU is ready, video/image items are rendered via WebGL - skip them in 2D canvas
            // This prevents double-rendering and improves performance

            // Draw items
            allItems.forEach(obj => {
                const { item, role, transition, transitionProgress, isBuffered } = obj;
                const type = item.type as string;

                // Always skip audio, text, color (rendered via DOM)
                if (type === 'audio' || type === 'text' || type === 'color') return;

                // Skip animated items (rendered via DOM with CSS animations)
                if (item.animation) return;

                // PERFORMANCE: When GPU is ready, skip NON-ANIMATED, NON-TRANSITIONING video/image - they're rendered via WebGL
                // IMPORTANT: Animated or transitioning videos/images stay in DOM so CSS effects work
                if (gpuReady && !item.animation && !transition && (type === 'video' || type === 'image')) return;

                const mediaEl = mediaRefs.current[item.id];
                if (!mediaEl) return;

                // Check if media is ready
                if (mediaEl instanceof HTMLImageElement && !mediaEl.complete) return;

                ctx.save();

                // 1. Calculate Position & Size
                const cx = (canvas.width / 2) + ((item.x || 0) / 100 * canvas.width);
                const cy = (canvas.height / 2) + ((item.y || 0) / 100 * canvas.height);

                let w = 0;
                let h = 0;

                if (item.isBackground) {
                    // Calculate Aspect Ratio
                    let mediaAspect = 1;
                    if (mediaEl instanceof HTMLVideoElement) {
                        mediaAspect = mediaEl.videoWidth / mediaEl.videoHeight;
                    } else if (mediaEl instanceof HTMLImageElement) {
                        mediaAspect = mediaEl.naturalWidth / mediaEl.naturalHeight;
                    }

                    const canvasAspect = canvas.width / canvas.height;
                    const fitMode = item.fit || 'cover';

                    if (fitMode === 'contain') {
                        if (mediaAspect > canvasAspect) {
                            w = canvas.width;
                            h = canvas.width / mediaAspect;
                        } else {
                            h = canvas.height;
                            w = canvas.height * mediaAspect;
                        }
                    } else if (fitMode === 'fill') {
                        w = canvas.width;
                        h = canvas.height;
                    } else { // cover (default)
                        if (mediaAspect > canvasAspect) {
                            h = canvas.height;
                            w = canvas.height * mediaAspect;
                        } else {
                            w = canvas.width;
                            h = canvas.width / mediaAspect;
                        }
                    }
                } else {
                    if (item.width) w = (item.width / 100) * canvas.width;
                    else w = canvas.width; // Fallback

                    if (item.height) h = (item.height / 100) * canvas.height;
                    else {
                        if (mediaEl instanceof HTMLVideoElement) {
                            const aspect = mediaEl.videoWidth / mediaEl.videoHeight;
                            h = w / aspect;
                        } else if (mediaEl instanceof HTMLImageElement) {
                            const aspect = mediaEl.naturalWidth / mediaEl.naturalHeight;
                            h = w / aspect;
                        } else {
                            h = canvas.height;
                        }
                    }
                }

                // --- CANVAS TRANSITION HANDLING ---
                if (transition && transitionProgress !== undefined) {
                    const p = transitionProgress;
                    const { type: tType, direction } = transition;

                    // Direction Multipliers
                    let xMult = 1; let yMult = 0;
                    if (direction === 'right') { xMult = -1; yMult = 0; }
                    else if (direction === 'up') { xMult = 0; yMult = 1; }
                    else if (direction === 'down') { xMult = 0; yMult = -1; }

                    // Apply Transition Effects
                    switch (tType) {
                        // Dissolves
                        case 'dissolve':
                        case 'film-dissolve':
                        case 'cross-zoom': // Fallback to dissolve for complex zoom
                        case 'fade-dissolve':
                        case 'luma-dissolve':
                        case 'fade-color':
                            ctx.globalAlpha *= (role === 'main' ? p : 1 - p);
                            break;

                        case 'dip-to-black':
                            if (role === 'outgoing') ctx.globalAlpha *= (p < 0.5 ? 1 - (p * 2) : 0);
                            if (role === 'main') ctx.globalAlpha *= (p > 0.5 ? (p - 0.5) * 2 : 0);
                            break;

                        // Slides & Pushes
                        case 'slide':
                        case 'push':
                        case 'whip':
                        case 'band-slide':
                        case 'smooth-wipe': // Fallback
                            if (role === 'main') {
                                ctx.translate(xMult * canvas.width * (1 - p), yMult * canvas.height * (1 - p));
                            } else if (tType === 'push' || tType === 'whip') {
                                // Push moves outgoing too
                                ctx.translate(xMult * -canvas.width * p, yMult * -canvas.height * p);
                            }
                            break;

                        // Wipes (Clipping)
                        case 'wipe':
                        case 'simple-wipe':
                            const wipeP = p;
                            ctx.beginPath();
                            if (direction === 'right') ctx.rect(0, 0, canvas.width * wipeP, canvas.height); // Wipe Right (Left to Right?) - wait, direction usually means "Wipe TO Right" or "From Left"?
                            // Standard Wipe Right: Reveals from Left to Right.
                            // If direction='right', it usually means the line moves right.
                            // Let's assume standard:
                            else if (direction === 'left') ctx.rect(canvas.width * (1 - wipeP), 0, canvas.width * wipeP, canvas.height);
                            else if (direction === 'down') ctx.rect(0, 0, canvas.width, canvas.height * wipeP);
                            else if (direction === 'up') ctx.rect(0, canvas.height * (1 - wipeP), canvas.width, canvas.height * wipeP);
                            else ctx.rect(0, 0, canvas.width * wipeP, canvas.height); // Default

                            if (role === 'main') ctx.clip();
                            // For outgoing, we don't clip, it just stays underneath? Or we clip inverse?
                            // Usually Main is on top. If Main is clipped, Outgoing shows below.
                            break;

                        // Fallback for others (Dissolve)
                        default:
                            ctx.globalAlpha *= (role === 'main' ? p : 1 - p);
                            break;
                    }
                }

                // 2. Apply Transformations
                ctx.translate(cx, cy);
                ctx.rotate((item.rotation || 0) * Math.PI / 180);
                ctx.scale(item.flipH ? -1 : 1, item.flipV ? -1 : 1);
                if (item.crop && item.isBackground && item.crop.zoom > 1) {
                    ctx.scale(item.crop.zoom, item.crop.zoom);
                }

                // 3. Apply Opacity & Filter
                // For buffered items, we want to update cache but NOT draw to main canvas
                if (isBuffered) {
                    ctx.globalAlpha = 0; // Don't draw to main canvas
                } else {
                    ctx.globalAlpha = (item.opacity ?? 100) / 100;
                }

                let filterStr = '';
                if (item.filter && item.filter !== 'none') {
                    const preset = getPresetFilterStyle(item.filter);
                    if (preset) filterStr += preset + ' ';
                }
                if (item.adjustments) {
                    const adjStyle = getAdjustmentStyle(item, renderScale);
                    if (adjStyle) filterStr += adjStyle + ' ';
                }
                ctx.filter = filterStr.trim();

                // 4. Draw
                try {
                    if (mediaEl instanceof HTMLVideoElement) {
                        // --- Video Caching Logic ---
                        let cacheCanvas = videoCacheRefs.current.get(item.id);
                        if (!cacheCanvas) {
                            cacheCanvas = document.createElement('canvas');
                            cacheCanvas.width = canvas.width;
                            cacheCanvas.height = canvas.height;
                            videoCacheRefs.current.set(item.id, cacheCanvas);
                        }

                        if (cacheCanvas.width !== canvas.width || cacheCanvas.height !== canvas.height) {
                            cacheCanvas.width = canvas.width;
                            cacheCanvas.height = canvas.height;
                        }

                        const cacheCtx = cacheCanvas.getContext('2d');

                        // Always try to update cache if we have data
                        if (mediaEl.readyState >= 2 && cacheCtx) {
                            cacheCtx.drawImage(mediaEl, 0, 0, cacheCanvas.width, cacheCanvas.height);
                        }

                        // Draw from cache to main canvas (unless buffered/invisible)
                        if (!isBuffered) {
                            ctx.drawImage(cacheCanvas, -w / 2, -h / 2, w, h);
                        }

                    } else {
                        if (!isBuffered) {
                            ctx.drawImage(mediaEl as CanvasImageSource, -w / 2, -h / 2, w, h);
                        }
                    }
                } catch (e) { }

                ctx.restore();
            });

            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => cancelAnimationFrame(animationFrameId);
    }, [renderScale, dimension]);

    // --- Playback Synchronization ---
    // Optimized: During playback, let video elements play natively without constant seeking
    // Only sync on: initial play, pause, scrub, or clip change
    const lastSyncTimeRef = useRef<number>(0);
    const isPlayingRef = useRef(isPlaying);
    isPlayingRef.current = isPlaying;

    // Sync video elements (called sparingly, not every frame)
    const syncMediaElements = useCallback((targetTime: number, forceSeek: boolean = false) => {
        [...renderItems, ...bufferedItems].forEach(({ item, role, isBuffered }) => {
            if (item.type !== 'video' && item.type !== 'audio') return;

            const keys = [item.id];
            if (item.type === 'video') keys.push(item.id + '_filter');

            keys.forEach(key => {
                const mediaEl = mediaRefs.current[key];
                if (!(mediaEl instanceof HTMLMediaElement)) return;

                const speed = item.speed || 1;
                let mediaTime: number;

                // Calculate target time
                if (isBuffered && targetTime < item.start) {
                    mediaTime = item.offset;
                } else {
                    mediaTime = role === 'main'
                        ? ((targetTime - item.start) * speed) + item.offset
                        : (item.duration * speed) + item.offset + ((targetTime - (item.start + item.duration)) * speed);
                }

                // Clamp time
                if (mediaTime < 0) mediaTime = 0;
                if (Number.isFinite(mediaEl.duration) && mediaTime >= mediaEl.duration) {
                    mediaTime = Math.max(0, mediaEl.duration - 0.01);
                }

                // Only seek if drift is significant, or if forced
                const drift = Math.abs(mediaEl.currentTime - mediaTime);
                const syncThreshold = forceSeek ? 0.033 : (isPlayingRef.current ? 0.25 : 0.05);

                if (drift > syncThreshold) {
                    mediaEl.currentTime = mediaTime;
                }

                // Playback rate
                if (Math.abs(mediaEl.playbackRate - speed) > 0.01) {
                    mediaEl.playbackRate = speed;
                }

                // Volume
                mediaEl.muted = item.muteVideo || (item.volume === 0);
                mediaEl.volume = item.muteVideo ? 0 : ((item.volume ?? 100) / 100);
            });
        });
    }, [renderItems, bufferedItems]);

    // Handle play/pause state changes - this is the key optimization
    useEffect(() => {
        const activeVideoItems = [...renderItems, ...bufferedItems].filter(
            ({ item, isBuffered }) => (item.type === 'video' || item.type === 'audio') && !isBuffered
        );

        if (isPlaying) {
            // Starting playback: sync once, then let videos play
            syncMediaElements(currentTime, true);

            // Start all active videos
            activeVideoItems.forEach(({ item }) => {
                const keys = [item.id];
                if (item.type === 'video') keys.push(item.id + '_filter');

                keys.forEach(key => {
                    const mediaEl = mediaRefs.current[key];
                    if (mediaEl instanceof HTMLMediaElement && mediaEl.paused) {
                        mediaEl.play().catch(() => { });
                    }
                });
            });
        } else {
            // Pause all videos
            activeVideoItems.forEach(({ item }) => {
                const keys = [item.id];
                if (item.type === 'video') keys.push(item.id + '_filter');

                keys.forEach(key => {
                    const mediaEl = mediaRefs.current[key];
                    if (mediaEl instanceof HTMLMediaElement && !mediaEl.paused) {
                        mediaEl.pause();
                    }
                });
            });
        }
    }, [isPlaying]); // Only trigger on play/pause change

    // Handle time changes when NOT playing (scrubbing)
    useEffect(() => {
        if (!isPlaying) {
            // When scrubbing, sync immediately
            syncMediaElements(currentTime, true);
        }
    }, [currentTime, isPlaying, syncMediaElements]);

    // Handle clip changes during playback (e.g., new clip comes into view)
    useEffect(() => {
        if (isPlaying) {
            // New render items appeared - start playing them
            renderItems.forEach(({ item, role }) => {
                if (item.type !== 'video' && item.type !== 'audio') return;

                // OPTIMIZATION: During transitions, only sync the main (incoming) video
                // This prevents pause/stutter when both videos try to sync simultaneously
                if (role === 'outgoing') {
                    // Outgoing video just keeps playing, no sync needed
                    const keys = [item.id];
                    if (item.type === 'video') keys.push(item.id + '_filter');
                    keys.forEach(key => {
                        const mediaEl = mediaRefs.current[key];
                        if (mediaEl instanceof HTMLMediaElement && mediaEl.paused) {
                            mediaEl.play().catch(() => { });
                        }
                    });
                    return;
                }

                const keys = [item.id];
                if (item.type === 'video') keys.push(item.id + '_filter');

                keys.forEach(key => {
                    const mediaEl = mediaRefs.current[key];
                    if (mediaEl instanceof HTMLMediaElement) {
                        // Sync position - increased threshold to 0.2s to prevent constant seeking
                        // Lower threshold was causing playback interruptions
                        const speed = item.speed || 1;
                        const mediaTime = ((currentTime - item.start) * speed) + item.offset;
                        if (Math.abs(mediaEl.currentTime - mediaTime) > 0.2) {
                            mediaEl.currentTime = Math.max(0, mediaTime);
                        }
                        // Start playing if not already - AGGRESSIVE playback to prevent pauses
                        if (mediaEl.paused) {
                            mediaEl.playbackRate = speed;
                            mediaEl.play().catch(() => { });
                        }
                        // CRITICAL: Ensure playback continues even if already playing
                        // This prevents post-transition pauses
                        if (mediaEl.readyState >= 2 && mediaEl.paused === false && mediaEl.playbackRate !== speed) {
                            mediaEl.playbackRate = speed;
                        }
                    }
                });
            });
        }
    }, [renderItems.map(r => r.item.id).join(',')]); // Trigger when visible clips change

    // --- Auto-Calculate Height for Aspect Ratio ---
    useEffect(() => {
        tracks.forEach(track => {
            track.items.forEach(item => {
                if ((item.type === 'video' || item.type === 'image') && !item.isBackground && item.width && !item.height) {
                    const el = mediaRefs.current[item.id];
                    if (el) {
                        let aspect = 0;
                        if (el instanceof HTMLVideoElement && el.videoWidth) aspect = el.videoWidth / el.videoHeight;
                        if (el instanceof HTMLImageElement && el.naturalWidth) aspect = el.naturalWidth / el.naturalHeight;

                        if (aspect) {
                            const canvasAspect = dimension.width / dimension.height;
                            const hPct = item.width * canvasAspect / aspect;
                            // Update without history to avoid undo stack pollution for auto-calc
                            onUpdateClip(track.id, { ...item, height: hPct }, true);
                        }
                    }
                }
            });
        });
    }, [tracks, dimension]);

    const [fitScale, setFitScale] = useState(0.5);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const scale = Math.min((window.innerWidth - 400) / dimension.width, (window.innerHeight - 400) / dimension.height) * 0.85;
            setFitScale(scale);
        }
    }, [dimension]);

    const currentScale = scalePercent === 0 ? Math.max(0.2, fitScale) : scalePercent / 100;

    const getItemPositionAndTransform = (item: TimelineItem) => {
        const crop = (interactionMode === 'crop' && selectedItemId === item.id) ? cropState : (item.crop || { x: 50, y: 50, zoom: 1 });

        let left: string | number | undefined = item.isBackground ? 0 : `${50 + (item.x || 0)}%`;
        let top: string | number | undefined = item.isBackground ? 0 : `${50 + (item.y || 0)}%`;
        let right: string | number | undefined = undefined;
        let bottom: string | number | undefined = undefined;
        let tx = '-50%';
        let ty = '-50%';

        if (!item.isBackground && item.type === 'text') {
            if (item.textAlign === 'left') tx = '0%';
            else if (item.textAlign === 'right') { tx = '0%'; left = undefined; right = `${50 - (item.x || 0)}%`; }

            if (item.verticalAlign === 'top') ty = '0%';
            else if (item.verticalAlign === 'bottom') { ty = '0%'; top = undefined; bottom = `${50 - (item.y || 0)}%`; }
        }

        const transforms = [];
        if (!item.isBackground) transforms.push(`translate(${tx}, ${ty})`);
        if (item.flipH) transforms.push('scaleX(-1)');
        if (item.flipV) transforms.push('scaleY(-1)');
        if (item.rotation) transforms.push(`rotate(${item.rotation}deg)`);
        // REMOVED: if (crop.zoom > 1 && item.isBackground) transforms.push(`scale(${crop.zoom})`);

        return {
            style: { left, top, right, bottom },
            transform: transforms.join(' ')
        };
    };

    const getTransitionStyle = (itemObj: typeof renderItems[0]) => {
        if (!itemObj.transition || itemObj.transitionProgress === undefined) return {};
        const { type, direction } = itemObj.transition;
        const p = itemObj.transitionProgress;
        const role = itemObj.role;

        // Direction Multipliers
        let xMult = 1; let yMult = 0;
        if (direction === 'right') { xMult = -1; yMult = 0; }
        else if (direction === 'up') { xMult = 0; yMult = 1; }
        else if (direction === 'down') { xMult = 0; yMult = -1; }

        switch (type) {
            // --- Dissolves ---
            case 'dissolve':
                // Professional cross-dissolve with gamma correction (like Premiere Pro)
                const dissolveEase = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
                if (role === 'main') {
                    return {
                        opacity: Math.max(0.01, dissolveEase),
                        filter: `brightness(${0.98 + dissolveEase * 0.02})`,
                        zIndex: 20
                    };
                } else {
                    return {
                        opacity: Math.max(0.01, 1 - dissolveEase),
                        filter: `brightness(${1 - (1 - dissolveEase) * 0.02})`,
                        zIndex: 10
                    };
                }
            case 'film-dissolve':
                // Film-style dissolve with grain, saturation, and sepia (like Premiere Pro Film Dissolve)
                const filmP = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
                const grain = Math.sin(p * 100) * 0.015; // Simulated film grain
                if (role === 'main') {
                    return {
                        opacity: Math.max(0.01, filmP),
                        filter: `contrast(${1.05 + grain}) saturate(${0.95 + filmP * 0.05}) sepia(${(1 - filmP) * 0.08})`,
                        zIndex: 20
                    };
                } else {
                    return {
                        opacity: Math.max(0.01, 1 - filmP),
                        filter: `contrast(${1.05 + grain}) saturate(${1 - (1 - filmP) * 0.05}) sepia(${filmP * 0.08})`,
                        zIndex: 10
                    };
                }
            case 'additive-dissolve':
                return role === 'main'
                    ? { opacity: p, mixBlendMode: 'plus-lighter' as any }
                    : { opacity: 1 - p, mixBlendMode: 'plus-lighter' as any };
            case 'dip-to-black':
                // Professional dip-to-black (like Premiere Pro): fade to black, then fade from black
                if (role === 'outgoing') {
                    if (p < 0.5) {
                        const fadeOut = p * 2; // 0 -> 1 in first half
                        const easeOut = Math.pow(fadeOut, 2); // Quadratic ease-in
                        return {
                            opacity: Math.max(0.05, 1 - easeOut),
                            filter: `brightness(${1 - fadeOut * 0.6})`, // Darken while fading
                            zIndex: 10
                        };
                    } else {
                        return { opacity: 0.05, zIndex: 10 };
                    }
                }
                if (role === 'main') {
                    if (p > 0.5) {
                        const fadeIn = (p - 0.5) * 2; // 0 -> 1 in second half
                        const easeIn = 1 - Math.pow(1 - fadeIn, 2); // Quadratic ease-out
                        return {
                            opacity: Math.max(0.05, easeIn),
                            filter: `brightness(${0.4 + fadeIn * 0.6})`, // Brighten from dark
                            zIndex: 20
                        };
                    } else {
                        return { opacity: 0.05, zIndex: 20 };
                    }
                }
                return {};
            case 'dip-to-white':
                // Professional dip-to-white (like Premiere Pro): flash to white, then fade from white
                if (role === 'outgoing') {
                    if (p < 0.5) {
                        const fadeOut = p * 2; // 0 -> 1 in first half
                        const easeOut = Math.pow(fadeOut, 1.5); // Ease-in (faster than quadratic)
                        return {
                            opacity: 1 - easeOut,
                            filter: `brightness(${1 + fadeOut * 1.5}) saturate(${1 - fadeOut * 0.7}) contrast(${1 - fadeOut * 0.2})`,
                            zIndex: 10
                        };
                    } else {
                        return { opacity: 0.05, filter: 'brightness(2.5) saturate(0.3)', zIndex: 10 };
                    }
                }
                if (role === 'main') {
                    if (p > 0.5) {
                        const fadeIn = (p - 0.5) * 2; // 0 -> 1 in second half
                        const easeIn = 1 - Math.pow(1 - fadeIn, 1.5); // Ease-out
                        return {
                            opacity: Math.max(0.05, easeIn),
                            filter: `brightness(${2.5 - fadeIn * 1.5}) saturate(${0.3 + fadeIn * 0.7}) contrast(${0.8 + fadeIn * 0.2})`,
                            zIndex: 20
                        };
                    } else {
                        return { opacity: 0.05, filter: 'brightness(2.5) saturate(0.3)', zIndex: 20 };
                    }
                }
                return {};

            // --- Slides & Pushes ---
            case 'slide':
                // Ultra-light slide - crystal clear video
                if (role === 'main') {
                    return {
                        transform: `translate(${xMult * 100 * (1 - p)}%, ${yMult * 100 * (1 - p)}%)`,
                        zIndex: 20
                    };
                } else {
                    return { zIndex: 10 };
                }
            case 'push':
                // Ultra-optimized push (no blur for 8K performance)
                return role === 'main'
                    ? { transform: `translate(${xMult * 100 * (1 - p)}%, ${yMult * 100 * (1 - p)}%)` }
                    : { transform: `translate(${xMult * -100 * p}%, ${yMult * -100 * p}%)` };
            case 'whip':
                // Ultra-optimized whip (no blur for 8K performance)
                return role === 'main'
                    ? { transform: `translate(${xMult * 100 * (1 - p)}%, ${yMult * 100 * (1 - p)}%)` }
                    : { transform: `translate(${xMult * -100 * p}%, ${yMult * -100 * p}%)` };
            case 'split':
                // Incoming splits from center (simulated as simple slide for now or clip)
                // Better: Clip path split
                return role === 'main'
                    ? { clipPath: `inset(${direction === 'up' || direction === 'down' ? `0 ${50 * (1 - p)}% 0 ${50 * (1 - p)}%` : `${50 * (1 - p)}% 0 ${50 * (1 - p)}% 0`})`, zIndex: 20 }
                    : { zIndex: 10 };
            case 'band-slide':
                // Slide strips (simplified to push for now)
                return role === 'main' ? { transform: `translate(${xMult * 100 * (1 - p)}%, ${yMult * 100 * (1 - p)}%)` } : { transform: `translate(${xMult * -100 * p}%, ${yMult * -100 * p}%)` };

            // --- Iris Shapes ---
            case 'iris-box':
                // Box iris with easing curve
                const easeBox = 1 - Math.pow(1 - p, 3);
                return role === 'main'
                    ? { clipPath: `inset(${50 * (1 - easeBox)}%)`, filter: `brightness(${0.7 + 0.3 * p})`, zIndex: 20 }
                    : { filter: `brightness(${1 - p * 0.3})`, zIndex: 10 };
            case 'iris-round':
            case 'circle':
                // Circular iris with smooth easing
                const easeCircle = 1 - Math.pow(1 - p, 3);
                return role === 'main'
                    ? { clipPath: `circle(${easeCircle * 75}% at 50% 50%)`, filter: `brightness(${0.7 + 0.3 * p})`, zIndex: 20 }
                    : { filter: `brightness(${1 - p * 0.3})`, zIndex: 10 };
            case 'iris-diamond':
                // Diamond iris with easing
                const easeDiamond = 1 - Math.pow(1 - p, 3);
                return role === 'main'
                    ? { clipPath: `polygon(50% ${50 - 50 * easeDiamond}%, ${50 + 50 * easeDiamond}% 50%, 50% ${50 + 50 * easeDiamond}%, ${50 - 50 * easeDiamond}% 50%)`, filter: `brightness(${0.7 + 0.3 * p})`, zIndex: 20 }
                    : { filter: `brightness(${1 - p * 0.3})`, zIndex: 10 };
            case 'iris-cross':
                // Plus shape expanding with easing
                const easeCross = 1 - Math.pow(1 - p, 3);
                const w = 20 + (80 * easeCross);
                return role === 'main' ? {
                    clipPath: `polygon(
                    ${50 - w / 2}% 0%, ${50 + w / 2}% 0%, ${50 + w / 2}% ${50 - w / 2}%, 
                    100% ${50 - w / 2}%, 100% ${50 + w / 2}%, ${50 + w / 2}% ${50 + w / 2}%, 
                    ${50 + w / 2}% 100%, ${50 - w / 2}% 100%, ${50 - w / 2}% ${50 + w / 2}%, 
                    0% ${50 + w / 2}%, 0% ${50 - w / 2}%, ${50 - w / 2}% ${50 - w / 2}%
                )`,
                    filter: `brightness(${0.7 + 0.3 * p})`,
                    zIndex: 20
                } : { filter: `brightness(${1 - p * 0.3})`, zIndex: 10 };

            // --- Wipes ---

            case 'wipe':
                // Directional wipe with easing and edge brightness
                const easeWipe = 1 - Math.pow(1 - p, 3);
                return role === 'main'
                    ? { clipPath: `inset(${direction === 'right' ? `0 ${100 - (easeWipe * 100)}% 0 0` : direction === 'up' ? `${100 - (easeWipe * 100)}% 0 0 0` : direction === 'down' ? `0 0 ${100 - (easeWipe * 100)}% 0` : `0 0 0 ${100 - (easeWipe * 100)}%`})`, filter: `brightness(${0.8 + 0.2 * p})`, zIndex: 20 }
                    : { filter: `brightness(${1 - p * 0.2})`, zIndex: 10 };
            case 'barn-doors':
                // Barn doors with easing and brightness
                const easeBarn = 1 - Math.pow(1 - p, 3);
                return role === 'main' ? {
                    clipPath: direction === 'up' || direction === 'down'
                        ? `inset(${50 * (1 - easeBarn)}% 0 ${50 * (1 - easeBarn)}% 0)`
                        : `inset(0 ${50 * (1 - easeBarn)}% 0 ${50 * (1 - easeBarn)}%)`,
                    filter: `brightness(${0.8 + 0.2 * p})`,
                    zIndex: 20
                } : { filter: `brightness(${1 - p * 0.2})`, zIndex: 10 };
            case 'wedge-wipe':
                // Radial wipe from top center
                const angle = p * 360;
                return role === 'main' ? { clipPath: `conic-gradient(from 0deg at 50% 50%, black ${angle}deg, transparent ${angle}deg)` } : {}; // Note: clip-path doesn't support conic-gradient directly in all browsers, usually mask-image
            case 'clock-wipe':
            case 'radial-wipe':
                return role === 'main' ? {
                    WebkitMaskImage: `conic-gradient(from 0deg at 50% 50%, black ${p * 360}deg, transparent ${p * 360}deg)`,
                    maskImage: `conic-gradient(from 0deg at 50% 50%, black ${p * 360}deg, transparent ${p * 360}deg)`,
                    zIndex: 20
                } : {
                    zIndex: 10  // Outgoing clip stays visible behind the mask
                };
            case 'venetian-blinds':
                // Venetian blinds with easing and transparency effect
                const easeVenetian = 1 - Math.pow(1 - p, 3);
                return role === 'main' ? {
                    WebkitMaskImage: `linear-gradient(${direction === 'up' || direction === 'down' ? 'to bottom' : 'to right'}, black ${easeVenetian * 100}%, transparent ${easeVenetian * 100}%)`,
                    maskImage: `linear-gradient(${direction === 'up' || direction === 'down' ? 'to bottom' : 'to right'}, black ${easeVenetian * 100}%, transparent ${easeVenetian * 100}%)`,
                    WebkitMaskSize: direction === 'up' || direction === 'down' ? '100% 8%' : '8% 100%',
                    maskSize: direction === 'up' || direction === 'down' ? '100% 8%' : '8% 100%',
                    WebkitMaskRepeat: 'repeat',
                    maskRepeat: 'repeat',
                    filter: `brightness(${0.8 + 0.2 * p})`,
                    zIndex: 20
                } : { filter: `brightness(${1 - p * 0.2})`, zIndex: 10 };
            case 'checker-wipe':
                // Checker wipe with dynamic scaling and brightness
                const easeChecker = 1 - Math.pow(1 - p, 2);
                return role === 'main' ? {
                    WebkitMaskImage: `conic-gradient(black 90deg, transparent 90deg, transparent 180deg, black 180deg, black 270deg, transparent 270deg)`,
                    maskImage: `conic-gradient(black 90deg, transparent 90deg, transparent 180deg, black 180deg, black 270deg, transparent 270deg)`,
                    WebkitMaskSize: `${200 * (1.2 - easeChecker * 0.2)}% ${200 * (1.2 - easeChecker * 0.2)}%`,
                    maskSize: `${200 * (1.2 - easeChecker * 0.2)}% ${200 * (1.2 - easeChecker * 0.2)}%`,
                    opacity: easeChecker,
                    filter: `brightness(${0.8 + 0.2 * p})`,
                    zIndex: 20
                } : { opacity: 1 - easeChecker * 0.7, filter: `brightness(${1 - p * 0.2})`, zIndex: 10 };
            case 'zig-zag':
                // Zig-zag wipe with easing and brightness
                const easeZigZag = 1 - Math.pow(1 - p, 3);
                return role === 'main' ? {
                    WebkitMaskImage: `linear-gradient(135deg, black ${easeZigZag * 100}%, transparent ${easeZigZag * 100}%)`,
                    maskImage: `linear-gradient(135deg, black ${easeZigZag * 100}%, transparent ${easeZigZag * 100}%)`,
                    WebkitMaskSize: '12% 100%',
                    maskSize: '12% 100%',
                    filter: `brightness(${0.8 + 0.2 * p})`,
                    zIndex: 20
                } : { filter: `brightness(${1 - p * 0.2})`, zIndex: 10 };

            // --- Zooms ---
            case 'cross-zoom':
                // Cross zoom: outgoing zooms in while incoming zooms out
                if (role === 'outgoing') {
                    const blurAmount = Math.sin(p * Math.PI) * 10;
                    return {
                        transform: `scale(${1 + p * 3})`,
                        filter: `blur(${blurAmount}px) brightness(${1 + p * 0.5})`,
                        opacity: 1 - p,
                        zIndex: 10
                    };
                }
                if (role === 'main') {
                    const blurAmount = Math.sin(p * Math.PI) * 10;
                    return {
                        transform: `scale(${3 - p * 2})`,
                        filter: `blur(${blurAmount}px) brightness(${1.5 - p * 0.5})`,
                        opacity: p,
                        zIndex: 20
                    };
                }
                return {};

            // --- Page ---
            case 'page-peel':
                // Page peel corner effect with shadow
                const peelSize = p * 100;
                return role === 'main' ? {
                    clipPath: `polygon(0 0, 100% 0, 100% ${peelSize}%, ${100 - peelSize}% 100%, 0 100%)`,
                    filter: 'drop-shadow(10px 10px 20px rgba(0,0,0,0.5))',
                    transform: `perspective(1000px) rotateY(${(1 - p) * -5}deg)`,
                    zIndex: 50
                } : {
                    filter: `brightness(${1 - p * 0.2})`,
                    zIndex: 10
                };

            // --- Legacy / Others ---
            case 'stack':
                // Stack effect with depth and shadow
                if (role === 'main') {
                    return {
                        transform: `translate(${xMult * 100 * (1 - p)}%, ${yMult * 100 * (1 - p)}%) scale(${0.8 + 0.2 * p})`,
                        boxShadow: `0 ${20 * (1 - p)}px ${40 * (1 - p)}px rgba(0,0,0,${0.6 * (1 - p)})`,
                        filter: `blur(${(1 - p) * 3}px)`,
                        opacity: 0.3 + 0.7 * p,
                        zIndex: 20
                    };
                } else {
                    return {
                        transform: `scale(${1 - p * 0.2})`,
                        filter: `brightness(${1 - p * 0.4}) blur(${p * 2}px)`,
                        opacity: 1 - p * 0.3,
                        zIndex: 10
                    };
                }
            case 'morph-cut':
                // Morph-like transition with blur and slight scale
                return role === 'main'
                    ? { opacity: Math.max(0.05, p), transform: `scale(${0.95 + 0.05 * p})` }
                    : { opacity: Math.max(0.05, 1 - p), transform: `scale(${1 + 0.05 * (1 - p)})` };

            // --- Advanced Transitions ---
            case 'fade-dissolve':
                // Fade to black then to new clip
                if (role === 'outgoing') return { opacity: Math.max(0.05, p < 0.5 ? 1 - (p * 2) : 0.05) };
                if (role === 'main') return { opacity: Math.max(0.05, p > 0.5 ? (p - 0.5) * 2 : 0.05) };
                return {};

            // --- New Filmora-style Transitions ---

            // Basic
            case 'luma-dissolve':
                // Enhanced luma dissolve with contrast sweep and brightness mapping
                const lumaP = 1 - Math.pow(1 - p, 2);
                if (role === 'main') {
                    return {
                        filter: `contrast(${1 + lumaP * 1.5}) brightness(${0.7 + lumaP * 0.3})`,
                        opacity: Math.max(0.01, lumaP),
                        zIndex: 20
                    };
                } else {
                    return {
                        filter: `contrast(${1 + (1 - lumaP) * 1.5}) brightness(${1 - (1 - lumaP) * 0.3})`,
                        opacity: Math.max(0.01, 1 - lumaP),
                        zIndex: 10
                    };
                }
            case 'fade-color':
                // Fade through color with saturation control
                if (role === 'outgoing') {
                    if (p < 0.5) {
                        const fade = p * 2;
                        return {
                            filter: `brightness(${1 - fade * 0.5}) saturate(${1 - fade * 0.7})`,
                            opacity: Math.max(0.01, 1 - Math.pow(fade, 1.5)),
                            zIndex: 10
                        };
                    } else {
                        return { opacity: 0.01, zIndex: 10 };
                    }
                }
                if (role === 'main') {
                    if (p > 0.5) {
                        const fade = (p - 0.5) * 2;
                        return {
                            filter: `brightness(${0.5 + fade * 0.5}) saturate(${0.3 + fade * 0.7})`,
                            opacity: Math.max(0.01, Math.pow(fade, 0.7)),
                            zIndex: 20
                        };
                    } else {
                        return { opacity: 0.01, zIndex: 20 };
                    }
                }
                return {};

            // Wipes & Slides
            case 'simple-wipe':
                return role === 'main' ? { clipPath: `inset(${direction === 'right' ? `0 ${100 - (p * 100)}% 0 0` : direction === 'up' ? `${100 - (p * 100)}% 0 0 0` : direction === 'down' ? `0 0 ${100 - (p * 100)}% 0` : `0 0 0 ${100 - (p * 100)}%`})` } : {};
            case 'multi-panel':
                // Split into vertical strips
                return role === 'main' ? { clipPath: `polygon(0 0, ${p * 100}% 0, ${p * 100}% 100%, 0 100%)`, transform: `scale(${0.8 + 0.2 * p})` } : {};
            case 'split-screen':
                return role === 'main' ? { clipPath: `inset(0 ${50 * (1 - p)}% 0 ${50 * (1 - p)}%)` } : {};

            // Zooms
            case 'zoom-in':
                // Ultra-optimized zoom-in (no blur for 8K performance)
                const easeP = 1 - Math.pow(1 - p, 3);
                return role === 'main'
                    ? { transform: `scale(${0.5 + 0.5 * easeP})`, opacity: p, zIndex: 20 }
                    : { transform: `scale(${1 + p * 0.3})`, opacity: 1 - p, zIndex: 10 };
            case 'zoom-out':
                // Ultra-optimized zoom-out (no blur for 8K performance)
                const easeP2 = 1 - Math.pow(1 - p, 3);
                return role === 'main'
                    ? { transform: `scale(${1.5 - 0.5 * easeP2})`, opacity: p, zIndex: 20 }
                    : { transform: `scale(${1 - p * 0.2})`, opacity: 1 - p, zIndex: 10 };
            case 'warp-zoom':
                // Ultra-optimized warp zoom (no blur for 8K performance)
                return role === 'main'
                    ? { transform: `scale(${0.5 + p * 0.5})`, opacity: p, zIndex: 20 }
                    : { transform: `scale(${1 + p * 1.5})`, opacity: 1 - p, zIndex: 10 };

            // Spin & 3D
            case 'spin-3d':
                return role === 'main' ? { transform: `perspective(1000px) rotateY(${(1 - p) * -90}deg)`, opacity: p } : { transform: `perspective(1000px) rotateY(${p * 90}deg)`, opacity: 1 - p };
            case 'cube-rotate':
                // 3D cube rotation with perspective and shadow
                const cubeEase = 1 - Math.pow(1 - p, 3);
                if (role === 'main') {
                    return {
                        transform: `perspective(1200px) rotateY(${(1 - cubeEase) * -90}deg) translateZ(100px)`,
                        filter: `brightness(${0.7 + cubeEase * 0.3})`,
                        opacity: cubeEase,
                        zIndex: 20
                    };
                } else {
                    return {
                        transform: `perspective(1200px) rotateY(${cubeEase * 90}deg) translateZ(100px)`,
                        filter: `brightness(${1 - cubeEase * 0.3})`,
                        opacity: 1 - cubeEase,
                        zIndex: 10
                    };
                }
            case 'flip-3d':
                // 3D flip with perspective and brightness
                const flipEase = 1 - Math.pow(1 - p, 3);
                if (role === 'main') {
                    return {
                        transform: `perspective(1200px) rotateX(${(1 - flipEase) * -180}deg)`,
                        filter: `brightness(${0.6 + flipEase * 0.4})`,
                        opacity: flipEase,
                        zIndex: 20
                    };
                } else {
                    return {
                        transform: `perspective(1200px) rotateX(${flipEase * 180}deg)`,
                        filter: `brightness(${1 - flipEase * 0.4})`,
                        opacity: 1 - flipEase,
                        zIndex: 10
                    };
                }
            case 'page-curl':
                return role === 'main' ? { clipPath: `polygon(0 0, ${p * 150}% 0, 0 ${p * 150}%)`, boxShadow: '-10px 10px 20px rgba(0,0,0,0.5)', zIndex: 50 } : { zIndex: 10 };

            // Shapes
            case 'shape-circle':
                return role === 'main' ? { clipPath: `circle(${p * 100}% at 50% 50%)`, zIndex: 20 } : { zIndex: 10 };
            case 'shape-heart':
                // Approximate heart shape or just diamond for now
                return role === 'main' ? { clipPath: `polygon(50% ${50 + 50 * p}%, ${50 - 50 * p}% ${50 - 20 * p}%, 50% ${50 - 50 * p}%, ${50 + 50 * p}% ${50 - 20 * p}%)`, zIndex: 20 } : { zIndex: 10 };
            case 'shape-triangle':
                return role === 'main' ? { clipPath: `polygon(50% ${50 - 50 * p}%, ${50 + 50 * p}% ${50 + 50 * p}%, ${50 - 50 * p}% ${50 + 50 * p}%)`, zIndex: 20 } : { zIndex: 10 };

            // Glitch & Digital
            case 'chromatic-aberration':
                return role === 'main' ? { filter: `drop-shadow(${Math.sin(p * 20) * 5}px 0 0 red) drop-shadow(${Math.sin(p * 20 + 2) * -5}px 0 0 blue)`, opacity: p } : { filter: `drop-shadow(${Math.sin(p * 20) * 5}px 0 0 red) drop-shadow(${Math.sin(p * 20 + 2) * -5}px 0 0 blue)`, opacity: 1 - p };
            case 'pixelate':
                // Ultra-optimized pixelate (no blur for 8K performance)
                return role === 'main'
                    ? { opacity: p, zIndex: 20 }
                    : { opacity: 1 - p, zIndex: 10 };
            case 'datamosh':
                // Simplified datamosh - optimized for video performance
                if (role === 'main') {
                    return {
                        transform: `scale(${1 + Math.sin(p * 8) * 0.08}) skew(${Math.sin(p * 15) * 5}deg)`,
                        filter: `hue-rotate(${p * 30}deg)`,
                        opacity: p,
                        zIndex: 20
                    };
                } else {
                    return {
                        transform: `scale(${1 + Math.sin(p * 8) * 0.08}) skew(${Math.sin(p * 15) * 5}deg)`,
                        filter: `hue-rotate(${(1 - p) * 30}deg)`,
                        opacity: 1 - p,
                        zIndex: 10
                    };
                }

            // Light
            case 'flash':
                return role === 'main' ? { filter: `brightness(${1 + (1 - p) * 5})`, opacity: p } : { filter: `brightness(${1 + p * 5})`, opacity: 1 - p };
            case 'light-leak':
                return role === 'main' ? { filter: `sepia(${1 - p}) brightness(${1 + (1 - p)})`, opacity: p } : { filter: `sepia(${p}) brightness(${1 + p})`, opacity: 1 - p };

            // Distort
            case 'ripple':
                return role === 'main' ? { transform: `scale(${1 + Math.sin(p * 10) * 0.05})`, opacity: p } : { opacity: 1 - p };
            case 'liquid':
                return role === 'main' ? { opacity: p } : { opacity: 1 - p };
            case 'stretch':
                return role === 'main' ? { transform: `scaleX(${0.1 + 0.9 * p})`, opacity: p } : { transform: `scaleX(${1 + p})`, opacity: 1 - p };

            // Tile
            case 'tile-drop':
                return role === 'main' ? { transform: `translateY(${(1 - p) * -100}%)`, opacity: p } : { transform: `translateY(${p * 100}%)`, opacity: 1 - p };
            case 'mosaic-grid':
                return role === 'main' ? { clipPath: `inset(0 0 0 0 round ${50 * (1 - p)}%)`, transform: `scale(${0.5 + 0.5 * p})`, zIndex: 20 } : { zIndex: 10 };

            // Blur
            case 'speed-blur':
                return role === 'main' ? { transform: `scale(${1.2})`, opacity: p } : { transform: `scale(0.8)`, opacity: 1 - p };
            case 'whip-pan':
                return role === 'main' ? { transform: `translateX(${(1 - p) * 100}%)` } : { transform: `translateX(${p * -100}%)` };

            // Stylized
            case 'brush-reveal':
                return role === 'main' ? { clipPath: `circle(${p * 100}% at 50% 50%)`, filter: `contrast(1.2) sepia(0.2)`, zIndex: 20 } : { zIndex: 10 };
            case 'ink-splash':
                return role === 'main' ? { clipPath: `circle(${p * 100}%)`, filter: `contrast(1.5)`, zIndex: 20 } : { zIndex: 10 };
            case 'flash-zoom-in':
                // Bright flash + Zoom In
                if (role === 'outgoing') return { transform: `scale(${1 + p})`, opacity: 1 - p, filter: `brightness(${1 + p * 5})` };
                if (role === 'main') return { transform: `scale(${2 - p})`, opacity: p, filter: `brightness(${1 + (1 - p) * 5})` };
                return {};
            case 'flash-zoom-out':
                // Bright flash + Zoom Out
                if (role === 'outgoing') return { transform: `scale(${1 - p * 0.5})`, opacity: 1 - p, filter: `brightness(${1 + p * 5})` };
                if (role === 'main') return { transform: `scale(${0.5 + p * 0.5})`, opacity: p, filter: `brightness(${1 + (1 - p) * 5})` };
                return {};
            case 'film-roll':
                // Vertical slide with film strip effect (simulated)
                return role === 'main'
                    ? { transform: `translateY(${(1 - p) * 100}%)`, filter: 'sepia(0.3)' }
                    : { transform: `translateY(${-p * 100}%)`, filter: 'sepia(0.3)' };

            case 'flow':
                // Ultra-optimized flow (no blur for 8K performance)
                return role === 'main'
                    ? { transform: `translate(${xMult * 100 * (1 - p)}%, ${yMult * 100 * (1 - p)}%) scale(${0.9 + 0.1 * p})`, opacity: p, zIndex: 20 }
                    : { transform: `translate(${xMult * -50 * p}%, ${yMult * -50 * p}%) scale(${1 - 0.1 * p})`, opacity: 1 - p, zIndex: 10 };

            // --- Premiere Pro Style Transitions ---

            case 'spin':
                // Spin / Rotation
                const rotation = role === 'outgoing' ? -p * 180 : (1 - p) * 180;
                const scaleSpin = 1 - Math.sin(p * Math.PI) * 0.5;
                return {
                    transform: `rotate(${rotation}deg) scale(${scaleSpin})`,
                    opacity: role === 'outgoing' ? 1 - p : p
                };

            case 'zoom-blur':
                // Zoom Blur
                const scaleBlur = role === 'outgoing' ? 1 + p * 2 : 3 - p * 2;
                const blurAmount = Math.sin(p * Math.PI) * 10;
                return {
                    transform: `scale(${scaleBlur})`,
                    filter: `blur(${blurAmount}px)`,
                    opacity: role === 'outgoing' ? 1 - p : p
                };

            case 'film-burn':
                // Film Burn / Light Leak
                const burnIntensity = Math.sin(p * Math.PI);
                return {
                    filter: `brightness(${1 + burnIntensity * 3}) sepia(${burnIntensity * 0.5}) saturate(${1 + burnIntensity}) contrast(${1 - burnIntensity * 0.2})`,
                    opacity: role === 'outgoing' ? 1 - p : p,
                    transform: `scale(${1 + burnIntensity * 0.1})`
                };

            case 'glitch':
                // Glitch (Simplified)
                const glitchOffset = Math.random() * 10 * (Math.sin(p * Math.PI));
                return {
                    transform: `translate(${glitchOffset}px, ${-glitchOffset}px)`,
                    filter: `hue-rotate(${p * 90}deg) contrast(1.5)`,
                    opacity: role === 'outgoing' ? (p > 0.5 ? 0 : 1) : (p > 0.5 ? 1 : 0) // Hard cut
                };

            case 'rgb-split':
                // RGB Split (Simulated with Hue Rotate)
                return {
                    filter: `hue-rotate(${p * 360}deg)`,
                    transform: `scale(${1 + Math.sin(p * Math.PI) * 0.1})`,
                    opacity: role === 'outgoing' ? 1 - p : p
                };

            case 'non-additive-dissolve':
                // Non-Additive Dissolve (Simulated with steeper curve)
                // In NLEs, this maps luminance. Here we just do a sharper blend.
                return { opacity: role === 'outgoing' ? Math.pow(1 - p, 2) : Math.pow(p, 2) };

            case 'smooth-wipe':
                // Smooth Wipe (Simulated with sliding mask)
                // Note: Real smooth wipe needs mask-image which is complex in inline styles without assets.
                // We'll simulate with a sliding opacity gradient effect using clip-path? No, clip-path is hard edge.
                // Let's do a slide with fade.
                return role === 'main'
                    ? { transform: `translateX(${(1 - p) * 50}%)`, opacity: p }
                    : { transform: `translateX(${-p * 50}%)`, opacity: 1 - p };

            case 'ripple-dissolve':
                // Ripple Dissolve (Simulated with scale/blur/opacity)
                return {
                    transform: `scale(${1 + Math.sin(p * Math.PI * 4) * 0.05})`,
                    filter: `blur(${Math.sin(p * Math.PI) * 2}px)`,
                    opacity: role === 'outgoing' ? 1 - p : p
                };

            default: return {};
        }
    };

    const renderItemContent = (obj: RenderItem, isOverlayPass: boolean) => {
        const { item, role, zIndexBase, isBuffered } = obj;
        const transitionStyle = getTransitionStyle(obj);
        const { style: posStyle, transform: itemTransform } = getItemPositionAndTransform(item);

        // Calculate Crop Properties
        const crop = (interactionMode === 'crop' && selectedItemId === item.id) ? cropState : (item.crop || { x: 50, y: 50, zoom: 1 });
        const objectPosition = `${crop.x}% ${crop.y}%`;
        const cropTransform = crop.zoom > 1 ? `scale(${crop.zoom})` : undefined;

        const adjustmentStyle = getAdjustmentStyle(item, renderScale);
        const presetFilterStyle = getPresetFilterStyle(item.filter || 'none');
        const intensity = item.filterIntensity ?? 100;
        const vignetteOpacity = (item.adjustments?.vignette || 0) / 100;

        // Combine adjustment filters and preset filters with intensity
        const combinedFilterStyle = [adjustmentStyle, presetFilterStyle].filter(Boolean).join(' ').trim();

        // Scale pixel values for preview optimization
        const s = (val: number) => val * renderScale;

        // Animation Logic
        let animationStyle: React.CSSProperties = {};
        if (item.animation) {
            const animType = item.animation.type;
            const animDur = item.animation.duration || 1;
            const clipDur = item.duration;
            const timing = item.animation.timing || 'both'; // Default to both if not specified, though UI defaults to enter/both

            // We use the animation name directly as it matches the keyframes defined in index.html
            // Note: We don't use the class anymore to allow full control over timing

            if (timing === 'enter') {
                animationStyle = {
                    animationName: animType,
                    animationDuration: `${animDur}s`,
                    animationFillMode: 'both',
                    animationTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
                    willChange: 'transform, opacity, filter'
                };
            } else if (timing === 'exit') {
                animationStyle = {
                    animationName: animType,
                    animationDuration: `${animDur}s`,
                    animationDirection: 'reverse',
                    // Allow negative delay so the animation ends exactly at the end of the clip
                    animationDelay: `${clipDur - animDur}s`,
                    animationFillMode: 'both',
                    animationTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
                    willChange: 'transform, opacity, filter'
                };
            } else if (timing === 'both') {
                animationStyle = {
                    animationName: `${animType}, ${animType}`,
                    animationDuration: `${animDur}s, ${animDur}s`,
                    animationDirection: 'normal, reverse',
                    // Allow negative delay for the exit phase
                    animationDelay: `0s, ${clipDur - animDur}s`,
                    animationFillMode: 'both, forwards',
                    animationTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1), cubic-bezier(0.2, 0.8, 0.2, 1)',
                    willChange: 'transform, opacity, filter'
                };
            }
        }

        // Restore animation class to ensure static CSS properties (masks, filters) are applied
        const animationClass = item.animation ? `anim-${item.animation.type}` : '';

        let zIndex = zIndexBase;
        if (item.isBackground) { zIndex = 1; if (role === 'outgoing') zIndex = 0; } else { zIndex = zIndexBase + 5; if (item.type === 'text') zIndex += 2; }
        if (item.id === selectedItemId) { zIndex = item.isBackground ? 1 : 1000; }

        const isSelected = selectedItemId === item.id;
        const isDragging = isSelected && isDraggingItem;
        const isErasing = isSelected && interactionMode === 'erase';
        const isEditing = isSelected && isEditingText;

        const maskStyle = item.maskImage && !isErasing ? { WebkitMaskImage: `url(${item.maskImage})`, maskImage: `url(${item.maskImage})`, WebkitMaskSize: 'cover', maskSize: 'cover', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat' } : {};
        const borderStyle = item.border ? { border: `${s(item.border.width)}px ${item.border.style} ${item.border.color}` } : {};
        const borderRadiusStyle = item.borderRadius ? { borderRadius: `${s(item.borderRadius)}px` } : {};

        // Text Specific Styles (Common for rendering and measuring)
        const textBaseStyle: React.CSSProperties = item.type === 'text' ? {
            fontFamily: item.fontFamily,
            fontSize: `${s(item.fontSize || 40)}px`,
            fontWeight: item.fontWeight,
            fontStyle: item.fontStyle,
            textDecoration: item.textDecoration,
            textAlign: item.textAlign,
            textTransform: item.textTransform,
            color: item.color,
            whiteSpace: 'pre-wrap',
            lineHeight: 1.4,
            // We add padding directly to the text container to create space from the border
            padding: `${s(8)}px`,
            boxSizing: 'border-box', // Ensures border is outside content+padding
            wordBreak: 'break-word', // Ensure long words break
            overflowWrap: 'break-word', // Ensure text wraps
        } : {};

        const textEffectStyle: React.CSSProperties = item.type === 'text' && item.textEffect
            ? getTextEffectStyle(item.textEffect, item.color, renderScale)
            : {};

        const fullTextStyle = { ...textBaseStyle, ...textEffectStyle };

        // Shared text rendering function to keep visual consistency
        const renderTextContent = () => {
            if (item.listType && item.listType !== 'none') {
                const listClass = item.listType === 'bullet' ? "list-disc list-inside text-left" : "list-decimal list-inside text-left";
                const lines = item.name.split('\n');
                return (
                    item.listType === 'bullet' ? (
                        <ul className={listClass}>
                            {lines.map((line, i) => <li key={i}>{line}</li>)}
                        </ul>
                    ) : (
                        <ol className={listClass}>
                            {lines.map((line, i) => <li key={i}>{line}</li>)}
                        </ol>
                    )
                );
            }
            return item.name;
        };

        // For text items, we want auto-height so it grows with text content
        // We also override overflow to visible for text so content doesn't get clipped
        const finalStyle: React.CSSProperties = {
            zIndex, inset: item.isBackground ? 0 : undefined,
            ...posStyle,
            width: item.isBackground ? '100%' : (item.width ? `${item.width}%` : 'auto'),
            height: item.isBackground ? '100%' : (item.type === 'text' ? 'auto' : (item.height ? `${item.height}%` : 'auto')),
            transform: itemTransform, opacity: isBuffered ? 0 : (isDragging && !item.isBackground && (Math.abs(item.x || 0) > 65 || Math.abs(item.y || 0) > 65) ? 0.4 : (item.opacity ?? 100) / 100),
            ...maskStyle, filter: combinedFilterStyle, ...transitionStyle,
            mixBlendMode: (transitionStyle as any).mixBlendMode,
            pointerEvents: isBuffered ? 'none' : 'auto'
        };

        if (transitionStyle.transform && itemTransform) finalStyle.transform = `${itemTransform} ${transitionStyle.transform}`;
        else if (transitionStyle.transform) finalStyle.transform = transitionStyle.transform;
        if (transitionStyle.opacity !== undefined) finalStyle.opacity = Number(transitionStyle.opacity) * (finalStyle.opacity as number);

        const clipPathStyle = item.borderRadius ? { clipPath: `inset(0 round ${s(item.borderRadius)}px)` } : {};

        const contentJsx = (
            <div
                key={item.id}
                className={`absolute flex items-center justify-center origin-center ${isSelected ? (interactionMode === 'crop' ? 'cursor-move' : item.isBackground ? 'cursor-default' : 'cursor-move') : 'cursor-pointer'}`}
                style={finalStyle}
                onMouseDown={(e) => handleItemMouseDown(e, item)}
                onClick={(e) => e.stopPropagation()}
                onMouseMove={(e) => { if (isSelected && interactionMode === 'crop') handleCropDrag(e); }}
                onDoubleClick={(e) => {
                    if (item.type === 'text') {
                        e.stopPropagation();
                    }
                }}
            >
                <div
                    style={{
                        width: '100%',
                        height: '100%',
                        // Use background (not backgroundColor) consistently to avoid React warning
                        background: (item.type === 'video' && item.animation) ? '#000000' : 'transparent',
                        ...animationStyle,
                        ...borderRadiusStyle,
                        ...clipPathStyle,
                    }}
                    className={`relative ${item.type === 'text' ? 'overflow-visible' : 'overflow-hidden'} pointer-events-none ${animationClass} ${!item.isBackground ? 'flex items-center justify-center' : ''}`}
                >
                    {vignetteOpacity > 0 && <div className="absolute inset-0 z-10 pointer-events-none" style={{ background: `radial-gradient(circle, transparent 50%, rgba(0,0,0,${vignetteOpacity}) 100%)`, ...borderRadiusStyle }}></div>}
                    {(!isErasing || item.type === 'text' || item.type === 'color') && (
                        <>
                            {item.type === 'video' && (
                                <>
                                    <video
                                        ref={(el) => { mediaRefs.current[item.id] = el; }}
                                        src={item.src}
                                        className={`pointer-events-none block ${item.isBackground ? 'w-full h-full' : 'w-auto h-auto max-w-full max-h-full shadow-sm'}`}
                                        style={{
                                            objectFit: item.isBackground ? (item.fit || 'cover') : 'contain',
                                            objectPosition,
                                            transform: cropTransform,
                                            boxSizing: 'border-box',
                                            ...borderStyle,
                                            ...borderRadiusStyle,
                                            // Hide video element ONLY when GPU is rendering AND no animation AND no transition
                                            // Animated/transitioning videos MUST stay visible for CSS effects to work
                                            // IMPORTANT: Don't set opacity when transitioning - parent container handles it
                                            ...((gpuReady && item.isBackground && !item.animation && !obj.transition) ? { opacity: 0 } : {}),
                                            // Force visibility for animated videos
                                            ...(item.animation ? {
                                                display: 'block',
                                                position: 'relative',
                                                zIndex: 10,
                                                backfaceVisibility: 'hidden',
                                                perspective: 1000,
                                                WebkitBackfaceVisibility: 'hidden',
                                                WebkitPerspective: 1000
                                            } : {
                                                backfaceVisibility: 'hidden',
                                                perspective: 1000,
                                                WebkitBackfaceVisibility: 'hidden',
                                                WebkitPerspective: 1000
                                            })
                                        }}
                                        playsInline
                                        crossOrigin="anonymous"
                                        preload="auto"
                                        disablePictureInPicture
                                    />
                                    {item.backgroundColor && (
                                        <div className="absolute inset-0 pointer-events-none z-[1]" style={{ backgroundColor: item.backgroundColor, mixBlendMode: 'multiply', opacity: 0.5 }}></div>
                                    )}
                                </>
                            )}
                            {item.type === 'image' && (
                                <>
                                    <img
                                        ref={(el) => { mediaRefs.current[item.id] = el; }}
                                        src={item.src}
                                        className={`pointer-events-none block ${item.isBackground ? 'w-full h-full' : 'w-auto h-auto max-w-full max-h-full shadow-sm'}`}
                                        style={{
                                            objectFit: item.isBackground ? (item.fit || 'cover') : 'contain',
                                            objectPosition,
                                            transform: cropTransform,
                                            boxSizing: 'border-box',
                                            ...borderStyle,
                                            ...borderRadiusStyle
                                        }}
                                    />
                                    {/* Add Color Overlay for Tinting Images */}
                                    {item.backgroundColor && (
                                        <div className="absolute inset-0 pointer-events-none z-[1]" style={{ backgroundColor: item.backgroundColor, mixBlendMode: 'multiply', opacity: 0.5 }}></div>
                                    )}
                                </>
                            )}
                        </>
                    )}
                    {item.type === 'color' && <div className="w-full h-full" style={{ background: item.src, ...borderStyle, ...borderRadiusStyle }}></div>}
                    {item.type === 'text' && (
                        isEditing ? (
                            // Use correct tag for editing to show bullets/numbers natively
                            React.createElement(
                                item.listType === 'bullet' ? 'ul' : item.listType === 'number' ? 'ol' : 'div',
                                {
                                    ref: textInputRef,
                                    contentEditable: true,
                                    suppressContentEditableWarning: true,
                                    className: `outline-none pointer-events-auto cursor-text ${item.listType === 'bullet' ? 'list-disc list-inside' : item.listType === 'number' ? 'list-decimal list-inside' : ''}`,
                                    style: {
                                        ...fullTextStyle, // Apply full styling (including padding) to input
                                        width: '100%',
                                        height: '100%',
                                        background: 'transparent',
                                        border: 'none',
                                        overflow: 'visible',
                                        display: 'inline-block',
                                        minWidth: '10px'
                                    },
                                    onBlur: (e: React.FocusEvent<HTMLElement>) => {
                                        onUpdateClip(item.trackId, { ...item, name: e.currentTarget.innerText });
                                        setIsEditingText(false);
                                    },
                                    onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
                                    children: item.listType !== 'none'
                                        ? item.name.split('\n').map((line, i) => <li key={i}>{line}</li>)
                                        : item.name
                                }
                            )
                        ) : (
                            <div className="whitespace-pre-wrap" style={fullTextStyle}>
                                {renderTextContent()}
                            </div>
                        )
                    )}

                    {
                        isErasing && (item.type === 'image' || item.type === 'video') && (
                            <>
                                <canvas ref={compositeCanvasRef} width={renderWidth} height={renderHeight} className={`w-full h-full ${item.isBackground ? 'object-cover' : 'object-contain'}`} style={{ objectPosition }} />
                                <canvas ref={eraserCanvasRef} width={renderWidth} height={renderHeight} className="absolute inset-0 hidden pointer-events-none" />
                            </>
                        )
                    }
                </div >
            </div >
        );

        if (!isOverlayPass) { if (isDragging && !item.isBackground) return null; return contentJsx; }
        else {
            const children = [];
            if (isDragging && !item.isBackground) children.push(contentJsx);
            if (isSelected && interactionMode === 'none' && !item.isBackground) {
                children.push(
                    <div key={`overlay-${item.id}`} className="absolute pointer-events-none flex items-center justify-center origin-center" style={{ zIndex, ...posStyle, width: item.isBackground ? '100%' : (item.width ? `${item.width}%` : 'auto'), height: item.isBackground ? '100%' : (item.type === 'text' ? 'auto' : (item.height ? `${item.height}%` : 'auto')), transform: itemTransform }}>
                        <div style={{ width: '100%', height: '100%', ...animationStyle }} className={animationClass}>
                            {/* Invisible Text Clone to Force Selection Box to Fit Content EXACTLY including padding */}
                            {item.type === 'text' && (
                                <div style={{
                                    ...fullTextStyle,
                                    opacity: 0,
                                    pointerEvents: 'none',
                                    overflow: 'hidden',
                                    position: 'static', // Let it flow naturally to size parent
                                    width: '100%', // Force width to match parent container width
                                    height: 'auto', // Let it grow vertically
                                    border: 'none',
                                    margin: 0
                                }}>
                                    {renderTextContent()}
                                </div>
                            )}

                            {/* The Selection Border Container */}
                            <div className={`absolute -inset-[2px] border-[2px] border-violet-600 z-50 pointer-events-none ${isEditing ? 'opacity-0' : 'opacity-100'}`} style={{ borderRadius: item.borderRadius ? `${item.borderRadius}px` : 0, boxSizing: 'border-box' }}>

                                <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-6 h-6 bg-white border border-violet-600 rounded-full shadow-sm z-50 pointer-events-auto cursor-grab active:cursor-grabbing flex items-center justify-center hover:scale-110 transition-transform" onMouseDown={(e) => handleRotateMouseDown(e, item)}><RotateCw size={14} className="text-violet-600" /></div>
                                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-px h-4 bg-violet-600"></div>

                                {/* Corner Handles - Positioned relative to the border box */}
                                <div className="absolute -top-2.5 -left-2.5 w-5 h-5 bg-white border border-violet-600 rounded-full shadow-sm z-50 pointer-events-auto cursor-nwse-resize hover:scale-125 transition-transform" onMouseDown={(e) => handleResizeMouseDown(e, item, 'nw')}></div>
                                <div className="absolute -top-2.5 -right-2.5 w-5 h-5 bg-white border border-violet-600 rounded-full shadow-sm z-50 pointer-events-auto cursor-nesw-resize hover:scale-125 transition-transform" onMouseDown={(e) => handleResizeMouseDown(e, item, 'ne')}></div>
                                <div className="absolute -bottom-2.5 -left-2.5 w-5 h-5 bg-white border border-violet-600 rounded-full shadow-sm z-50 pointer-events-auto cursor-nesw-resize hover:scale-125 transition-transform" onMouseDown={(e) => handleResizeMouseDown(e, item, 'sw')}></div>
                                <div className="absolute -bottom-2.5 -right-2.5 w-5 h-5 bg-white border border-violet-600 rounded-full shadow-sm z-50 pointer-events-auto cursor-nwse-resize hover:scale-125 transition-transform" onMouseDown={(e) => handleResizeMouseDown(e, item, 'se')}></div>

                                {/* Side Handles */}
                                <div className="absolute top-1/2 -right-2 w-2.5 h-10 -translate-y-1/2 bg-white border border-violet-600 rounded-full shadow-sm z-50 pointer-events-auto cursor-ew-resize hover:scale-110 transition-transform" onMouseDown={(e) => handleResizeMouseDown(e, item, 'e')}></div>
                                <div className="absolute top-1/2 -left-2 w-2.5 h-10 -translate-y-1/2 bg-white border border-violet-600 rounded-full shadow-sm z-50 pointer-events-auto cursor-ew-resize hover:scale-110 transition-transform" onMouseDown={(e) => handleResizeMouseDown(e, item, 'w')}></div>

                                {/* Top/Bottom Handles - Hidden for text items */}
                                {item.type !== 'text' && (
                                    <>
                                        <div className="absolute left-1/2 -top-2 w-10 h-2.5 -translate-x-1/2 bg-white border border-violet-600 rounded-full shadow-sm z-50 pointer-events-auto cursor-ns-resize hover:scale-110 transition-transform" onMouseDown={(e) => handleResizeMouseDown(e, item, 'n')}></div>
                                        <div className="absolute left-1/2 -bottom-2 w-10 h-2.5 -translate-x-1/2 bg-white border border-violet-600 rounded-full shadow-sm z-50 pointer-events-auto cursor-ns-resize hover:scale-110 transition-transform" onMouseDown={(e) => handleResizeMouseDown(e, item, 's')}></div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                );
            }
            return <React.Fragment key={`${item.id}-overlay-wrapper`}>{children}</React.Fragment>;
        }
    };

    const selectedItem = tracks.find(t => t.items.some(i => i.id === selectedItemId))?.items.find(i => i.id === selectedItemId) || null;

    const getTopToolbarStyle = () => {
        // Fixed position at the top of the canvas area (viewport), mimicking a main toolbar
        return { top: '1rem', left: '50%', transform: 'translateX(-50%)' };
    };

    const getBottomToolbarStyle = () => {
        if (!selectedItem || !canvasWrapperRef.current || selectedItem.isBackground) return {};
        const canvasW = dimension.width * currentScale; const canvasH = dimension.height * currentScale;
        const itemCenterX = (selectedItem.x || 0) / 100 * canvasW; const itemCenterY = (selectedItem.y || 0) / 100 * canvasH; const itemH = (selectedItem.height || 0) / 100 * canvasH;
        const bottomOffset = itemCenterY + (itemH / 2) + 20;
        return { top: `calc(50% + ${bottomOffset}px)`, left: `calc(50% + ${itemCenterX}px)`, transform: 'translateX(-50%)' };
    };





    return (
        <div
            className={`flex-1 relative overflow-hidden flex items-center justify-center ${className || 'bg-gray-100 p-8'}`}
            onClick={(e) => {
                if (selectedItemId) {
                    onSelectClip('', null);
                }

                setInteractionMode('none');
            }}
            onMouseMove={(e) => {
                if (interactionMode === 'erase') handleEraserMouseMove(e);
                else if (isResizing) handleResizeDrag(e);
                else if (isRotating) handleRotateDrag(e);
                else if (isDraggingItem) handleItemDrag(e);
            }}
            onMouseUp={(e) => {
                if (interactionMode === 'erase' && selectedItem) handleEraserMouseUp(selectedItem.trackId, selectedItem);

                if (isDraggingItem && selectedItem && !selectedItem.isBackground) {
                    const deleteThreshold = 65;
                    if (Math.abs(selectedItem.x || 0) > deleteThreshold || Math.abs(selectedItem.y || 0) > deleteThreshold) {
                        onDeleteClip(selectedItem.trackId, selectedItem.id);
                    } else {
                        // Commit Drag to History
                        onUpdateClip(selectedItem.trackId, selectedItem, false);
                    }
                } else if ((isResizing || isRotating) && selectedItem) {
                    // Commit Resize/Rotate to History
                    onUpdateClip(selectedItem.trackId, selectedItem, false);
                }

                setIsDraggingItem(false);
                setIsResizing(false);
                setIsRotating(false);
                dragStartRef.current = null;
                itemStartPosRef.current = null;
                resizeStartRef.current = null;
                rotateCenterRef.current = null;
            }}
        >
            <div className="w-full h-full flex items-center justify-center overflow-hidden relative">

                {/* Main Canvas Background / Wrapper */}
                <div
                    key={`canvas-${dimension.width}-${dimension.height}`}
                    ref={canvasWrapperRef}
                    className="bg-black shadow-2xl relative transition-transform duration-300 ease-in-out origin-center group"
                    style={{
                        width: renderWidth,
                        height: renderHeight,
                        transform: `scale(${currentScale / renderScale})`,
                        flexShrink: 0
                    }}
                    onClick={(e) => {
                        // Only deselect if not drawing or dragging
                        if (!isDrawing && !isDraggingItem && !isResizing && !isRotating) {
                            e.preventDefault();
                            e.stopPropagation();
                            if (selectedItemId) onSelectClip('', null);

                            setInteractionMode('none');
                        }
                    }}
                >
                    {/* Layer 1: Content (Clipped) */}
                    <div className="absolute inset-0 overflow-hidden bg-transparent">
                        {/* GPU Accelerated Canvas - renders video/image layers with hardware acceleration */}
                        <canvas
                            ref={gpuCanvasRef}
                            width={renderWidth}
                            height={renderHeight}
                            className="absolute inset-0 pointer-events-none"
                            style={{
                                width: '100%',
                                height: '100%',
                                display: gpuReady ? 'block' : 'none',
                                zIndex: 0
                            }}
                        />
                        {/* 2D Canvas - fallback and overlay rendering */}
                        <canvas
                            ref={mainCanvasRef}
                            width={renderWidth}
                            height={renderHeight}
                            className="absolute inset-0 pointer-events-none"
                            style={{ width: '100%', height: '100%', zIndex: 1 }}
                        />
                        {renderItems.length === 0 && (
                            <div className="w-full h-full flex items-center justify-center text-gray-300 font-bold text-4xl">
                                Empty
                            </div>
                        )}

                        {/* Render Visible Items */}
                        {/* When GPU is ready, skip video/image backgrounds - they render via GPU canvas */}
                        {renderItems
                            .filter(obj => obj.item.type !== 'audio')
                            .filter(obj => {
                                // TEMPORARILY DISABLED GPU FILTERING - Always render in DOM to diagnose black canvas issue
                                // Skip NON-ANIMATED, NON-TRANSITIONING background videos/images when GPU is rendering them
                                // IMPORTANT: Keep animated items AND items with transitions in DOM so CSS effects work
                                // if (gpuReady && !obj.item.animation && !obj.transition && obj.item.isBackground && (obj.item.type === 'video' || obj.item.type === 'image')) {
                                //     return false;
                                // }
                                return true;
                            })
                            .map((obj) => renderItemContent(obj, false))}

                        {/* Render Buffered Items (Hidden but Mounted) */}
                        {bufferedItems.map((obj) => renderItemContent(obj, false))}

                        {/* Cursor for Eraser - Moved outside to fixed position */}
                    </div>

                    {/* Layer 2: UI Overlays (Not Clipped by viewport, but inside canvas wrapper) */}
                    <div className="absolute inset-0 pointer-events-none">
                        {renderItems
                            .filter(obj => obj.item.type !== 'audio')
                            .filter(obj => {
                                // TEMPORARILY DISABLED GPU FILTERING - Always render in DOM to diagnose black canvas issue
                                // Skip NON-ANIMATED, NON-TRANSITIONING background videos/images when GPU is rendering them
                                // IMPORTANT: Keep animated items AND items with transitions in DOM so CSS effects work
                                // if (gpuReady && !obj.item.animation && !obj.transition && obj.item.isBackground && (obj.item.type === 'video' || obj.item.type === 'image')) {
                                //     return false;
                                // }
                                return true;
                            })
                            .map((obj) => renderItemContent(obj, true))}
                    </div>

                    {/* Audio Elements (Invisible) */}
                    {renderItems.filter(obj => obj.item.type === 'audio').map((obj) => (
                        <audio
                            key={`${obj.item.id}-${obj.role}`}
                            ref={(el) => { mediaRefs.current[obj.item.id] = el; }}
                            src={obj.item.src}
                            preload="auto"
                        />
                    ))}

                    {/* Hidden Video Elements for GPU Rendering */}
                    {/* These are invisible but provide texture source for WebGL rendering */}
                    {/* CRITICAL: Only for NON-ANIMATED, NON-TRANSITIONING videos - those need visible DOM element */}
                    {gpuReady && renderItems
                        .filter(obj => obj.item.isBackground && !obj.item.animation && !obj.transition && (obj.item.type === 'video' || obj.item.type === 'image'))
                        .map((obj) => (
                            obj.item.type === 'video' ? (
                                <video
                                    key={`gpu-${obj.item.id}`}
                                    ref={(el) => { mediaRefs.current[obj.item.id] = el; }}
                                    src={obj.item.src}
                                    className="absolute opacity-0 pointer-events-none"
                                    style={{ width: 1, height: 1, position: 'absolute', left: -9999 }}
                                    playsInline
                                    crossOrigin="anonymous"
                                    preload="auto"
                                    muted={!!obj.item.muteVideo}
                                />
                            ) : (
                                <img
                                    key={`gpu-${obj.item.id}`}
                                    ref={(el) => { mediaRefs.current[obj.item.id] = el; }}
                                    src={obj.item.src}
                                    className="absolute opacity-0 pointer-events-none"
                                    style={{ width: 1, height: 1, position: 'absolute', left: -9999 }}
                                />
                            )
                        ))
                    }

                </div>

                {/* Eraser Cursor (Fixed Position) */}
                {selectedItemId && interactionMode === 'erase' && cursorPos && (
                    <div
                        className="fixed rounded-full border border-gray-800 bg-white/20 backdrop-invert pointer-events-none z-[9999] shadow-sm"
                        style={{
                            width: eraserSettings.size * currentScale,
                            height: eraserSettings.size * currentScale,
                            left: cursorPos.x,
                            top: cursorPos.y,
                            transform: 'translate(-50%, -50%)'
                        }}
                    ></div>
                )}



                {/* Crop Popup (unchanged logic) */}
                {selectedItem && interactionMode === 'crop' && (
                    <div
                        className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-white rounded-full shadow-xl py-2 px-4 flex items-center gap-3 z-[100] animate-in fade-in slide-in-from-top-4 duration-200 border border-gray-100"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex flex-col w-32">
                            <label className="text-[10px] font-bold text-gray-500 mb-1">Zoom</label>
                            <input type="range" min="1" max="3" step="0.1" value={cropState.zoom} onChange={(e) => setCropState(prev => ({ ...prev, zoom: Number(e.target.value) }))} className="w-full accent-violet-600 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                        </div>
                        <div className="h-8 w-px bg-gray-200"></div>
                        <div className="text-xs text-gray-500 font-medium">Drag image to pan</div>
                        <div className="h-8 w-px bg-gray-200"></div>
                        <button onClick={() => setInteractionMode('none')} className="p-2 hover:bg-red-50 rounded-full text-red-500"><X size={20} /></button>
                        <button onClick={() => saveCrop(selectedItem.trackId, selectedItem)} className="p-2 bg-violet-600 hover:bg-violet-700 rounded-full text-white"><Check size={20} /></button>
                    </div>
                )}

                {/* GPU Acceleration Status Badge */}
                {gpuInfo && (
                    <div
                        className={`absolute bottom-2 right-2 px-2 py-1 rounded text-[10px] font-medium flex items-center gap-1 transition-all ${gpuReady
                            ? 'bg-green-500/80 text-white'
                            : 'bg-gray-500/60 text-white'
                            }`}
                        title={`GPU: ${gpuInfo.name}${gpuInfo.can8K ? ' (8K capable)' : ''}`}
                    >
                        <span className={`w-1.5 h-1.5 rounded-full ${gpuReady ? 'bg-green-200 animate-pulse' : 'bg-gray-300'}`}></span>
                        {gpuReady ? 'GPU' : 'CPU'}
                        {gpuInfo.can8K && gpuReady && <span className="text-[8px] ml-0.5">8K</span>}
                    </div>
                )}
            </div>


        </div>
    );
};

export default Canvas;
