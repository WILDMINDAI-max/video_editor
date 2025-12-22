import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronLeft, Sparkles, Sliders, Palette, Eraser, Undo2, PaintBucket, Search, Plus, SlidersHorizontal, Trash2, Pipette, Volume2, Gauge, Minus, Circle, Square, PlayCircle, Image, Layers, Type, Wand2, ArrowUp, MoveRight, Star, PartyPopper, Snowflake, Briefcase, Zap, Waves, RotateCw, Lightbulb, StickyNote, ArrowUpFromLine, Wind, Upload, MoveHorizontal, Ghost, CircleDot, Activity, ZoomIn, ArrowRight, Tv, Brush, Droplet, Monitor, SprayCan, PenTool, Heart, MousePointer2, Maximize, Minimize, Repeat, AlignLeft, AlignCenter, AlignRight, AlignVerticalJustifyCenter, AlignStartVertical, AlignEndVertical, Move, MoveVertical } from 'lucide-react';
import { TimelineItem, Adjustments, DEFAULT_ADJUSTMENTS, FILTERS, BorderStyle, TextEffect, FONTS, ANIMATIONS, ANIMATION_CATEGORIES, DEFAULT_DOCUMENT_COLORS, GRADIENT_COLORS } from '../../../types';

interface EditPanelProps {
    selectedItem: TimelineItem | null;
    isOpen: boolean;
    onClose: () => void;
    onUpdate: (item: TimelineItem, skipHistory?: boolean) => void;
    onOpenEffectView?: (view: 'text-effects' | 'color' | 'animate' | 'font') => void;
    onAlign?: (align: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;

    // Interaction Props
    interactionMode: 'none' | 'crop' | 'erase';
    setInteractionMode: (mode: 'none' | 'crop' | 'erase') => void;
    eraserSettings: { size: number; type: 'erase' | 'restore'; showOriginal: boolean };
    setEraserSettings: React.Dispatch<React.SetStateAction<{ size: number; type: 'erase' | 'restore'; showOriginal: boolean }>>;

    initialView?: 'main' | 'adjust' | 'eraser' | 'color' | 'animate' | 'text-effects' | 'font';
}

type EditView = 'main' | 'adjust' | 'eraser' | 'color' | 'animate' | 'text-effects' | 'font';

// --- Color Constants ---
const PHOTO_COLORS = [
    '#ffffff', '#d1ccc0', '#2c2c2c', '#a67c52', '#7d5fff'
];

const GRADIENT_STYLES = [
    { id: '90deg', label: 'Linear 90°', css: 'linear-gradient(90deg, #e2e8f0, #64748b)', value: '90deg' },
    { id: '180deg', label: 'Linear 180°', css: 'linear-gradient(180deg, #e2e8f0, #64748b)', value: '180deg' },
    { id: '135deg', label: 'Linear 135°', css: 'linear-gradient(135deg, #e2e8f0, #64748b)', value: '135deg' },
    { id: 'center', label: 'Radial Center', css: 'radial-gradient(circle at center, #e2e8f0, #64748b)', value: 'circle at center' },
    { id: 'top-left', label: 'Radial Top-Left', css: 'radial-gradient(circle at top left, #e2e8f0, #64748b)', value: 'circle at top left' },
];

// Helper to convert HSV to Hex
const hsvToHex = (h: number, s: number, v: number) => {
    const S = s / 100;
    const V = v / 100;
    const C = V * S;
    const X = C * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = V - C;

    let R1 = 0, G1 = 0, B1 = 0;
    if (0 <= h && h < 60) { R1 = C; G1 = X; B1 = 0; }
    else if (60 <= h && h < 120) { R1 = X; G1 = C; B1 = 0; }
    else if (120 <= h && h < 180) { R1 = 0; G1 = C; B1 = X; }
    else if (180 <= h && h < 240) { R1 = 0; G1 = X; B1 = C; }
    else if (240 <= h && h < 300) { R1 = X; G1 = 0; B1 = C; }
    else if (300 <= h && h < 360) { R1 = C; G1 = 0; B1 = X; }

    const r = Math.round((R1 + m) * 255);
    const g = Math.round((G1 + m) * 255);
    const b = Math.round((B1 + m) * 255);

    const toHex = (n: number) => {
        const hex = n.toString(16);
        return hex.length === 1 ? "0" + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const hexToHsv = (hex: string) => {
    let r = 0, g = 0, b = 0;
    if (!hex || typeof hex !== 'string') return { h: 0, s: 0, v: 100 };

    hex = hex.replace('#', '');

    if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
    } else {
        return { h: 0, s: 0, v: 100 };
    }

    r /= 255; g /= 255; b /= 255;

    let cmin = Math.min(r, g, b), cmax = Math.max(r, g, b), delta = cmax - cmin;
    let h = 0, s = 0, v = 0;

    if (delta === 0) h = 0;
    else if (cmax === r) h = ((g - b) / delta) % 6;
    else if (cmax === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;

    h = Math.round(h * 60);
    if (h < 0) h += 360;

    v = Math.round(cmax * 100);
    s = cmax === 0 ? 0 : Math.round((delta / cmax) * 100);

    return { h, s, v };
};

const EditPanel = ({
    selectedItem, isOpen, onClose, onUpdate,
    interactionMode, setInteractionMode,
    eraserSettings, setEraserSettings,
    initialView = 'main',
    onAlign
}: EditPanelProps) => {
    const [view, setView] = useState<EditView>(initialView);
    const [fontSearch, setFontSearch] = useState('');

    // Cache the selected item to show it during closing animation
    const [cachedItem, setCachedItem] = useState<TimelineItem | null>(selectedItem);

    // Animation Tab State
    const [animCategory, setAnimCategory] = useState<string>('Basic');
    const originalAnimationRef = useRef<any>(undefined); // Store original animation for hover preview

    const handleAnimHoverStart = (animId: string) => {
        if (!itemToRender) return;
        originalAnimationRef.current = itemToRender.animation;
        onUpdate({
            ...itemToRender,
            animation: { type: animId, category: 'page', timing: itemToRender.animation?.timing || 'both' }
        }, true);
    };

    const handleAnimHoverEnd = () => {
        if (!itemToRender) return;
        // Restore original
        onUpdate({
            ...itemToRender,
            animation: originalAnimationRef.current
        }, true);
    };

    const handleAnimClick = (animId: string) => {
        if (!itemToRender) return;
        const newAnim = { type: animId, category: 'page' as const, timing: itemToRender.animation?.timing || 'both' as const };
        originalAnimationRef.current = newAnim; // Update original so we don't revert on mouse leave
        onUpdate({
            ...itemToRender,
            animation: newAnim
        });
    };

    useEffect(() => {
        if (selectedItem) {
            setCachedItem(selectedItem);
        }
    }, [selectedItem]);

    const itemToRender = selectedItem || cachedItem;

    // Color Picker State
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [pickerColor, setPickerColor] = useState('#ffffff');
    const [pickerTab, setPickerTab] = useState<'solid' | 'gradient'>('solid');
    const [pickerTarget, setPickerTarget] = useState<'background' | 'border'>('background');
    const colorPickerRef = useRef<HTMLDivElement>(null);

    // HSV State
    const [hsv, setHsv] = useState({ h: 0, s: 0, v: 100 });
    const satValRef = useRef<HTMLDivElement>(null);
    const [isDraggingSatVal, setIsDraggingSatVal] = useState(false);

    // Gradient Editing State
    const [gradientStops, setGradientStops] = useState<{ color: string, pos: number }[]>([{ color: '#ffffff', pos: 0 }, { color: '#000000', pos: 100 }]);
    const [activeStopIndex, setActiveStopIndex] = useState(0);
    const [gradientDirection, setGradientDirection] = useState('90deg');

    // --- Effects ---

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isDraggingSatVal) return;
            if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
                setShowColorPicker(false);
            }
        };
        if (showColorPicker) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showColorPicker, isDraggingSatVal]);

    useEffect(() => {
        if (initialView && initialView !== view) {
            setView(initialView);
        }
    }, [initialView]);

    useEffect(() => {
        if (interactionMode === 'erase') {
            setView('eraser');
        } else if (view === 'eraser') {
            setView('main');
        }
    }, [interactionMode, view]);

    // --- Color Logic ---

    const handleColorUpdate = (newColor: string, updateItem = true) => {
        setPickerColor(newColor);
        if (!newColor.includes('gradient') && newColor.startsWith('#')) {
            if (!isDraggingSatVal) setHsv(hexToHsv(newColor));
        }
        if (updateItem && itemToRender) {
            if (pickerTarget === 'background') {
                onUpdate({
                    ...itemToRender,
                    type: 'color',
                    src: newColor,
                    backgroundColor: undefined,
                    thumbnail: undefined,
                });
            } else if (pickerTarget === 'border') {
                onUpdate({
                    ...itemToRender,
                    border: {
                        width: itemToRender.border?.width || 4,
                        style: itemToRender.border?.style || 'solid',
                        color: newColor
                    }
                });
            }
        }
    };

    const selectPresetColor = (color: string) => {
        handleColorUpdate(color);
        setShowColorPicker(false);
    };

    const updateGradientString = (stops: { color: string, pos: number }[], direction: string) => {
        const stopsStr = stops.map(s => `${s.color} ${s.pos}%`).join(', ');
        let str = '';
        if (direction.includes('circle')) {
            str = `radial-gradient(${direction}, ${stopsStr})`;
        } else {
            str = `linear-gradient(${direction}, ${stopsStr})`;
        }
        handleColorUpdate(str);
    };

    const handleSatValDrag = useCallback((e: MouseEvent | React.MouseEvent) => {
        if (!satValRef.current) return;
        e.preventDefault();
        const rect = satValRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        const newS = Math.round(x * 100);
        const newV = Math.round((1 - y) * 100);

        setHsv(prev => {
            const newHsv = { ...prev, s: newS, v: newV };
            const hex = hsvToHex(newHsv.h, newHsv.s, newHsv.v);
            if (pickerTab === 'solid') handleColorUpdate(hex, true);
            else {
                const newStops = [...gradientStops];
                if (newStops[activeStopIndex]) {
                    newStops[activeStopIndex].color = hex;
                    setGradientStops(newStops);
                    updateGradientString(newStops, gradientDirection);
                }
            }
            return newHsv;
        });
    }, [pickerTab, gradientStops, activeStopIndex, gradientDirection, pickerTarget]);

    const handleEyedropper = async () => {
        if (!(window as any).EyeDropper) {
            alert('Eyedropper not supported in this browser');
            return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const eyeDropper = new (window as any).EyeDropper();
        try {
            const result = await eyeDropper.open();
            handleColorUpdate(result.sRGBHex);
            if (pickerTab === 'solid') setHsv(hexToHsv(result.sRGBHex));
        } catch (e) { /* ignore */ }
    };

    useEffect(() => {
        if (isDraggingSatVal) {
            const handleWindowMouseMove = (e: MouseEvent) => handleSatValDrag(e);
            const handleWindowMouseUp = () => setIsDraggingSatVal(false);
            window.addEventListener('mousemove', handleWindowMouseMove);
            window.addEventListener('mouseup', handleWindowMouseUp);
            return () => {
                window.removeEventListener('mousemove', handleWindowMouseMove);
                window.removeEventListener('mouseup', handleWindowMouseUp);
            };
        }
    }, [isDraggingSatVal, handleSatValDrag]);

    const handleStopColorChange = (color: string) => {
        const newStops = [...gradientStops];
        newStops[activeStopIndex].color = color;
        setGradientStops(newStops);
        setHsv(hexToHsv(color));
        updateGradientString(newStops, gradientDirection);
    };

    const handleOpenPicker = (e: React.MouseEvent, color: string, target: 'background' | 'border') => {
        e.stopPropagation();
        setPickerTarget(target);
        setPickerColor(color);

        if (color.includes('gradient')) {
            setPickerTab('gradient');
            let dir = '90deg';
            if (color.includes('circle at center')) dir = 'circle at center';
            else if (color.includes('circle at top left')) dir = 'circle at top left';
            else if (color.includes('180deg')) dir = '180deg';
            else if (color.includes('135deg')) dir = '135deg';
            else if (color.includes('90deg')) dir = '90deg';
            setGradientDirection(dir);

            const colors = color.match(/#[a-fA-F0-9]{6}/g);
            if (colors && colors.length >= 2) {
                setGradientStops([
                    { color: colors[0], pos: 0 },
                    { color: colors[colors.length - 1], pos: 100 }
                ]);
                setActiveStopIndex(0);
                setHsv(hexToHsv(colors[0]));
            }
        } else {
            setPickerTab('solid');
            setHsv(hexToHsv(color));
        }

        setShowColorPicker(true);
    };

    // --- Renderers ---

    const renderHSBPicker = () => (
        <>
            <div
                ref={satValRef}
                className="w-full h-32 rounded-lg mb-3 relative cursor-crosshair shadow-inner ring-1 ring-black/5 overflow-hidden touch-none"
                style={{
                    backgroundColor: `hsl(${hsv.h}, 100%, 50%)`,
                    backgroundImage: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)`
                }}
                onMouseDown={(e) => { setIsDraggingSatVal(true); handleSatValDrag(e); }}
            >
                <div
                    className="absolute w-3 h-3 border-2 border-white rounded-full shadow-sm -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10"
                    style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%` }}
                ></div>
            </div>

            <div className="relative h-3 mb-3 rounded-full overflow-hidden shadow-inner border border-gray-200 ring-1 ring-black/5">
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)' }}></div>
                <input
                    type="range" min="0" max="360"
                    value={hsv.h}
                    onChange={(e) => {
                        const newH = Number(e.target.value);
                        setHsv(prev => {
                            const newHsv = { ...prev, h: newH };
                            const hex = hsvToHex(newHsv.h, newHsv.s, newHsv.v);
                            if (pickerTab === 'solid') handleColorUpdate(hex);
                            else {
                                const newStops = [...gradientStops];
                                if (newStops[activeStopIndex]) {
                                    newStops[activeStopIndex].color = hex;
                                    setGradientStops(newStops);
                                    updateGradientString(newStops, gradientDirection);
                                }
                            }
                            return newHsv;
                        });
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div
                    className="absolute top-0 bottom-0 w-3 h-3 bg-transparent border-2 border-white rounded-full shadow-sm pointer-events-none transform translate-x-[-50%]"
                    style={{
                        left: `${(hsv.h / 360) * 100}%`,
                        backgroundColor: `hsl(${hsv.h}, 100%, 50%)`,
                        boxShadow: '0 0 2px rgba(0,0,0,0.3)'
                    }}
                ></div>
            </div>

            <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center border border-gray-300 rounded-lg px-2 py-1 bg-white focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-200 transition-all shadow-sm">
                    <div
                        className="w-5 h-5 rounded-full border border-gray-200 shadow-sm shrink-0 mr-2"
                        style={{ background: pickerTab === 'solid' ? pickerColor : (gradientStops[activeStopIndex]?.color || '#000') }}
                    ></div>
                    <input
                        type="text"
                        value={(pickerTab === 'solid' ? pickerColor : (gradientStops[activeStopIndex]?.color || '#000')).toUpperCase()}
                        onChange={(e) => {
                            let val = e.target.value;
                            if (!val.startsWith('#')) val = '#' + val;
                            if (pickerTab === 'solid') handleColorUpdate(val);
                            else handleStopColorChange(val);
                        }}
                        className="w-full bg-transparent text-xs font-medium text-gray-700 focus:outline-none uppercase"
                    />
                </div>
                <button
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors shadow-sm bg-white"
                    onClick={handleEyedropper}
                    title="Pick color from screen"
                >
                    <Pipette size={16} />
                </button>
            </div>
        </>
    );

    const renderColorPickerPopup = () => (
        <div
            ref={colorPickerRef}
            className="relative bg-white rounded-xl border border-gray-200 mb-4 shadow-sm overflow-hidden w-full animate-in fade-in slide-in-from-top-2 duration-200"
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div className="flex border-b border-gray-100">
                <button
                    className={`flex-1 py-2.5 text-xs font-semibold transition-colors relative ${pickerTab === 'solid' ? 'text-violet-600' : 'text-gray-500 hover:bg-gray-50'}`}
                    onClick={() => setPickerTab('solid')}
                >
                    Solid
                    {pickerTab === 'solid' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-600 rounded-t-full mx-4"></div>}
                </button>
                <button
                    className={`flex-1 py-2.5 text-xs font-semibold transition-colors relative ${pickerTab === 'gradient' ? 'text-violet-600' : 'text-gray-500 hover:bg-gray-50'}`}
                    onClick={() => {
                        setPickerTab('gradient');
                        if (!pickerColor.includes('gradient')) {
                            const newStops = [{ color: pickerColor, pos: 0 }, { color: '#ffffff', pos: 100 }];
                            setGradientStops(newStops);
                            updateGradientString(newStops, gradientDirection);
                        }
                    }}
                >
                    Gradient
                    {pickerTab === 'gradient' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-600 rounded-t-full mx-4"></div>}
                </button>
                <button className="px-3 text-gray-400 hover:text-gray-600 hover:bg-gray-50" onClick={() => setShowColorPicker(false)}>
                    <X size={14} />
                </button>
            </div>

            <div className="p-3">
                {pickerTab === 'solid' ? renderHSBPicker() : (
                    <>
                        <div className="mb-3">
                            <h4 className="text-[10px] font-bold text-gray-500 uppercase mb-1.5 tracking-wide">Gradient Colors</h4>
                            <div className="flex gap-2">
                                {gradientStops.map((stop, idx) => (
                                    <button
                                        key={idx}
                                        className={`w-8 h-8 rounded-full border-2 shadow-sm transition-transform flex items-center justify-center ${activeStopIndex === idx ? 'border-violet-600 ring-2 ring-violet-100 scale-110' : 'border-gray-200 hover:border-gray-300'}`}
                                        style={{ background: stop.color }}
                                        onClick={() => {
                                            setActiveStopIndex(idx);
                                            setHsv(hexToHsv(stop.color));
                                        }}
                                    >
                                        {activeStopIndex === idx && <div className="w-1.5 h-1.5 bg-white rounded-full shadow-sm"></div>}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="mb-3">
                            <h4 className="text-[10px] font-bold text-gray-500 uppercase mb-1.5 tracking-wide">Direction</h4>
                            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                                {GRADIENT_STYLES.map(style => (
                                    <button
                                        key={style.id}
                                        onClick={() => {
                                            setGradientDirection(style.value);
                                            updateGradientString(gradientStops, style.value);
                                        }}
                                        className={`w-7 h-7 rounded-md border flex-shrink-0 transition-all ${gradientDirection === style.value ? 'border-violet-600 ring-2 ring-violet-100 bg-violet-50' : 'border-gray-200 hover:bg-gray-50'}`}
                                        style={{ background: style.css }}
                                        title={style.label}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="bg-gray-50 p-2 rounded-lg border border-gray-100 mb-0">
                            {renderHSBPicker()}
                        </div>
                    </>
                )}
            </div>
        </div>
    );

    const adjustments = itemToRender?.adjustments || DEFAULT_ADJUSTMENTS;

    const handleAdjustmentChange = (key: keyof Adjustments, value: number) => {
        if (itemToRender) {
            onUpdate({
                ...itemToRender,
                adjustments: { ...adjustments, [key]: value }
            });
        }
    };
    const renderTextEffectsView = () => (
        <div className="animate-in slide-in-from-right duration-200 pb-24 relative min-h-full">
            <div className="sticky top-0 bg-white/80 backdrop-blur-sm z-40 pb-3 border-b border-gray-100 mb-3 -mx-1 px-1 pt-0">
                <button onClick={() => setView('main')} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 font-medium mb-2">
                    <ChevronLeft size={12} /> Back to effects
                </button>
                <h2 className="text-sm font-bold text-gray-800">Text Effects</h2>
            </div>

            <div className="space-y-4">
                <div className="grid grid-cols-4 gap-2">
                    {(['none', 'shadow', 'lift', 'hollow', 'splice', 'outline', 'echo', 'glitch', 'neon', 'background'] as const).map((type) => (
                        <button
                            key={type}
                            className={`flex flex-col items-center gap-2 p-2 rounded-lg border transition-all aspect-square justify-center ${itemToRender?.textEffect?.type === type ? 'border-violet-600 bg-violet-50 ring-1 ring-violet-200' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
                            onClick={() => itemToRender && onUpdate({
                                ...itemToRender,
                                textEffect: type === 'none' ? undefined : { type, intensity: 50, offset: 50, color: '#000000', direction: 45 }
                            })}
                        >
                            <div className="text-xl font-black italic" style={{ fontFamily: 'serif' }}>
                                {type === 'none' && <span className="text-gray-800">Tx</span>}
                                {type === 'shadow' && <span style={{ textShadow: '2px 2px 2px rgba(0,0,0,0.5)' }}>Tx</span>}
                                {type === 'lift' && <span style={{ textShadow: '0 10px 20px rgba(0,0,0,0.5)' }}>Tx</span>}
                                {type === 'hollow' && <span style={{ WebkitTextStroke: '1px black', color: 'transparent' }}>Tx</span>}
                                {type === 'splice' && <span style={{ WebkitTextStroke: '1px black', color: 'transparent', textShadow: '2px 2px 0px rgba(0,0,0,0.2)' }}>Tx</span>}
                                {type === 'outline' && <span style={{ WebkitTextStroke: '3px gray', color: 'transparent' }}>Tx</span>}
                                {type === 'echo' && <span style={{ textShadow: '-2px -2px 0 rgba(0,0,0,0.2), -4px -4px 0 rgba(0,0,0,0.1)' }}>Tx</span>}
                                {type === 'glitch' && <span style={{ textShadow: '2px 0 #ff00ff, -2px 0 #00ffff' }}>Tx</span>}
                                {type === 'neon' && <span style={{ textShadow: '0 0 5px #d946ef, 0 0 10px #d946ef', color: 'white' }}>Tx</span>}
                                {type === 'background' && <span className="bg-gray-300 px-1 rounded">Tx</span>}
                            </div>
                            <span className="text-[9px] font-medium capitalize text-gray-600 truncate w-full text-center">{type}</span>
                        </button>
                    ))}
                </div>

                {itemToRender?.textEffect && itemToRender.textEffect.type !== 'none' && (
                    <div className="space-y-4 pt-4 border-t border-gray-100">
                        {['shadow', 'lift', 'hollow', 'splice', 'outline', 'echo', 'glitch', 'neon'].includes(itemToRender.textEffect.type) && (
                            <div className="space-y-1">
                                <div className="flex justify-between text-[10px] text-gray-500"><span>Intensity</span><span>{itemToRender.textEffect.intensity}</span></div>
                                <input type="range" min="0" max="100" value={itemToRender.textEffect.intensity} onChange={(e) => itemToRender && onUpdate({ ...itemToRender, textEffect: { ...itemToRender.textEffect!, intensity: Number(e.target.value) } })} className="w-full accent-violet-600 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                            </div>
                        )}

                        {['shadow', 'lift', 'echo', 'glitch', 'splice'].includes(itemToRender.textEffect.type) && (
                            <div className="space-y-1">
                                <div className="flex justify-between text-[10px] text-gray-500"><span>Offset</span><span>{itemToRender.textEffect.offset}</span></div>
                                <input type="range" min="0" max="100" value={itemToRender.textEffect.offset} onChange={(e) => itemToRender && onUpdate({ ...itemToRender, textEffect: { ...itemToRender.textEffect!, offset: Number(e.target.value) } })} className="w-full accent-violet-600 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                            </div>
                        )}

                        {['shadow', 'splice', 'outline', 'neon', 'background'].includes(itemToRender.textEffect.type) && (
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500">Color</label>
                                <div className="flex gap-2">
                                    <input type="color" value={itemToRender.textEffect.color || '#000000'} onChange={(e) => itemToRender && onUpdate({ ...itemToRender, textEffect: { ...itemToRender.textEffect!, color: e.target.value } })} className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
                                    <div className="flex-1 grid grid-cols-5 gap-1">
                                        {['#000000', '#ffffff', '#ef4444', '#f59e0b', '#10b981'].map(c => (
                                            <button key={c} className="w-full h-8 rounded border border-gray-200" style={{ background: c }} onClick={() => itemToRender && onUpdate({ ...itemToRender, textEffect: { ...itemToRender.textEffect!, color: c } })} />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );

    const renderFontView = () => {
        const filteredFonts = FONTS.filter(f => f.name.toLowerCase().includes(fontSearch.toLowerCase()));

        return (
            <div className="animate-in slide-in-from-right duration-200 pb-24 relative min-h-full">
                <div className="sticky top-0 bg-white/80 backdrop-blur-sm z-40 pb-3 border-b border-gray-100 mb-3 -mx-1 px-1 pt-0">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-sm font-bold text-gray-800">Font</h2>
                        <button onClick={() => setView('main')} className="p-1 hover:bg-gray-100 rounded-full">
                            <X size={16} />
                        </button>
                    </div>
                    <div className="relative px-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                        <input
                            type="text"
                            placeholder='Try "Calligraphy" or "Open Sans"'
                            value={fontSearch}
                            onChange={(e) => setFontSearch(e.target.value)}
                            className="w-full pl-9 pr-8 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-200 transition-all shadow-sm"
                        />
                        <button className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded">
                            <SlidersHorizontal size={14} className="text-gray-500" />
                        </button>
                    </div>
                </div>

                <div className="px-1">
                    <h3 className="text-xs font-bold text-gray-800 mb-3 flex items-center gap-2">
                        <span className="text-violet-600">↗</span> Popular fonts
                    </h3>
                    <div className="space-y-1">
                        {filteredFonts.map(font => (
                            <button
                                key={font.name}
                                onClick={() => { itemToRender && onUpdate({ ...itemToRender, fontFamily: font.family }); }}
                                className={`w-full px-4 py-3 text-left text-base hover:bg-gray-50 rounded-lg transition-colors flex items-center justify-between ${itemToRender?.fontFamily === font.family ? 'bg-violet-50 text-violet-700' : 'text-gray-700'}`}
                                style={{ fontFamily: font.family }}
                            >
                                {font.name}
                                {itemToRender?.fontFamily === font.family && <div className="w-1.5 h-1.5 rounded-full bg-violet-600"></div>}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    const renderTransformSection = () => (
        <div className="mb-4 border-b border-gray-100 pb-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                    <Move size={12} /> Basic
                </h3>
                <button
                    onClick={() => itemToRender && onUpdate({ ...itemToRender, x: 0, y: 0, width: 100, height: 100, rotation: 0, flipH: false, flipV: false })}
                    className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                    title="Reset Transform"
                >
                    <RotateCw size={12} className="-scale-x-100" />
                </button>
            </div>

            {/* Scale */}
            <div className={`space-y-2 mb-3 ${itemToRender?.isBackground ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                <div className="space-y-1">
                    <div className="flex justify-between text-xs text-gray-600">
                        <span>Scale</span>
                        <span className="font-mono text-[10px] bg-gray-100 px-1.5 py-0.5 rounded">{Math.round(itemToRender?.width || 100)}%</span>
                    </div>
                    <input
                        type="range" min="10" max="200"
                        value={itemToRender?.width || 100}
                        onChange={(e) => itemToRender && onUpdate({ ...itemToRender, width: Number(e.target.value), height: Number(e.target.value) })}
                        className="w-full accent-violet-600 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                </div>
            </div>

            {/* Opacity */}
            <div className="space-y-2 mb-3">
                <div className="space-y-1">
                    <div className="flex justify-between text-xs text-gray-600">
                        <span>Opacity</span>
                        <span className="font-mono text-[10px] bg-gray-100 px-1.5 py-0.5 rounded">{Math.round(itemToRender?.opacity ?? 100)}%</span>
                    </div>
                    <input
                        type="range" min="0" max="100"
                        value={itemToRender?.opacity ?? 100}
                        onChange={(e) => itemToRender && onUpdate({ ...itemToRender, opacity: Number(e.target.value) })}
                        className="w-full accent-violet-600 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                </div>
            </div>

            {/* Position */}
            <div className={`grid grid-cols-2 gap-2 mb-3 ${itemToRender?.isBackground ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Position X</label>
                    <div className="relative">
                        <input
                            type="number"
                            value={Math.round(itemToRender?.x || 0)}
                            onChange={(e) => itemToRender && onUpdate({ ...itemToRender, x: Number(e.target.value) })}
                            className="w-full pl-2 pr-1 py-1.5 bg-gray-50 border border-gray-200 rounded text-xs text-gray-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-200 outline-none transition-all font-mono"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">X</span>
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Position Y</label>
                    <div className="relative">
                        <input
                            type="number"
                            value={Math.round(itemToRender?.y || 0)}
                            onChange={(e) => itemToRender && onUpdate({ ...itemToRender, y: Number(e.target.value) })}
                            className="w-full pl-2 pr-1 py-1.5 bg-gray-50 border border-gray-200 rounded text-xs text-gray-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-200 outline-none transition-all font-mono"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">Y</span>
                    </div>
                </div>
            </div>

            {/* Rotate & Flip */}
            <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Rotate</label>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => itemToRender && onUpdate({ ...itemToRender, rotation: (itemToRender.rotation || 0) - 90 })}
                            className="p-1.5 border border-gray-200 rounded hover:bg-gray-50 text-gray-600"
                            title="Rotate Left"
                        >
                            <RotateCw size={14} className="-scale-x-100" />
                        </button>
                        <input
                            value={Math.round(itemToRender?.rotation || 0)}
                            onChange={(e) => itemToRender && onUpdate({ ...itemToRender, rotation: Number(e.target.value) })}
                            className="w-full py-1.5 bg-gray-50 border border-gray-200 rounded text-xs text-center text-gray-900 focus:border-violet-500 outline-none font-mono"
                        />
                        <button
                            onClick={() => itemToRender && onUpdate({ ...itemToRender, rotation: (itemToRender.rotation || 0) + 90 })}
                            className="p-1.5 border border-gray-200 rounded hover:bg-gray-50 text-gray-600"
                            title="Rotate Right"
                        >
                            <RotateCw size={14} />
                        </button>
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Flip</label>
                    <div className="flex gap-2">
                        <button
                            onClick={() => itemToRender && onUpdate({ ...itemToRender, flipH: !itemToRender.flipH })}
                            className={`flex-1 py-1.5 border rounded flex items-center justify-center transition-colors ${itemToRender?.flipH ? 'bg-violet-50 border-violet-200 text-violet-600' : 'border-gray-200 hover:bg-gray-50 text-gray-600'}`}
                            title="Flip Horizontal"
                        >
                            <MoveHorizontal size={14} />
                        </button>
                        <button
                            onClick={() => itemToRender && onUpdate({ ...itemToRender, flipV: !itemToRender.flipV })}
                            className={`flex-1 py-1.5 border rounded flex items-center justify-center transition-colors ${itemToRender?.flipV ? 'bg-violet-50 border-violet-200 text-violet-600' : 'border-gray-200 hover:bg-gray-50 text-gray-600'}`}
                            title="Flip Vertical"
                        >
                            <MoveVertical size={14} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderMainAdjust = () => (
        <div className="mb-4">
            {/* Transform Section for Images/Videos */}
            {(itemToRender?.type === 'image' || itemToRender?.type === 'video') && renderTransformSection()}

            {itemToRender?.type === 'video' && (
                <div className="mb-6 border-b border-gray-100 pb-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Video</h3>
                    </div>
                    {/* Volume */}
                    <div className="space-y-2 mb-3">
                        <div className="flex justify-between">
                            <div className="flex items-center gap-2 text-xs font-bold text-gray-700">
                                <Volume2 size={14} /> Volume
                            </div>
                            <span className="text-[10px] bg-gray-100 px-1 rounded text-gray-500">{itemToRender.volume ?? 100}%</span>
                        </div>
                        <input
                            type="range" min="0" max="100"
                            value={itemToRender.volume ?? 100}
                            onChange={(e) => itemToRender && onUpdate({ ...itemToRender, volume: Number(e.target.value) })}
                            className="w-full accent-violet-600 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>

                    {/* Remove Audio Toggle */}
                    <div className="flex items-center justify-between mb-3 p-2 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2 text-xs font-bold text-gray-700">
                            <Volume2 size={14} className="text-violet-600" />
                            Remove Audio
                        </div>
                        <button
                            onClick={() => itemToRender && onUpdate({ ...itemToRender, muteVideo: !itemToRender.muteVideo })}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${itemToRender.muteVideo ? 'bg-violet-600' : 'bg-gray-300'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${itemToRender.muteVideo ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                    </div>

                    {/* Speed */}
                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <div className="flex items-center gap-2 text-xs font-bold text-gray-700">
                                <Gauge size={14} /> Speed
                            </div>
                            <span className="text-[10px] bg-gray-100 px-1 rounded text-gray-500">{itemToRender.speed ?? 1}x</span>
                        </div>
                        <input
                            type="range" min="0.1" max="3" step="0.1"
                            value={itemToRender.speed ?? 1}
                            onChange={(e) => itemToRender && onUpdate({ ...itemToRender, speed: Number(e.target.value) })}
                            className="w-full accent-violet-600 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between mb-3">
                <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Alignment</h3>
            </div>

            <div className={`grid grid-cols-6 gap-1.5 mb-4 ${itemToRender?.isBackground ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                <button onClick={() => onAlign && onAlign('left')} className="p-2 bg-white border border-gray-100 rounded-lg flex items-center justify-center hover:border-violet-300 hover:text-violet-600 text-gray-600 transition-all" title="Align Left">
                    <AlignLeft size={16} />
                </button>
                <button onClick={() => onAlign && onAlign('center')} className="p-2 bg-white border border-gray-100 rounded-lg flex items-center justify-center hover:border-violet-300 hover:text-violet-600 text-gray-600 transition-all" title="Align Center">
                    <AlignCenter size={16} />
                </button>
                <button onClick={() => onAlign && onAlign('right')} className="p-2 bg-white border border-gray-100 rounded-lg flex items-center justify-center hover:border-violet-300 hover:text-violet-600 text-gray-600 transition-all" title="Align Right">
                    <AlignRight size={16} />
                </button>
                <button onClick={() => onAlign && onAlign('top')} className="p-2 bg-white border border-gray-100 rounded-lg flex items-center justify-center hover:border-violet-300 hover:text-violet-600 text-gray-600 transition-all" title="Align Top">
                    <AlignStartVertical size={16} />
                </button>
                <button onClick={() => onAlign && onAlign('middle')} className="p-2 bg-white border border-gray-100 rounded-lg flex items-center justify-center hover:border-violet-300 hover:text-violet-600 text-gray-600 transition-all" title="Align Middle">
                    <AlignVerticalJustifyCenter size={16} />
                </button>
                <button onClick={() => onAlign && onAlign('bottom')} className="p-2 bg-white border border-gray-100 rounded-lg flex items-center justify-center hover:border-violet-300 hover:text-violet-600 text-gray-600 transition-all" title="Align Bottom">
                    <AlignEndVertical size={16} />
                </button>
            </div>

            <div className="flex items-center justify-between mb-3">
                <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Quick Actions</h3>
            </div>

            <div className="grid grid-cols-2 gap-1.5 mb-2.5">
                {/* Only show Background Color if it's a background item, since detached items use floating panel */}
                {itemToRender?.isBackground && (
                    <button
                        onClick={() => setView('color')}
                        className="p-2 bg-white border border-gray-100 rounded-lg flex flex-col items-center gap-2 hover:border-violet-300 hover:shadow-sm transition-all group text-center h-full"
                    >
                        <div className="w-8 h-8 rounded-md bg-gray-50 border border-gray-200 flex items-center justify-center group-hover:scale-105 transition-transform overflow-hidden">
                            {itemToRender?.type === 'color' ? (
                                <div className="w-full h-full" style={{ background: itemToRender.src }}></div>
                            ) : (
                                <PaintBucket size={16} className="text-gray-600 group-hover:text-violet-600" />
                            )}
                        </div>
                        <div className="min-w-0 w-full">
                            <p className="text-xs font-bold text-gray-800 truncate">Background</p>
                            <p className="text-[9px] text-gray-500 truncate">Change color</p>
                        </div>
                    </button>
                )}

                {itemToRender?.type === 'text' && (
                    <>
                        <button
                            onClick={() => setView('font')}
                            className="p-2 bg-white border border-gray-100 rounded-lg flex flex-col items-center gap-2 hover:border-violet-300 hover:shadow-sm transition-all group text-center h-full"
                        >
                            <div className="w-8 h-8 rounded-md bg-gray-50 border border-gray-200 flex items-center justify-center group-hover:scale-105 transition-transform">
                                <Type size={16} className="text-gray-600 group-hover:text-violet-600" />
                            </div>
                            <div className="min-w-0 w-full">
                                <p className="text-xs font-bold text-gray-800 truncate">Font</p>
                                <p className="text-[9px] text-gray-500 truncate">{itemToRender.fontFamily?.split(',')[0].replace(/"/g, '') || 'Default'}</p>
                            </div>
                        </button>

                        <button
                            onClick={() => setView('text-effects')}
                            className="p-2 bg-white border border-gray-100 rounded-lg flex flex-col items-center gap-2 hover:border-violet-300 hover:shadow-sm transition-all group text-center h-full"
                        >
                            <div className="w-8 h-8 rounded-md bg-gray-50 border border-gray-200 flex items-center justify-center group-hover:scale-105 transition-transform">
                                <Wand2 size={16} className="text-gray-600 group-hover:text-violet-600" />
                            </div>
                            <div className="min-w-0 w-full">
                                <p className="text-xs font-bold text-gray-800 truncate">Text Effects</p>
                                <p className="text-[9px] text-gray-500 truncate">Shadows, outline</p>
                            </div>
                        </button>
                    </>
                )}

                <button
                    onClick={() => setView('animate')}
                    className="p-2 bg-white border border-gray-100 rounded-lg flex flex-col items-center gap-2 hover:border-violet-300 hover:shadow-sm transition-all group text-center h-full"
                >
                    <div className="w-8 h-8 rounded-md bg-gray-50 border border-gray-200 flex items-center justify-center group-hover:scale-105 transition-transform">
                        <PlayCircle size={16} className="text-gray-600 group-hover:text-violet-600" />
                    </div>
                    <div className="min-w-0 w-full">
                        <p className="text-xs font-bold text-gray-800 truncate">Animate</p>
                        <p className="text-[9px] text-gray-500 truncate">Motion effects</p>
                    </div>
                </button>

                <button
                    onClick={() => setView('adjust')}
                    className="p-2 bg-white border border-gray-100 rounded-lg flex flex-col items-center gap-2 hover:border-violet-300 hover:shadow-sm transition-all group text-center h-full"
                >
                    <div className="w-8 h-8 rounded-md bg-gray-50 border border-gray-200 flex items-center justify-center group-hover:scale-105 transition-transform">
                        <Sliders size={16} className="text-gray-600 group-hover:text-violet-600" />
                    </div>
                    <div className="min-w-0 w-full">
                        <p className="text-xs font-bold text-gray-800 truncate">Adjustments</p>
                        <p className="text-[9px] text-gray-500 truncate">Light, color & more</p>
                    </div>
                </button>
            </div>
        </div>
    );


    const renderAnimateView = () => (
        <div className="animate-in slide-in-from-right duration-200 min-h-full pb-20">
            <div className="sticky top-0 bg-white/80 backdrop-blur-sm z-10 pb-2 border-b border-gray-100 mb-4 -mx-1 px-1 pt-0">
                <button onClick={() => setView('main')} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 font-medium mb-3">
                    <ChevronLeft size={12} /> Back
                </button>

                <div className="flex bg-gray-100 p-1 rounded-lg">
                    {['enter', 'exit', 'both'].map((t) => (
                        <button
                            key={t}
                            onClick={() => itemToRender?.animation && onUpdate({ ...itemToRender, animation: { ...itemToRender.animation, timing: t as any } })}
                            disabled={!itemToRender?.animation}
                            className={`flex-1 py-1.5 text-[10px] font-bold rounded-md capitalize transition-all ${itemToRender?.animation?.timing === t || (!itemToRender?.animation?.timing && t === 'both')
                                ? 'bg-white shadow text-violet-700'
                                : 'text-gray-400 hover:text-gray-600'
                                } ${!itemToRender?.animation ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-gray-600">Duration</label>
                    <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        {itemToRender?.animation?.duration || 1}s
                    </span>
                </div>
                <input
                    type="range"
                    min="0.1"
                    max="5"
                    step="0.1"
                    value={itemToRender?.animation?.duration || 1}
                    onChange={(e) => itemToRender?.animation && onUpdate({ ...itemToRender, animation: { ...itemToRender.animation, duration: Number(e.target.value) } })}
                    disabled={!itemToRender?.animation}
                    className={`w-full accent-violet-600 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer ${!itemToRender?.animation ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
            </div>

            <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Animations</h3>
                </div>

                {/* Category Tabs */}
                <div className="flex gap-1 overflow-x-auto pb-2 mb-2 scrollbar-none -mx-1 px-1">
                    {ANIMATION_CATEGORIES.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setAnimCategory(cat)}
                            className={`px-3 py-1.5 rounded-full text-[10px] font-bold whitespace-nowrap transition-colors ${animCategory === cat ? 'bg-violet-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                <div className="grid grid-cols-4 gap-2">
                    <button
                        onClick={() => itemToRender && onUpdate({ ...itemToRender, animation: undefined })}
                        className={`flex flex-col items-center gap-2 p-2 rounded-lg border transition-all aspect-square justify-center ${!itemToRender?.animation ? 'border-violet-600 bg-violet-50 ring-1 ring-violet-200' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
                    >
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                            <X size={16} />
                        </div>
                        <span className="text-[9px] font-medium text-gray-600 truncate w-full text-center">None</span>
                    </button>

                    {ANIMATIONS.filter(a => a.category === animCategory).map((anim) => (
                        <button
                            key={anim.id}
                            onClick={() => handleAnimClick(anim.id)}
                            onMouseEnter={() => handleAnimHoverStart(anim.id)}
                            onMouseLeave={handleAnimHoverEnd}
                            className={`flex flex-col items-center gap-2 p-2 rounded-lg border transition-all aspect-square justify-center group relative overflow-hidden ${itemToRender?.animation?.type === anim.id ? 'border-violet-600 bg-violet-50 ring-1 ring-violet-200' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
                        >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${itemToRender?.animation?.type === anim.id ? 'bg-violet-100 text-violet-600' : 'bg-gray-100 text-gray-500 group-hover:bg-white group-hover:text-violet-500'}`}>
                                {anim.icon}
                            </div>
                            <span className="text-[9px] font-medium text-gray-600 truncate w-full text-center group-hover:text-violet-700">{anim.name}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );


    const renderColorView = () => (
        <div className="animate-in slide-in-from-right duration-200 pb-24 relative min-h-full">
            <div className="sticky top-0 bg-white/80 backdrop-blur-sm z-40 pb-3 border-b border-gray-100 mb-3 -mx-1 px-1 pt-0">
                <button onClick={() => setView('main')} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 font-medium mb-2">
                    <ChevronLeft size={12} /> Back to effects
                </button>
            </div>

            {showColorPicker && renderColorPickerPopup()}

            <div className="mb-5">
                <h3 className="text-xs font-bold text-gray-800 flex items-center gap-2 mb-2">
                    Colors
                </h3>
                <div className="grid grid-cols-5 gap-2 relative">
                    <button
                        onClick={(e) => handleOpenPicker(e, '#ffffff', 'background')}
                        className="w-full aspect-square rounded-lg border border-gray-300 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors relative group"
                    >
                        <div className="w-full h-full rounded-lg p-0.5 bg-gradient-to-br from-red-400 via-green-400 to-blue-400">
                            <div className="w-full h-full bg-white rounded-lg flex items-center justify-center">
                                <Plus size={16} />
                            </div>
                        </div>
                    </button>

                    {DEFAULT_DOCUMENT_COLORS.map((color) => (
                        <div key={color} className="relative group w-full aspect-square">
                            <button
                                onClick={() => selectPresetColor(color)}
                                className={`w-full h-full rounded-lg border border-gray-200 shadow-sm transition-transform ${itemToRender?.src === color ? 'ring-2 ring-violet-500 ring-offset-1' : ''}`}
                                style={{ background: color }}
                            />
                        </div>
                    ))}
                </div>
            </div>

            <div className="h-px bg-gray-100 w-full my-3"></div>

            <div className="mb-5">
                <h3 className="text-xs font-bold text-gray-800 mb-2">Gradients</h3>
                <div className="grid grid-cols-5 gap-2">
                    {GRADIENT_COLORS.map((color, idx) => (
                        <button
                            key={idx}
                            onClick={() => selectPresetColor(color)}
                            className={`w-full aspect-square rounded-lg border border-gray-200 shadow-sm hover:scale-110 transition-transform ${itemToRender?.src === color ? 'ring-2 ring-violet-500 ring-offset-1' : ''}`}
                            style={{ background: color }}
                        />
                    ))}
                </div>
            </div>
        </div>
    );

    const renderEraserView = () => (
        <div className="animate-in slide-in-from-right duration-200 flex flex-col h-full pt-2">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-bold text-gray-800">Eraser Settings</h3>
                <button onClick={() => setInteractionMode('none')} className="text-xs font-bold text-violet-600 hover:text-violet-700">Exit</button>
            </div>

            <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-gray-600">Brush Size</label>
                    <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{eraserSettings.size}px</span>
                </div>
                <input
                    type="range" min="1" max="100"
                    value={eraserSettings.size}
                    onChange={(e) => setEraserSettings({ ...eraserSettings, size: Number(e.target.value) })}
                    className="w-full accent-violet-600 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <label className="text-xs text-gray-700 font-medium">Compare Original</label>
                <button
                    onClick={() => setEraserSettings({ ...eraserSettings, showOriginal: !eraserSettings.showOriginal })}
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 ease-in-out ${eraserSettings.showOriginal ? 'bg-violet-600' : 'bg-gray-300'}`}
                >
                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ease-in-out ${eraserSettings.showOriginal ? 'translate-x-4' : 'translate-x-0'}`}></div>
                </button>
            </div>

            <div className="mt-auto pt-4 border-t border-gray-100 grid grid-cols-2 gap-2">
                <button
                    onClick={() => itemToRender && onUpdate({ ...itemToRender, maskImage: undefined })}
                    className="py-2 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-50"
                >
                    Reset
                </button>
                <button
                    onClick={() => setInteractionMode('none')}
                    className="py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-bold shadow-sm"
                >
                    Done
                </button>
            </div>
        </div>
    );

    const getHeaderTitle = () => {
        switch (view) {
            case 'main': return 'Effects & Styles';
            case 'adjust': return 'Adjustments';
            case 'color': return 'Colors';
            case 'animate': return 'Animate';
            case 'eraser': return 'Magic Eraser';
            case 'text-effects': return 'Text Effects';
            case 'font': return 'Font';
            default: return 'Edit';
        }
    };

    return (
        <div className={`bg-white h-full border-r border-gray-200 flex flex-col transition-all duration-300 ease-in-out overflow-hidden relative z-20 ${isOpen ? 'w-80' : 'w-0 opacity-0'}`}>
            <div className="w-80 h-full flex flex-col overflow-x-hidden">
                {itemToRender && (
                    <>
                        {view !== 'eraser' && (
                            <div className="h-12 flex items-center justify-between px-4 border-b border-gray-100 shrink-0 bg-white z-10">
                                <span className="font-bold text-gray-800 capitalize text-lg tracking-tight">{getHeaderTitle()}</span>
                                <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
                                    <X size={18} />
                                </button>
                            </div>
                        )}

                        <div className={`flex-1 overflow-y-auto custom-scrollbar relative ${view === 'eraser' ? 'p-3' : 'p-3'}`}>
                            {view === 'main' && (
                                <div className="animate-in fade-in slide-in-from-left-2 duration-200">
                                    {renderMainAdjust()}
                                    {itemToRender.type !== 'text' && (
                                        <div className="mb-6">
                                            <div className="flex items-center justify-between mb-3">
                                                <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Filters</h3>
                                            </div>
                                            <div className="grid grid-cols-4 gap-2">
                                                {FILTERS.map(f => (
                                                    <div key={f.id} className="flex flex-col items-center gap-1 group cursor-pointer" onClick={() => itemToRender && onUpdate({ ...itemToRender, filter: f.id, filterIntensity: 50 })}>
                                                        <div className={`w-full aspect-square rounded-lg overflow-hidden border-2 transition-all relative ${itemToRender.filter === f.id ? 'border-violet-600 ring-2 ring-violet-100' : 'border-transparent hover:border-gray-200'}`}>
                                                            <div className="w-full h-full bg-gray-100 relative">
                                                                <img src={itemToRender.thumbnail || itemToRender.src} className="w-full h-full object-cover" style={{ filter: f.style }} loading="lazy" />
                                                            </div>
                                                            {itemToRender.filter === f.id && (
                                                                <div className="absolute inset-0 bg-violet-600/20 flex items-center justify-center">
                                                                    <div className="w-2 h-2 bg-white rounded-full shadow-sm"></div>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <span className={`text-[9px] font-bold truncate w-full text-center ${itemToRender.filter === f.id ? 'text-violet-600' : 'text-gray-400'}`}>{f.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                            {view === 'adjust' && (
                                <div className="animate-in slide-in-from-right duration-200">
                                    <div className="sticky top-0 bg-white/80 backdrop-blur-sm z-10 pb-4 border-b border-gray-100 mb-4 -mx-1 px-1 pt-0">
                                        <button onClick={() => setView('main')} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 font-medium mb-3">
                                            <ChevronLeft size={12} /> Back
                                        </button>

                                        <div className="space-y-4 mb-4">
                                            <div className="flex items-center gap-2 text-gray-800 font-bold text-xs">
                                                <Palette size={14} /> White Balance
                                            </div>
                                            <div className="space-y-3 pl-1">
                                                <div className="space-y-1"><div className="flex justify-between"><span className="text-xs text-gray-600">Temp</span><span className="text-[10px] bg-gray-100 px-1 rounded text-gray-500">{adjustments.temperature}</span></div><input type="range" min="-100" max="100" value={adjustments.temperature} onChange={(e) => handleAdjustmentChange('temperature', Number(e.target.value))} className="w-full accent-violet-600 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer" /></div>
                                                <div className="space-y-1"><div className="flex justify-between"><span className="text-xs text-gray-600">Tint</span><span className="text-[10px] bg-gray-100 px-1 rounded text-gray-500">{adjustments.tint}</span></div><input type="range" min="-100" max="100" value={adjustments.tint} onChange={(e) => handleAdjustmentChange('tint', Number(e.target.value))} className="w-full accent-violet-600 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer" /></div>
                                            </div>
                                        </div>

                                        <div className="space-y-4 mb-4">
                                            <div className="flex items-center gap-2 text-gray-800 font-bold text-xs"><Sparkles size={14} /> Light</div>
                                            <div className="space-y-3 pl-1">
                                                {['brightness', 'contrast', 'highlights', 'shadows', 'whites', 'blacks'].map((key) => (
                                                    <div key={key} className="space-y-1"><div className="flex justify-between capitalize"><span className="text-xs text-gray-600">{key}</span><span className="text-[10px] bg-gray-100 px-1 rounded text-gray-500">{adjustments[key as keyof Adjustments]}</span></div><input type="range" min="-100" max="100" value={adjustments[key as keyof Adjustments]} onChange={(e) => handleAdjustmentChange(key as keyof Adjustments, Number(e.target.value))} className="w-full accent-violet-600 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer" /></div>
                                                ))}
                                            </div>
                                        </div>

                                        <button onClick={() => itemToRender && onUpdate({ ...itemToRender, adjustments: DEFAULT_ADJUSTMENTS })} className="w-full py-2 border border-gray-200 rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-50 transition-colors">
                                            Reset
                                        </button>
                                    </div>
                                </div>
                            )}
                            {view === 'color' && renderColorView()}
                            {view === 'text-effects' && renderTextEffectsView()}
                            {view === 'eraser' && renderEraserView()}
                            {view === 'animate' && renderAnimateView()}
                            {view === 'font' && renderFontView()}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default EditPanel;

