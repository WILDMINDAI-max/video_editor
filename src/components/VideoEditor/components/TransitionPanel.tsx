
import React from 'react';
import { X, Circle, ArrowRight, ArrowLeft, ArrowUp, ArrowDown, MoveRight, Layers, Copy, Grid, RotateCcw, Ban, Wand2, ScanLine, CheckCircle2, Square, Gem, Plus, Columns, AlignJustify, Clock, LayoutGrid, Zap, BookOpen, Film, Sun, Moon, Waves, Eraser, RotateCw, MoveDiagonal, ZapOff, Split, Flame, Heart, Triangle, Box, Monitor, Droplet, Brush, Palette, Image, Maximize, Minimize, Shuffle, Grip, Wind } from 'lucide-react';
import { Transition, TransitionType } from '../../../types';

interface TransitionPanelProps {
    transition: Transition | undefined;
    onUpdate: (t: Transition) => void;
    onApplyToAll: (t: Transition) => void;
    onHover: (t: TransitionType | null) => void;
    onClose: () => void;
}

const TransitionPanel: React.FC<TransitionPanelProps> = ({ transition, onUpdate, onApplyToAll, onHover, onClose }) => {
    const currentType = transition?.type || 'none';
    const currentDuration = transition?.duration || 0.5;
    const currentDirection = transition?.direction || 'left';
    const currentSpeed = transition?.speed || 1.0;
    const currentOrigin = transition?.origin || 'center';

    const [activeSection, setActiveSection] = React.useState<'normal' | 'advanced'>('normal');
    const [justApplied, setJustApplied] = React.useState(false);

    const normalTransitions: { id: TransitionType; label: string; icon: React.ElementType; category?: string }[] = [
        { id: 'none', label: 'None', icon: Ban, category: 'Basic' },

        // Dissolves
        { id: 'dissolve', label: 'Dissolve', icon: Grid, category: 'Dissolve' },
        { id: 'film-dissolve', label: 'Film Dissolve', icon: Film, category: 'Dissolve' },
        { id: 'additive-dissolve', label: 'Additive', icon: Sun, category: 'Dissolve' },
        { id: 'dip-to-black', label: 'Dip to Black', icon: Moon, category: 'Dissolve' },
        { id: 'dip-to-white', label: 'Dip to White', icon: Maximize, category: 'Dissolve' },

        // Slides
        { id: 'slide', label: 'Slide', icon: Shuffle, category: 'Slide' },
        { id: 'push', label: 'Push', icon: ArrowRight, category: 'Slide' },
        { id: 'whip', label: 'Whip', icon: Zap, category: 'Slide' },
        { id: 'split', label: 'Split', icon: Columns, category: 'Slide' },

        // Iris
        { id: 'circle', label: 'Iris Round', icon: Circle, category: 'Iris' },
        { id: 'iris-box', label: 'Iris Box', icon: Square, category: 'Iris' },
        { id: 'iris-diamond', label: 'Iris Diamond', icon: Gem, category: 'Iris' },
        { id: 'iris-cross', label: 'Iris Cross', icon: Plus, category: 'Iris' },

        // Wipes
        { id: 'wipe', label: 'Wipe', icon: Eraser, category: 'Wipe' },
        { id: 'barn-doors', label: 'Barn Doors', icon: LayoutGrid, category: 'Wipe' },
        { id: 'clock-wipe', label: 'Clock Wipe', icon: Clock, category: 'Wipe' },
        { id: 'venetian-blinds', label: 'Venetian', icon: AlignJustify, category: 'Wipe' },
        { id: 'checker-wipe', label: 'Checker', icon: CheckCircle2, category: 'Wipe' },
        { id: 'zig-zag', label: 'Zig Zag', icon: Wind, category: 'Wipe' },

        // Zoom & Page
        { id: 'cross-zoom', label: 'Cross Zoom', icon: MoveDiagonal, category: 'Zoom' },
        { id: 'zoom-in', label: 'Zoom In', icon: Maximize, category: 'Zoom' },
        { id: 'zoom-out', label: 'Zoom Out', icon: Minimize, category: 'Zoom' },
        { id: 'warp-zoom', label: 'Warp Zoom', icon: Wand2, category: 'Zoom' },
        { id: 'morph-cut', label: 'Morph Cut', icon: Shuffle, category: 'Zoom' },
        { id: 'page-peel', label: 'Page Peel', icon: BookOpen, category: 'Page' },

        // Legacy
        { id: 'stack', label: 'Stack', icon: Layers, category: 'Other' },
        { id: 'flow', label: 'Flow', icon: RotateCcw, category: 'Other' },
    ];

    const advancedTransitions: { id: TransitionType; label: string; icon: React.ElementType; category?: string }[] = [
        // 3D & Perspective
        { id: 'cube-rotate', label: 'Cube Rotate', icon: Box, category: '3D' },
        { id: 'flip-3d', label: '3D Flip', icon: RotateCw, category: '3D' },

        // Glitch & Digital
        { id: 'glitch', label: 'Glitch', icon: ZapOff, category: 'Digital' },
        { id: 'rgb-split', label: 'RGB Split', icon: Split, category: 'Digital' },
        { id: 'pixelate', label: 'Pixelate', icon: Grid, category: 'Digital' },
        { id: 'datamosh', label: 'Datamosh', icon: Monitor, category: 'Digital' },

        // Light & Color
        { id: 'film-burn', label: 'Film Burn', icon: Flame, category: 'Light' },
        { id: 'flash', label: 'Flash', icon: Zap, category: 'Light' },
        { id: 'light-leak', label: 'Light Leak', icon: Sun, category: 'Light' },
        { id: 'luma-dissolve', label: 'Luma Dissolve', icon: ScanLine, category: 'Light' },
        { id: 'fade-color', label: 'Fade Color', icon: Palette, category: 'Light' },

        // Distort & Liquid
        { id: 'ripple', label: 'Ripple', icon: Waves, category: 'Distort' },
        { id: 'liquid', label: 'Liquid', icon: Droplet, category: 'Distort' },
        { id: 'stretch', label: 'Stretch', icon: MoveRight, category: 'Distort' },

        // Shapes
        { id: 'shape-circle', label: 'Circle', icon: Circle, category: 'Shape' },
        { id: 'shape-heart', label: 'Heart', icon: Heart, category: 'Shape' },
        { id: 'shape-triangle', label: 'Triangle', icon: Triangle, category: 'Shape' },

        // Tile & Grid
        { id: 'tile-drop', label: 'Tile Drop', icon: LayoutGrid, category: 'Tile' },
        { id: 'mosaic-grid', label: 'Mosaic', icon: Image, category: 'Tile' },
        { id: 'split-screen', label: 'Split Screen', icon: Columns, category: 'Tile' },

        // Blur & Speed
        { id: 'speed-blur', label: 'Speed Blur', icon: Wind, category: 'Blur' },
        { id: 'whip-pan', label: 'Whip Pan', icon: Grip, category: 'Blur' },
        { id: 'zoom-blur', label: 'Zoom Blur', icon: MoveDiagonal, category: 'Blur' },

        // Stylized
        { id: 'brush-reveal', label: 'Brush', icon: Brush, category: 'Stylized' },
        { id: 'ink-splash', label: 'Ink Splash', icon: Droplet, category: 'Stylized' },

        // Advanced
        { id: 'film-roll', label: 'Film Roll', icon: Film, category: 'Advanced' },
        { id: 'smooth-wipe', label: 'Smooth Wipe', icon: Eraser, category: 'Cinematic' },
        { id: 'spin', label: 'Spin', icon: RotateCw, category: 'Trendy' },
    ];

    const handleTypeSelect = (type: TransitionType) => {
        if (type === 'none') {
            onUpdate({ type: 'none', duration: 0 });
        } else {
            onUpdate({
                type,
                duration: currentDuration,
                direction: currentDirection,
                origin: currentOrigin,
                speed: currentSpeed
            });
        }
    };

    const handleApplyAll = () => {
        if (transition) {
            onApplyToAll(transition);
            setJustApplied(true);
            setTimeout(() => setJustApplied(false), 2000);
        }
    };

    const displayedTransitions = activeSection === 'normal' ? normalTransitions : advancedTransitions;

    return (
        <div className="absolute left-[72px] top-0 bottom-0 w-80 bg-white border-r border-gray-200 z-50 flex flex-col shadow-xl animate-in slide-in-from-left duration-200">
            {/* Header */}
            <div className="h-16 flex items-center justify-between px-5 border-b border-gray-100 shrink-0 bg-white">
                <span className="font-bold text-gray-800 text-lg tracking-tight">Transitions</span>
                <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
                    <X size={18} />
                </button>
            </div>

            <div className="flex flex-col flex-1 overflow-hidden bg-white">
                {/* Horizontal Tabs */}
                <div className="px-5 pt-5 pb-2 space-y-3">
                    <div className="flex p-1 bg-gray-100 rounded-xl">
                        <button
                            onClick={() => setActiveSection('normal')}
                            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${activeSection === 'normal' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Normal
                        </button>
                        <button
                            onClick={() => setActiveSection('advanced')}
                            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${activeSection === 'advanced' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Advanced
                        </button>
                    </div>

                    {/* Timing Selection (Moved to Top) */}
                    {currentType !== 'none' && (
                        <div className="grid grid-cols-3 gap-2">
                            <button
                                onClick={() => onUpdate({ ...transition!, timing: 'prefix' })}
                                className={`py-1.5 text-[10px] font-semibold uppercase tracking-wider rounded-md border transition-all ${(transition?.timing || 'postfix') === 'prefix' ? 'bg-violet-50 border-violet-500 text-violet-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}
                            >
                                Prefix
                            </button>
                            <button
                                onClick={() => onUpdate({ ...transition!, timing: 'overlap' })}
                                className={`py-1.5 text-[10px] font-semibold uppercase tracking-wider rounded-md border transition-all ${(transition?.timing || 'postfix') === 'overlap' ? 'bg-violet-50 border-violet-500 text-violet-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}
                            >
                                Overlap
                            </button>
                            <button
                                onClick={() => onUpdate({ ...transition!, timing: 'postfix' })}
                                className={`py-1.5 text-[10px] font-semibold uppercase tracking-wider rounded-md border transition-all ${(transition?.timing || 'postfix') === 'postfix' ? 'bg-violet-50 border-violet-500 text-violet-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}
                            >
                                Postfix
                            </button>
                        </div>
                    )}
                </div>

                {/* Transitions Grid */}
                <div className="flex-1 overflow-y-auto px-5 pb-5 custom-scrollbar">
                    <div className="grid grid-cols-4 gap-3 mb-8">
                        {displayedTransitions.map((t) => (
                            <div
                                key={t.id}
                                className="flex flex-col items-center gap-2 group cursor-pointer"
                                onClick={() => handleTypeSelect(t.id)}
                                onMouseEnter={() => onHover(t.id)}
                                onMouseLeave={() => onHover(null)}
                            >
                                <div
                                    className={`w-full aspect-video rounded-lg flex items-center justify-center border transition-all duration-200 relative overflow-hidden ${currentType === t.id
                                        ? 'border-violet-600 bg-violet-50 text-violet-600 ring-2 ring-violet-100 ring-offset-1'
                                        : 'border-gray-200 bg-gray-50 text-gray-500 group-hover:border-violet-300 group-hover:bg-white group-hover:shadow-sm'
                                        }`}
                                >
                                    <t.icon size={24} strokeWidth={1.5} />
                                </div>
                                <span className={`text-[10px] font-medium text-center leading-tight ${currentType === t.id ? 'text-violet-700' : 'text-gray-500'}`}>{t.label}</span>
                            </div>
                        ))}
                    </div>

                    {currentType !== 'none' && (
                        <div className="space-y-6 border-t border-gray-100 pt-6">

                            {/* Duration Slider */}
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Duration</label>
                                    <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-600 border border-gray-200">{currentDuration}s</span>
                                </div>
                                <div className="px-1">
                                    <input
                                        type="range"
                                        min="0.1"
                                        max="2.5"
                                        step="0.1"
                                        value={currentDuration}
                                        onChange={(e) => onUpdate({ ...transition!, duration: parseFloat(e.target.value) })}
                                        className="w-full accent-violet-600 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer focus:outline-none"
                                    />
                                </div>
                            </div>

                            {/* Speed Slider */}
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Speed</label>
                                    <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-600 border border-gray-200">{currentSpeed}x</span>
                                </div>
                                <div className="px-1">
                                    <input
                                        type="range"
                                        min="0.1"
                                        max="2.0"
                                        step="0.1"
                                        value={currentSpeed}
                                        onChange={(e) => onUpdate({ ...transition!, speed: parseFloat(e.target.value) })}
                                        className="w-full accent-violet-600 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer focus:outline-none"
                                    />
                                </div>
                            </div>

                            {/* Direction */}
                            {(['slide', 'push', 'whip', 'split', 'band-slide', 'wipe', 'band-wipe', 'barn-doors', 'venetian-blinds', 'line-wipe', 'match-move', 'flow', 'chop'].includes(currentType)) && (
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Direction</label>
                                    <div className="flex gap-2">
                                        {(['left', 'right', 'up', 'down'] as const).map(dir => (
                                            <button
                                                key={dir}
                                                onClick={() => onUpdate({ ...transition!, direction: dir })}
                                                className={`w-9 h-9 rounded-lg flex items-center justify-center border transition-all ${currentDirection === dir
                                                    ? 'bg-violet-100 border-violet-500 text-violet-700 shadow-inner'
                                                    : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600 hover:border-gray-300'
                                                    }`}
                                                title={`Direction: ${dir}`}
                                            >
                                                {dir === 'left' && <ArrowLeft size={16} />}
                                                {dir === 'right' && <ArrowRight size={16} />}
                                                {dir === 'up' && <ArrowUp size={16} />}
                                                {dir === 'down' && <ArrowDown size={16} />}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={handleApplyAll}
                                className={`w-full py-3 border rounded-lg text-sm font-semibold transition-all shadow-sm flex items-center justify-center gap-2 ${justApplied
                                    ? 'bg-green-50 border-green-300 text-green-700'
                                    : 'border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 active:scale-[0.98]'
                                    }`}
                            >
                                {justApplied ? (
                                    <>
                                        <CheckCircle2 size={16} /> Applied to all pages
                                    </>
                                ) : (
                                    "Apply between all pages"
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TransitionPanel;
