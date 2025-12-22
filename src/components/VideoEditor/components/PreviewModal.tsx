
import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Pause, SkipBack, SkipForward, Maximize2, Minimize2, ZoomIn, ZoomOut, Monitor, Maximize, Check } from 'lucide-react';
import Canvas from './Canvas';
import { CanvasDimension, Track, TimelineItem, RESIZE_OPTIONS } from '@/types';

interface PreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    tracks: Track[];
    dimension: CanvasDimension;
    totalDuration: number;
    onDimensionChange: (dim: CanvasDimension) => void;
}

const PreviewModal: React.FC<PreviewModalProps> = ({
    isOpen,
    onClose,
    tracks,
    dimension,
    totalDuration,
    onDimensionChange
}) => {
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(true); // Auto-play on open
    const [isFullscreen, setIsFullscreen] = useState(false);
    const modalRef = useRef<HTMLDivElement>(null);

    // Reset time when opening
    useEffect(() => {
        if (isOpen) {
            setCurrentTime(0);
            setIsPlaying(true);
        } else {
            setIsPlaying(false);
        }
    }, [isOpen]);

    // Playback Loop
    useEffect(() => {
        let animationFrame: number;
        let lastTime = Date.now();

        const loop = () => {
            if (isPlaying) {
                const now = Date.now();
                const delta = (now - lastTime) / 1000;
                lastTime = now;

                setCurrentTime(prev => {
                    if (prev >= totalDuration) {
                        setIsPlaying(false);
                        return 0; // Loop or stop? Let's stop at end
                    }
                    return prev + delta;
                });

                animationFrame = requestAnimationFrame(loop);
            }
        };

        if (isPlaying) {
            lastTime = Date.now();
            animationFrame = requestAnimationFrame(loop);
        }

        return () => cancelAnimationFrame(animationFrame);
    }, [isPlaying, totalDuration]);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            modalRef.current?.requestFullscreen();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    // Listen for fullscreen change
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const formatTime = (time: number) => {
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        const ms = Math.floor((time % 1) * 100);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${ms.toString().padStart(2, '0')}`;
    };

    const [previewScale, setPreviewScale] = useState(0);
    const [zoomLevel, setZoomLevel] = useState(100);
    const [isFit, setIsFit] = useState(true);
    const [showAspectRatioMenu, setShowAspectRatioMenu] = useState(false);

    // Calculate optimal scale to fit screen
    useEffect(() => {
        const calculateScale = () => {
            if (!modalRef.current) return;

            // Available space (window - header/footer)
            // Header: 56px, Footer: 96px
            const verticalChrome = 56 + 96;
            const horizontalChrome = 0;

            const availableWidth = window.innerWidth - horizontalChrome;
            const availableHeight = window.innerHeight - verticalChrome;

            const scaleW = availableWidth / dimension.width;
            const scaleH = availableHeight / dimension.height;

            // Use the smaller scale to fit entirely
            const fitScale = Math.min(scaleW, scaleH);

            if (isFit) {
                setPreviewScale(fitScale * 100);
                setZoomLevel(Math.round(fitScale * 100));
            } else {
                setPreviewScale(zoomLevel);
            }
        };

        calculateScale();
        window.addEventListener('resize', calculateScale);
        return () => window.removeEventListener('resize', calculateScale);
    }, [dimension, isFullscreen, isFit, zoomLevel]);

    const handleZoomChange = (newZoom: number) => {
        setIsFit(false);
        setZoomLevel(Math.max(10, Math.min(200, newZoom)));
    };

    const handleFit = () => {
        setIsFit(true);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[30000] bg-black/90 flex flex-col animate-in fade-in duration-200" ref={modalRef}>
            {/* Header */}
            <div className="h-14 flex items-center justify-between px-6 bg-black/50 backdrop-blur-sm border-b border-white/10 z-50 shrink-0">
                <h2 className="text-white font-medium text-lg">Preview</h2>
                <div className="flex items-center gap-4">
                    <button onClick={toggleFullscreen} className="text-gray-400 hover:text-white transition-colors">
                        {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                    </button>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 relative overflow-hidden flex items-center justify-center">
                {/* We reuse Canvas but disable interactions */}
                <Canvas
                    dimension={dimension}
                    tracks={tracks}
                    currentTime={currentTime}
                    isPlaying={isPlaying}
                    interactionMode="none"
                    setInteractionMode={() => { }}
                    eraserSettings={{ size: 20, type: 'erase', showOriginal: false }}
                    onSelectClip={() => { }}
                    onUpdateClip={() => { }}
                    onDeleteClip={() => { }}
                    onSplitClip={() => { }}
                    onOpenEditPanel={() => { }}
                    onOpenColorPanel={() => { }}
                    onCopy={() => { }}
                    onPaste={() => { }}
                    onDuplicate={() => { }}
                    onLock={() => { }}
                    onDetach={() => { }}
                    onAlign={() => { }}
                    selectedItemId={null}
                    scalePercent={previewScale} // Use calculated scale
                    setScalePercent={() => { }}
                    className="bg-transparent p-0"
                />
            </div>

            {/* Controls */}
            <div className="h-24 bg-black/80 backdrop-blur-md border-t border-white/10 px-8 flex flex-col justify-center gap-2 z-50">
                {/* Progress Bar */}
                <div
                    className="w-full h-1.5 bg-white/20 rounded-full cursor-pointer relative group"
                    onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const p = (e.clientX - rect.left) / rect.width;
                        setCurrentTime(p * totalDuration);
                    }}
                >
                    <div
                        className="absolute top-0 left-0 h-full bg-violet-500 rounded-full"
                        style={{ width: `${(currentTime / totalDuration) * 100}%` }}
                    >
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg scale-0 group-hover:scale-100 transition-transform"></div>
                    </div>
                </div>

                <div className="flex items-center justify-between mt-2">
                    <div className="text-xs font-mono text-gray-400">
                        {formatTime(currentTime)} <span className="text-gray-600">/</span> {formatTime(totalDuration)}
                    </div>

                    <div className="flex items-center gap-6">
                        <button
                            onClick={() => setCurrentTime(0)}
                            className="text-gray-400 hover:text-white transition-colors"
                        >
                            <SkipBack size={20} />
                        </button>

                        <button
                            onClick={() => setIsPlaying(!isPlaying)}
                            className="w-12 h-12 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 transition-transform"
                        >
                            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
                        </button>

                        <button
                            onClick={() => setCurrentTime(totalDuration)}
                            className="text-gray-400 hover:text-white transition-colors"
                        >
                            <SkipForward size={20} />
                        </button>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Aspect Ratio Selector */}
                        <div className="relative">
                            <button
                                onClick={() => setShowAspectRatioMenu(!showAspectRatioMenu)}
                                className="flex items-center gap-2 text-xs font-medium text-gray-400 hover:text-white transition-colors bg-white/5 px-3 py-1.5 rounded-lg border border-white/10"
                            >
                                <Monitor size={14} />
                                {dimension.name}
                            </button>

                            {showAspectRatioMenu && (
                                <div className="absolute bottom-full right-0 mb-2 w-48 bg-[#18181b] border border-gray-800 rounded-lg shadow-xl overflow-hidden py-1 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                                    {RESIZE_OPTIONS.map((opt) => (
                                        <button
                                            key={opt.name}
                                            onClick={() => {
                                                onDimensionChange(opt);
                                                setShowAspectRatioMenu(false);
                                            }}
                                            className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/10 hover:text-white flex items-center justify-between"
                                        >
                                            <span>{opt.name}</span>
                                            {dimension.name === opt.name && <Check size={12} className="text-violet-500" />}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="h-4 w-px bg-white/10"></div>

                        {/* Zoom Controls */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => handleZoomChange(zoomLevel - 10)}
                                className="text-gray-400 hover:text-white transition-colors p-1"
                                title="Zoom Out"
                            >
                                <ZoomOut size={16} />
                            </button>

                            <div className="flex items-center gap-2 min-w-[100px]">
                                <input
                                    type="range"
                                    min="10"
                                    max="200"
                                    value={zoomLevel}
                                    onChange={(e) => handleZoomChange(Number(e.target.value))}
                                    className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-violet-500"
                                />
                                <span className="text-xs font-mono text-gray-400 w-8 text-right">{Math.round(zoomLevel)}%</span>
                            </div>

                            <button
                                onClick={() => handleZoomChange(zoomLevel + 10)}
                                className="text-gray-400 hover:text-white transition-colors p-1"
                                title="Zoom In"
                            >
                                <ZoomIn size={16} />
                            </button>
                        </div>

                        <button
                            onClick={handleFit}
                            className={`p-1.5 rounded-md transition-colors ${isFit ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
                            title="Fit to Screen"
                        >
                            <Maximize size={16} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PreviewModal;
