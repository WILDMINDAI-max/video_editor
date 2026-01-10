
import React, { useState, useRef, useEffect } from 'react';
import {
    SquarePen, CirclePlay, Eraser, Crop, FlipHorizontal, FlipVertical, Droplets,
    Square, Circle, MessageSquare, Lock, CopyPlus, Trash2, MoreHorizontal,
    Type, PaintBucket, Plus, Check, X, Minus, Bold, Italic, AlignLeft, AlignCenter, AlignRight, Wand2,
    Palette, Frame, XCircle, Volume2, VolumeX
} from 'lucide-react';
import { TimelineItem, BorderStyle } from '@/types';

interface RightSidebarProps {
    selectedItem: TimelineItem | null;
    onUpdate: (updates: Partial<TimelineItem>) => void;
    onEdit: () => void;
    onAnimate: () => void;
    onEraser: () => void;
    onCrop: () => void;
    onLock: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onCopy: () => void;
    onPaste: () => void;
    onSplit: () => void;
    onDetach: (trackId: string, itemId: string) => void;
    onFont: () => void;
    onTextEffects: () => void;
}

const PRESET_COLORS = [
    'transparent', '#ffffff', '#000000', '#ef4444', '#f97316', '#f59e0b',
    '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
    '#d946ef', '#f43f5e', '#71717a'
];

const RightSidebar: React.FC<RightSidebarProps> = ({
    selectedItem,
    onUpdate,
    onEdit,
    onAnimate,
    onEraser,
    onCrop,
    onLock,
    onDuplicate,
    onDelete,
    onCopy,
    onPaste,
    onSplit,
    onDetach,
    onFont,
    onTextEffects
}) => {
    const [activePopup, setActivePopup] = useState<'flip' | 'opacity' | 'border' | 'color' | 'more' | 'textColor' | null>(null);
    const [popupTop, setPopupTop] = useState<number>(0);
    const sidebarRef = useRef<HTMLDivElement>(null);

    // Close popups when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
                setActivePopup(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (!selectedItem) return null;

    const isVideo = selectedItem.type === 'video';
    const isImage = selectedItem.type === 'image';
    const isText = selectedItem.type === 'text';
    const isColor = selectedItem.type === 'color';

    const togglePopup = (name: 'flip' | 'opacity' | 'border' | 'color' | 'more' | 'textColor', e?: React.MouseEvent) => {
        if (activePopup === name) {
            setActivePopup(null);
        } else {
            if (e) {
                const rect = e.currentTarget.getBoundingClientRect();
                // Adjust for More menu to show upwards if at bottom
                if (name === 'more' && rect.bottom > window.innerHeight - 200) {
                    setPopupTop(rect.bottom - 200); // Approximate height of more menu
                } else {
                    setPopupTop(rect.top);
                }
            }
            setActivePopup(name);
        }
    };

    const updateBorder = (updates: Partial<BorderStyle>) => {
        const currentBorder = selectedItem.border || { color: '#000000', width: 4, style: 'solid' };
        onUpdate({ border: { ...currentBorder, ...updates } });
    };

    return (
        <div ref={sidebarRef} className="w-[72px] bg-[#0e1318] text-gray-400 flex flex-col h-full z-30 shrink-0 overflow-y-auto custom-scrollbar border-l border-gray-800 relative">
            <div className="flex flex-col py-2 gap-1">

                {/* Edit (Image/Video) */}
                {(isImage || isVideo) && (
                    <button onClick={onEdit} className="flex flex-col items-center justify-center py-3 w-full transition-all relative shrink-0 hover:text-gray-100 hover:bg-[#1f2021] group">
                        <div className="relative mb-1.5">
                            <SquarePen size={20} className="group-hover:text-violet-500 transition-colors" />
                            <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-violet-500 rounded-full border border-[#0e1318]"></div>
                        </div>
                        <span className="text-[10px] font-medium">Edit</span>
                    </button>
                )}

                {/* Mute Video Audio Toggle */}
                {isVideo && (
                    <button
                        onClick={() => onUpdate({ muteVideo: !selectedItem.muteVideo })}
                        className={`flex flex-col items-center justify-center py-3 w-full transition-all relative shrink-0 hover:text-gray-100 hover:bg-[#1f2021] ${selectedItem.muteVideo ? 'text-red-400' : ''}`}
                    >
                        {selectedItem.muteVideo ? (
                            <VolumeX size={20} className="mb-1.5" />
                        ) : (
                            <Volume2 size={20} className="mb-1.5" />
                        )}
                        <span className="text-[10px] font-medium">{selectedItem.muteVideo ? 'Unmute' : 'Mute'}</span>
                    </button>
                )}

                {/* Color (Background/Tint) - Moved Up */}
                {(isImage || isVideo || isColor) && (
                    <div className="relative w-full">
                        <button onClick={(e) => togglePopup('color', e)} className={`flex flex-col items-center justify-center py-3 w-full transition-all relative shrink-0 hover:text-gray-100 hover:bg-[#1f2021] ${activePopup === 'color' ? 'bg-[#1f2021] text-gray-100' : ''}`}>
                            <Palette size={20} className="mb-1.5" />
                            <span className="text-[10px] font-medium">Color</span>
                        </button>
                        {activePopup === 'color' && (
                            <div className="fixed right-[80px] bg-white p-3 rounded-lg shadow-xl border border-gray-200 w-64 z-[110] animate-in fade-in slide-in-from-right-2" style={{ top: popupTop }}>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-xs font-bold text-gray-500">Color</label>
                                    {selectedItem.backgroundColor && <button className="text-[10px] text-red-500 hover:bg-red-50 px-2 py-0.5 rounded" onClick={() => onUpdate({ backgroundColor: undefined })}><Trash2 size={12} /> Remove Tint</button>}
                                </div>
                                <div className="flex gap-2 mb-3 border-b border-gray-100 pb-3">
                                    <label className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-300 flex items-center justify-center cursor-pointer relative overflow-hidden">
                                        <Plus size={18} className="text-gray-500" />
                                        <input type="color" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => onUpdate(isColor ? { src: e.target.value } : { backgroundColor: e.target.value })} value={isColor ? selectedItem.src : (selectedItem.backgroundColor || '#ffffff')} />
                                    </label>
                                    <div className="flex-1 grid grid-cols-5 gap-2">
                                        {PRESET_COLORS.filter(c => c !== 'transparent').map(c => (
                                            <button key={c} className="w-full aspect-square rounded-full border shadow-sm" style={{ background: c }} onClick={() => onUpdate(isColor ? { src: c } : { backgroundColor: c })} />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Border - Moved Up */}
                {(isImage || isVideo || isColor) && (
                    <div className="relative w-full">
                        <button
                            onClick={(e) => !selectedItem.isBackground && togglePopup('border', e)}
                            disabled={selectedItem.isBackground}
                            className={`flex flex-col items-center justify-center py-3 w-full transition-all relative shrink-0 ${selectedItem.isBackground ? 'opacity-30 cursor-not-allowed' : 'hover:text-gray-100 hover:bg-[#1f2021]'} ${activePopup === 'border' ? 'bg-[#1f2021] text-gray-100' : ''}`}
                        >
                            <Frame size={20} className="mb-1.5" />
                            <span className="text-[10px] font-medium">Border</span>
                        </button>
                        {activePopup === 'border' && (
                            <div className="fixed right-[80px] bg-white p-3 rounded-lg shadow-xl border border-gray-200 w-56 z-[110] animate-in fade-in slide-in-from-right-2" style={{ top: popupTop }}>
                                <div className="flex items-center justify-between mb-3">
                                    <label className="text-xs font-bold text-gray-500">Border</label>
                                    {selectedItem.border && (<button onClick={() => onUpdate({ border: undefined })} className="text-[10px] text-red-500 hover:underline">Remove</button>)}
                                </div>
                                <div className="flex gap-2 mb-3">
                                    <div className="flex-1 flex bg-gray-100 rounded-lg p-0.5">
                                        {(['solid', 'dashed', 'dotted'] as const).map(style => (
                                            <button key={style} className={`flex-1 h-6 flex items-center justify-center rounded text-[10px] transition-all ${selectedItem.border?.style === style ? 'bg-white shadow-sm text-violet-600 font-bold' : 'text-gray-500 hover:text-gray-700'}`} onClick={() => updateBorder({ style })}>
                                                {style === 'solid' && <div className="w-3 h-px bg-current"></div>}
                                                {style === 'dashed' && <div className="w-3 h-px border-b border-dashed border-current"></div>}
                                                {style === 'dotted' && <div className="w-3 h-px border-b border-dotted border-current"></div>}
                                            </button>
                                        ))}
                                    </div>
                                    <input type="color" value={selectedItem.border?.color || '#000000'} onChange={(e) => updateBorder({ color: e.target.value })} className="w-7 h-7 rounded overflow-hidden border-0 p-0 cursor-pointer" />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[10px] text-gray-500"><span>Weight</span><span>{selectedItem.border?.width || 0}px</span></div>
                                    <input type="range" min="0" max="20" value={selectedItem.border?.width || 0} onChange={(e) => updateBorder({ width: Number(e.target.value) })} className="w-full accent-violet-600 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                                </div>
                            </div>
                        )}
                    </div>
                )}



                {/* Animate */}
                <button onClick={onAnimate} className="flex flex-col items-center justify-center py-3 w-full transition-all relative shrink-0 hover:text-gray-100 hover:bg-[#1f2021]">
                    <CirclePlay size={20} className="mb-1.5" />
                    <span className="text-[10px] font-medium">Animate</span>
                </button>



                {/* Crop (Image/Video) */}
                {(isImage || isVideo) && (
                    <button onClick={onCrop} className="flex flex-col items-center justify-center py-3 w-full transition-all relative shrink-0 hover:text-gray-100 hover:bg-[#1f2021]">
                        <Crop size={20} className="mb-1.5" />
                        <span className="text-[10px] font-medium">Crop</span>
                    </button>
                )}

                {/* --- Text Controls --- */}
                {isText && (
                    <>
                        {/* Font */}
                        <button onClick={onFont} className="flex flex-col items-center justify-center py-3 w-full transition-all relative shrink-0 hover:text-gray-100 hover:bg-[#1f2021]">
                            <Type size={20} className="mb-1.5" />
                            <span className="text-[10px] font-medium">Font</span>
                        </button>

                        {/* Font Size */}
                        <div className="flex flex-col items-center justify-center py-2 w-full shrink-0">
                            <div className="flex items-center gap-1 bg-[#1f2021] rounded-lg p-1">
                                <button className="p-1 hover:bg-gray-700 rounded text-gray-400" onClick={() => onUpdate({ fontSize: Math.max(8, (selectedItem.fontSize || 24) - 2) })}><Minus size={12} /></button>
                                <span className="text-[10px] font-medium w-4 text-center">{selectedItem.fontSize || 24}</span>
                                <button className="p-1 hover:bg-gray-700 rounded text-gray-400" onClick={() => onUpdate({ fontSize: Math.min(200, (selectedItem.fontSize || 24) + 2) })}><Plus size={12} /></button>
                            </div>
                            <span className="text-[9px] font-medium mt-1 text-gray-500">Size</span>
                        </div>

                        {/* Text Color */}
                        <div className="relative w-full">
                            <button onClick={(e) => togglePopup('textColor', e)} className={`flex flex-col items-center justify-center py-3 w-full transition-all relative shrink-0 hover:text-gray-100 hover:bg-[#1f2021] ${activePopup === 'textColor' ? 'bg-[#1f2021] text-gray-100' : ''}`}>
                                <div className="w-5 h-5 rounded border border-gray-500 flex items-center justify-center font-bold text-xs mb-1.5" style={{ background: selectedItem.color, color: selectedItem.color === '#ffffff' ? '#000' : '#fff' }}>A</div>
                                <span className="text-[10px] font-medium">Color</span>
                            </button>
                            {activePopup === 'textColor' && (
                                <div className="fixed right-[80px] bg-white p-3 rounded-lg shadow-xl border border-gray-200 w-64 z-[110] animate-in fade-in slide-in-from-right-2" style={{ top: popupTop }}>
                                    <div className="flex gap-2 mb-3 border-b border-gray-100 pb-3">
                                        <label className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-300 flex items-center justify-center cursor-pointer relative overflow-hidden">
                                            <Plus size={18} className="text-gray-500" />
                                            <input type="color" className="absolute inset-0 opacity-0 cursor-pointer" value={selectedItem.color} onChange={(e) => onUpdate({ color: e.target.value })} />
                                        </label>
                                        <div className="flex-1 grid grid-cols-5 gap-2">
                                            {PRESET_COLORS.filter(c => c !== 'transparent').map(c => (
                                                <button key={c} className="w-full aspect-square rounded-full border shadow-sm" style={{ background: c }} onClick={() => onUpdate({ color: c })} />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Formatting (Bold/Italic) */}
                        <div className="flex flex-col items-center justify-center py-2 w-full shrink-0 gap-1">
                            <div className="flex gap-1">
                                <button className={`p-1.5 rounded hover:bg-[#1f2021] ${selectedItem.fontWeight === 'bold' ? 'bg-[#1f2021] text-white' : 'text-gray-500'}`} onClick={() => onUpdate({ fontWeight: selectedItem.fontWeight === 'bold' ? 'normal' : 'bold' })}><Bold size={16} /></button>
                                <button className={`p-1.5 rounded hover:bg-[#1f2021] ${selectedItem.fontStyle === 'italic' ? 'bg-[#1f2021] text-white' : 'text-gray-500'}`} onClick={() => onUpdate({ fontStyle: selectedItem.fontStyle === 'italic' ? 'normal' : 'italic' })}><Italic size={16} /></button>
                            </div>
                            <span className="text-[9px] font-medium text-gray-500">Style</span>
                        </div>

                        {/* Alignment */}
                        <button className="flex flex-col items-center justify-center py-3 w-full transition-all relative shrink-0 hover:text-gray-100 hover:bg-[#1f2021]" onClick={() => {
                            const nextAlign = selectedItem.textAlign === 'left' ? 'center' : selectedItem.textAlign === 'center' ? 'right' : 'left';
                            onUpdate({ textAlign: nextAlign });
                        }}>
                            {selectedItem.textAlign === 'left' && <AlignLeft size={20} className="mb-1.5" />}
                            {selectedItem.textAlign === 'center' && <AlignCenter size={20} className="mb-1.5" />}
                            {selectedItem.textAlign === 'right' && <AlignRight size={20} className="mb-1.5" />}
                            <span className="text-[10px] font-medium">Align</span>
                        </button>

                        {/* Effects */}
                        <button onClick={onTextEffects} className="flex flex-col items-center justify-center py-3 w-full transition-all relative shrink-0 hover:text-gray-100 hover:bg-[#1f2021]">
                            <Wand2 size={20} className="mb-1.5" />
                            <span className="text-[10px] font-medium">Effects</span>
                        </button>
                    </>
                )}



                {/* Lock */}
                <button onClick={onLock} className="flex flex-col items-center justify-center py-3 w-full transition-all relative shrink-0 hover:text-gray-100 hover:bg-[#1f2021]">
                    <Lock size={20} className={`mb-1.5 ${selectedItem.isLocked ? 'text-violet-500' : ''}`} />
                    <span className="text-[10px] font-medium">Lock</span>
                </button>

                {/* Duplicate */}
                <button onClick={onDuplicate} className="flex flex-col items-center justify-center py-3 w-full transition-all relative shrink-0 hover:text-gray-100 hover:bg-[#1f2021]">
                    <CopyPlus size={20} className="mb-1.5" />
                    <span className="text-[10px] font-medium">Duplicate</span>
                </button>

                {/* Delete */}
                <button onClick={onDelete} className="flex flex-col items-center justify-center py-3 w-full transition-all relative shrink-0 hover:text-red-500 hover:bg-red-500/10 text-red-400">
                    <Trash2 size={20} className="mb-1.5" />
                    <span className="text-[10px] font-medium">Delete</span>
                </button>

                {/* More */}
                <div className="relative w-full">
                    <button onClick={(e) => togglePopup('more', e)} className={`flex flex-col items-center justify-center py-3 w-full transition-all relative shrink-0 hover:text-gray-100 hover:bg-[#1f2021] ${activePopup === 'more' ? 'bg-[#1f2021] text-gray-100' : ''}`}>
                        <MoreHorizontal size={20} className="mb-1.5" />
                        <span className="text-[10px] font-medium">More</span>
                    </button>
                    {activePopup === 'more' && (
                        <div className="fixed right-[80px] bg-white rounded-lg shadow-xl border border-gray-200 w-56 py-1 z-[110] animate-in fade-in slide-in-from-right-2 text-gray-700" style={{ top: popupTop }}>
                            <button onClick={() => { onCopy(); setActivePopup(null); }} className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-3">
                                <CopyPlus size={16} /> Copy
                            </button>
                            <button onClick={() => { onPaste(); setActivePopup(null); }} className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-3">
                                <CopyPlus size={16} className="rotate-180" /> Paste
                            </button>
                            <div className="h-px bg-gray-100 my-1"></div>
                            <button onClick={() => { onSplit(); setActivePopup(null); }} className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-3">
                                <span className="rotate-90"><MoreHorizontal size={16} /></span> Split
                            </button>
                            <div className="h-px bg-gray-100 my-1"></div>
                            <button onClick={() => { onDetach(selectedItem.trackId, selectedItem.id); setActivePopup(null); }} className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-3">
                                {selectedItem.isBackground ? <Eraser size={16} /> : <Square size={16} />}
                                {selectedItem.isBackground ? 'Detach from background' : 'Set as background'}
                            </button>
                        </div>
                    )}
                </div>

            </div>
            <div className="flex-1 min-h-[20px]"></div>
        </div>
    );
};

export default RightSidebar;
