
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Tab, MOCK_UPLOADS, MOCK_PROJECTS, MOCK_IMAGES, MOCK_VIDEOS, MOCK_AUDIO, FONT_COMBINATIONS, TimelineItem, getTextEffectStyle, MOCK_TEXT_STYLES } from '../../../types';
import { Search, X, MousePointer, PenTool, Square, Circle, Minus, Type, Hand, Triangle, Hexagon, UploadCloud, Music, Play, Pause, AlignLeft, AlignCenter, AlignRight, AlignStartVertical, AlignVerticalJustifyCenter, AlignEndVertical, Plus, Loader2 } from 'lucide-react';
import { getMediaLibrary, MediaItem } from '../../../lib/api';
import { buildProxyResourceUrl } from '../../../lib/proxyUtils';

interface ResourcePanelProps {
    activeTab: Tab;
    isOpen: boolean;
    onClose: () => void;
    onAddClip: (src: string, type: 'video' | 'image' | 'color' | 'text' | 'audio', overrides?: Partial<TimelineItem>) => void;
    selectedItem: TimelineItem | null;
    onAlign: (align: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
    uploads: Array<{ id: string, type: 'image' | 'video' | 'audio', src: string, name: string, thumbnail?: string, duration?: string }>;
    onUpload: () => void;
    onRemoveUpload: (id: string) => void;
}

const ResourcePanel: React.FC<ResourcePanelProps> = ({ activeTab, isOpen, onClose, onAddClip, selectedItem, onAlign, uploads, onUpload, onRemoveUpload }) => {
    const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
    const audioPlayer = useRef<HTMLAudioElement | null>(null);

    // Library State
    const [mediaLibrary, setMediaLibrary] = useState<{
        images: MediaItem[];
        videos: MediaItem[];
        music: MediaItem[];
        uploaded: MediaItem[];
    }>({
        images: [],
        videos: [],
        music: [],
        uploaded: [],
    });
    const [libraryLoading, setLibraryLoading] = useState(false);
    const libraryLoadingRef = useRef(false);
    const [libraryPage, setLibraryPage] = useState(1);
    const [libraryHasMore, setLibraryHasMore] = useState(true);
    const [activeLibraryCategory, setActiveLibraryCategory] = useState<'images' | 'videos' | 'music' | 'uploaded'>('images');
    const libraryScrollRef = useRef<HTMLDivElement>(null);

    const handlePlayPreview = (src: string, id: string) => {
        if (playingAudioId === id) {
            audioPlayer.current?.pause();
            setPlayingAudioId(null);
        } else {
            if (audioPlayer.current) {
                audioPlayer.current.pause();
            }
            audioPlayer.current = new Audio(src);
            audioPlayer.current.onended = () => setPlayingAudioId(null);
            audioPlayer.current.play();
            setPlayingAudioId(id);
        }
    };

    const parseDurationString = (durationStr?: string): number => {
        if (!durationStr) return 0;
        const parts = durationStr.split(':').map(Number);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return parseFloat(durationStr) || 0;
    };

    const handleDragStart = (e: React.DragEvent, type: string, src: string, overrides: any = {}) => {
        e.dataTransfer.setData('application/json', JSON.stringify({
            type,
            src,
            ...overrides
        }));
    };

    const fetchMediaLibrary = useCallback(async (pageNum: number, isRefresh = false) => {
        if (libraryLoadingRef.current && !isRefresh) return;

        setLibraryLoading(true);
        libraryLoadingRef.current = true;
        try {
            const limit = 20;
            const response = await getMediaLibrary(pageNum, limit);

            if (response.responseStatus === 'success' && response.data) {
                setMediaLibrary(prev => {
                    // Helper to deduplicate arrays by id
                    const dedupe = (existing: MediaItem[], incoming: MediaItem[]) => {
                        const existingIds = new Set(existing.map(item => item.id));
                        const uniqueNew = incoming.filter(item => !existingIds.has(item.id));
                        return [...existing, ...uniqueNew];
                    };

                    if (pageNum === 1) {
                        return {
                            images: response.data?.images || [],
                            videos: response.data?.videos || [],
                            music: response.data?.music || [],
                            uploaded: response.data?.uploaded || [],
                        };
                    } else {
                        return {
                            images: dedupe(prev.images, response.data?.images || []),
                            videos: dedupe(prev.videos, response.data?.videos || []),
                            music: dedupe(prev.music, response.data?.music || []),
                            uploaded: dedupe(prev.uploaded, response.data?.uploaded || []),
                        };
                    }
                });

                if (response.data.pagination) {
                    const p = response.data.pagination;
                    setLibraryHasMore(p.hasMoreImages || p.hasMoreVideos || p.hasMoreUploaded);
                } else {
                    setLibraryHasMore(true);
                }
            }
        } catch (error) {
            console.error('Error fetching media library:', error);
        } finally {
            setLibraryLoading(false);
            libraryLoadingRef.current = false;
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'library') {
            setLibraryPage(1);
            setLibraryHasMore(true);
            fetchMediaLibrary(1, true);
        }
    }, [activeTab, fetchMediaLibrary]);

    const handleLibraryScroll = () => {
        if (libraryScrollRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = libraryScrollRef.current;
            if (scrollTop + clientHeight >= scrollHeight - 50 && !libraryLoading && libraryHasMore) {
                const nextPage = libraryPage + 1;
                setLibraryPage(nextPage);
                fetchMediaLibrary(nextPage);
            }
        }
    };

    const getMediaUrl = (media: MediaItem) => {
        let url = media.url || media.thumbnail || '';
        if (url && (url.includes('zata.ai') || url.includes('zata'))) {
            url = buildProxyResourceUrl(url);
        }
        return url;
    };

    const renderLibrary = () => {
        const items = mediaLibrary[activeLibraryCategory];

        return (
            <div className="h-full flex flex-col pb-20">
                {/* Category Tabs */}
                <div className="flex border-b border-gray-200 px-4 shrink-0">
                    {[
                        { id: 'images', label: 'Images' },
                        { id: 'videos', label: 'Videos' },
                        { id: 'music', label: 'Music' },
                        { id: 'uploaded', label: 'Uploads' },
                    ].map((category) => (
                        <button
                            key={category.id}
                            onClick={() => setActiveLibraryCategory(category.id as any)}
                            className={`flex-1 py-3 text-xs font-medium border-b-2 transition-colors ${activeLibraryCategory === category.id
                                ? 'border-violet-600 text-violet-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            {category.label}
                        </button>
                    ))}
                </div>

                {/* Media Grid */}
                <div
                    ref={libraryScrollRef}
                    onScroll={handleLibraryScroll}
                    className="flex-1 overflow-y-auto p-4 custom-scrollbar"
                >
                    <div className="grid grid-cols-2 gap-3">
                        {items.map((item, index) => {
                            const mediaUrl = getMediaUrl(item);
                            const isVideo = item.type === 'video' || mediaUrl.match(/\.(mp4|webm|mov)$/i);
                            const isMusic = item.type === 'music' || mediaUrl.match(/\.(mp3|wav|ogg)$/i);

                            return (
                                <div
                                    key={`${item.id}-${index}`}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, item.type === 'music' ? 'audio' : item.type, mediaUrl, { name: item.prompt ? (item.prompt.length > 30 ? item.prompt.substring(0, 30) + '...' : item.prompt) : 'Media' })}
                                    onClick={() => onAddClip(mediaUrl, item.type === 'music' ? 'audio' : (item.type as any) || (isVideo ? 'video' : 'image'), { name: item.prompt ? (item.prompt.length > 30 ? item.prompt.substring(0, 30) + '...' : item.prompt) : 'Media' })}
                                    className="aspect-square bg-gray-100 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-violet-500 transition-all relative group"
                                >
                                    {isVideo ? (
                                        <video
                                            src={mediaUrl}
                                            className="w-full h-full object-cover"
                                            muted
                                            onMouseEnter={(e) => e.currentTarget.play().catch(() => { })}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.pause();
                                                e.currentTarget.currentTime = 0;
                                            }}
                                        />
                                    ) : isMusic ? (
                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-500 to-fuchsia-500">
                                            <Music className="text-white" size={24} />
                                        </div>
                                    ) : (
                                        <img
                                            src={mediaUrl}
                                            alt={item.prompt || 'Media'}
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                            }}
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {libraryLoading && (
                        <div className="flex justify-center p-4">
                            <Loader2 className="animate-spin text-violet-600" size={24} />
                        </div>
                    )}
                    {!libraryLoading && items.length === 0 && (
                        <div className="text-center py-8 text-gray-500 text-sm">
                            No items found
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderTools = () => (
        <div className="p-4 space-y-6 pb-24 w-full h-full flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-violet-50 rounded-full flex items-center justify-center mb-4">
                <MousePointer size={32} className="text-violet-500" />
            </div>
            <h3 className="text-lg font-bold text-gray-800">Tools</h3>
            <p className="text-sm text-gray-500 max-w-[200px]">
                Advanced editing tools are coming soon! Stay tuned for updates.
            </p>
        </div>
    );

    const renderText = () => (
        <div className="p-4 space-y-6 pb-24">
            {/* Standard Text Options */}
            <div className="flex gap-2 w-1/2">
                <button
                    draggable
                    onDragStart={(e) => handleDragStart(e, 'text', '', { name: 'Add a heading', fontSize: 60, fontWeight: 'bold' })}
                    onClick={() => onAddClip('', 'text', { name: 'Add a heading', duration: 5, width: 80, height: 20, fontSize: 60, fontWeight: 'bold', color: '#000000' })}
                    className="flex-1 aspect-square bg-white border border-gray-200 hover:border-violet-500 hover:bg-violet-50 rounded-lg flex items-center justify-center transition-all group"
                >
                    <span className="text-sm font-bold text-gray-700 group-hover:text-violet-600">H1</span>
                </button>
                <button
                    draggable
                    onDragStart={(e) => handleDragStart(e, 'text', '', { name: 'Add a subheading', fontSize: 40, fontWeight: 'bold' })}
                    onClick={() => onAddClip('', 'text', { name: 'Add a subheading', duration: 5, width: 60, height: 15, fontSize: 40, fontWeight: 'bold', color: '#333333' })}
                    className="flex-1 aspect-square bg-white border border-gray-200 hover:border-violet-500 hover:bg-violet-50 rounded-lg flex items-center justify-center transition-all group"
                >
                    <span className="text-xs font-semibold text-gray-700 group-hover:text-violet-600">H2</span>
                </button>
                <button
                    draggable
                    onDragStart={(e) => handleDragStart(e, 'text', '', { name: 'Add a little bit of body text', fontSize: 24, fontWeight: 'normal' })}
                    onClick={() => onAddClip('', 'text', { name: 'Add a little bit of body text', duration: 5, width: 50, height: 10, fontSize: 24, fontWeight: 'normal', color: '#4b5563' })}
                    className="flex-1 aspect-square bg-white border border-gray-200 hover:border-violet-500 hover:bg-violet-50 rounded-lg flex items-center justify-center transition-all group"
                >
                    <span className="text-[10px] font-normal text-gray-700 group-hover:text-violet-600">Aa</span>
                </button>
            </div>

            {/* Alignment Options */}
            <div className="space-y-2">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Alignment</h3>
                <div className="flex gap-2">
                    <button onClick={() => onAlign('left')} className="flex-1 aspect-square bg-white border border-gray-200 hover:border-violet-500 hover:bg-violet-50 rounded-lg flex items-center justify-center transition-all text-gray-600 hover:text-violet-600"><AlignLeft size={18} /></button>
                    <button onClick={() => onAlign('center')} className="flex-1 aspect-square bg-white border border-gray-200 hover:border-violet-500 hover:bg-violet-50 rounded-lg flex items-center justify-center transition-all text-gray-600 hover:text-violet-600"><AlignCenter size={18} /></button>
                    <button onClick={() => onAlign('right')} className="flex-1 aspect-square bg-white border border-gray-200 hover:border-violet-500 hover:bg-violet-50 rounded-lg flex items-center justify-center transition-all text-gray-600 hover:text-violet-600"><AlignRight size={18} /></button>
                    <button onClick={() => onAlign('top')} className="flex-1 aspect-square bg-white border border-gray-200 hover:border-violet-500 hover:bg-violet-50 rounded-lg flex items-center justify-center transition-all text-gray-600 hover:text-violet-600"><AlignStartVertical size={18} /></button>
                    <button onClick={() => onAlign('middle')} className="flex-1 aspect-square bg-white border border-gray-200 hover:border-violet-500 hover:bg-violet-50 rounded-lg flex items-center justify-center transition-all text-gray-600 hover:text-violet-600"><AlignVerticalJustifyCenter size={18} /></button>
                    <button onClick={() => onAlign('bottom')} className="flex-1 aspect-square bg-white border border-gray-200 hover:border-violet-500 hover:bg-violet-50 rounded-lg flex items-center justify-center transition-all text-gray-600 hover:text-violet-600"><AlignEndVertical size={18} /></button>
                </div>
            </div>

            {/* Font Combinations */}
            <div className="space-y-3">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Font Combinations</h3>
                <div className="grid grid-cols-2 gap-3">
                    {FONT_COMBINATIONS.map(combo => (
                        <div
                            key={combo.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, 'text', '', { ...combo.style, name: combo.label })}
                            onClick={() => onAddClip('', 'text', { ...combo.style, name: combo.label, duration: 5, width: 60, height: 30 })}
                            className="aspect-square bg-gray-50 hover:bg-gray-100 rounded-xl cursor-pointer border border-transparent hover:border-violet-200 transition-all flex items-center justify-center p-4 text-center group relative overflow-hidden"
                        >
                            <div
                                style={{
                                    fontFamily: combo.style.fontFamily,
                                    color: combo.style.color,
                                    fontWeight: combo.style.fontWeight as any,
                                    fontStyle: combo.style.fontStyle as any,
                                    ...(combo.style.textEffect ? getTextEffectStyle(combo.style.textEffect, combo.style.color, 0.4) : {})
                                }}
                                className="text-lg leading-tight pointer-events-none select-none"
                            >
                                {combo.label}
                            </div>
                            <div className="absolute bottom-2 left-0 right-0 text-[10px] text-gray-400 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                                {combo.name}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    const renderUploads = () => (
        <div className="p-4 h-full flex flex-col pb-24">
            <button
                onClick={onUpload}
                className="w-full py-3 bg-violet-600 text-white rounded-lg font-bold text-sm mb-6 hover:bg-violet-700 shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 shrink-0"
            >
                <UploadCloud size={18} /> Upload files
            </button>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Recent Uploads</h4>
                {uploads.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3">
                        {uploads.map((item) => (
                            <div
                                key={item.id}
                                draggable={true}
                                onDragStart={(e) => {
                                    e.dataTransfer.setData('application/json', JSON.stringify({
                                        type: item.type,
                                        src: item.src,
                                        name: item.name,
                                        thumbnail: item.thumbnail,
                                        duration: parseDurationString(item.duration)
                                    }));
                                }}
                                className="aspect-square rounded-lg overflow-hidden cursor-grab active:cursor-grabbing relative group bg-gray-100 border border-gray-100"
                                onClick={() => onAddClip(item.src, item.type as any, { thumbnail: item.thumbnail })}
                            >
                                {item.type === 'image' && (
                                    <img src={item.src} alt={item.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                )}
                                {item.type === 'video' && (
                                    <>
                                        <video src={item.src} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition-colors">
                                            <Play size={20} className="text-white fill-current" />
                                        </div>
                                        {item.duration && (
                                            <div className="absolute top-1 right-1 bg-black/70 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-md backdrop-blur-sm">
                                                {item.duration}
                                            </div>
                                        )}
                                    </>
                                )}
                                {item.type === 'audio' && (
                                    <div className="w-full h-full flex flex-col items-center justify-center bg-violet-50 text-violet-500 p-2 text-center">
                                        <Music size={24} className="mb-2" />
                                        <span className="text-xs font-medium truncate w-full">{item.name}</span>
                                        {item.duration && <span className="text-[10px] text-gray-400 mt-1">{item.duration}</span>}
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none"></div>

                                {/* Remove Button */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRemoveUpload(item.id);
                                    }}
                                    className="absolute top-1 right-1 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-md"
                                    title="Remove upload"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-10 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
                        <p>No uploads yet</p>
                    </div>
                )}
            </div>
        </div>
    );

    const renderAudio = () => {
        const userAudio = uploads.filter(u => u.type === 'audio');

        return (
            <div className="p-4 pb-24">
                <div className="mb-4 flex items-center bg-gray-100 rounded-lg px-3 border border-transparent focus-within:border-violet-500 focus-within:bg-white transition-all">
                    <Search size={16} className="text-gray-500" />
                    <input type="text" placeholder="Search audio" className="w-full bg-transparent p-2.5 text-sm outline-none" />
                </div>

                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-gray-800 text-sm">Your Audio</h3>
                    <button
                        onClick={onUpload}
                        className="text-[10px] font-bold bg-violet-100 text-violet-700 px-2 py-1 rounded hover:bg-violet-200 transition-colors flex items-center gap-1"
                    >
                        <Plus size={10} /> Import
                    </button>
                </div>

                {userAudio.length > 0 ? (
                    <div className="space-y-2 mb-6">
                        {userAudio.map((audio) => (
                            <div
                                key={audio.id}
                                draggable={true}
                                onDragStart={(e) => {
                                    e.dataTransfer.setData('application/json', JSON.stringify({
                                        type: 'audio',
                                        src: audio.src,
                                        name: audio.name,
                                        duration: parseDurationString(audio.duration)
                                    }));
                                }}
                                className="flex items-center gap-3 p-3 bg-white hover:bg-gray-50 rounded-lg border border-gray-100 group relative cursor-grab active:cursor-grabbing"
                            >
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handlePlayPreview(audio.src, audio.id);
                                    }}
                                    className="w-8 h-8 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center hover:bg-violet-600 hover:text-white transition-colors shrink-0"
                                >
                                    {playingAudioId === audio.id ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                                </button>
                                <div
                                    className="flex-1 min-w-0"
                                    onClick={() => onAddClip(audio.src, 'audio', { name: audio.name, duration: parseDurationString(audio.duration) })}
                                >
                                    <p className="text-xs font-bold text-gray-700 truncate">{audio.name}</p>
                                    <p className="text-[10px] text-gray-400">Imported • {audio.duration || '0:00'}</p>
                                </div>
                                <button
                                    onClick={() => onAddClip(audio.src, 'audio', { name: audio.name })}
                                    className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-gray-200 rounded text-gray-500 transition-all"
                                    title="Add to timeline"
                                >
                                    <Plus size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-6 text-gray-400 text-xs border-2 border-dashed border-gray-200 rounded-lg bg-gray-50 mb-6">
                        <p>No audio imported</p>
                    </div>
                )}

                <h3 className="font-bold text-gray-800 mb-3 text-sm">Stock Audio</h3>
                <div className="space-y-2">
                    {MOCK_AUDIO.map((audio) => (
                        <div
                            key={audio.id}
                            draggable={true}
                            onDragStart={(e) => {
                                e.dataTransfer.setData('application/json', JSON.stringify({
                                    type: 'audio',
                                    src: audio.src,
                                    name: audio.name,
                                    duration: parseDurationString(audio.duration)
                                }));
                            }}
                            className="flex items-center gap-3 p-3 bg-white hover:bg-gray-50 rounded-lg border border-gray-100 group relative cursor-grab active:cursor-grabbing"
                        >
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handlePlayPreview(audio.src, audio.id);
                                }}
                                className="w-8 h-8 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center hover:bg-violet-600 hover:text-white transition-colors shrink-0"
                            >
                                {playingAudioId === audio.id ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                            </button>
                            <div
                                className="flex-1 min-w-0 cursor-pointer"
                                onClick={() => onAddClip(audio.src, 'audio', { name: audio.name, duration: parseDurationString(audio.duration) })}
                            >
                                <p className="text-xs font-bold text-gray-700 truncate">{audio.name}</p>
                                <p className="text-[10px] text-gray-400">{audio.category} • {audio.duration}</p>
                            </div>
                            <button
                                onClick={() => onAddClip(audio.src, 'audio', { name: audio.name, duration: parseDurationString(audio.duration) })}
                                className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-gray-200 rounded text-gray-500 transition-all"
                                title="Add to timeline"
                            >
                                <Plus size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'library': return renderLibrary();
            case 'tools': return renderTools();
            case 'text': return renderText();
            case 'uploads': return renderUploads();
            case 'audio': return renderAudio();
            case 'images':
                return (
                    <div className="p-4 pb-24">
                        <div className="mb-4 flex items-center bg-gray-100 rounded-lg px-3 border border-transparent focus-within:border-violet-500 focus-within:bg-white transition-all">
                            <Search size={16} className="text-gray-500" />
                            <input type="text" placeholder="Search photos" className="w-full bg-transparent p-2.5 text-sm outline-none" />
                        </div>
                        <h3 className="font-bold text-gray-800 mb-3 text-sm">Trending Photos</h3>
                        <div className="grid grid-cols-2 gap-2">
                            {MOCK_IMAGES.map((img) => (
                                <div key={img.id} draggable={true} onDragStart={(e) => {
                                    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'image', src: img.src, name: img.name }));
                                }} className="aspect-[4/3] rounded-lg overflow-hidden cursor-grab active:cursor-grabbing relative group" onClick={() => onAddClip(img.src, 'image')}>
                                    <img src={img.src} alt={img.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[10px] p-2 pt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {img.name}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            case 'videos':
                return (
                    <div className="p-4 pb-24">
                        <div className="mb-4 flex items-center bg-gray-100 rounded-lg px-3 border border-transparent focus-within:border-violet-500 focus-within:bg-white transition-all">
                            <Search size={16} className="text-gray-500" />
                            <input type="text" placeholder="Search videos" className="w-full bg-transparent p-2.5 text-sm outline-none" />
                        </div>
                        <h3 className="font-bold text-gray-800 mb-3 text-sm">Stock Videos</h3>
                        <div className="grid grid-cols-1 gap-3">
                            {MOCK_VIDEOS.map((vid) => (
                                <div key={vid.id} draggable={true} onDragStart={(e) => {
                                    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'video', src: vid.src, name: vid.name, thumbnail: vid.thumbnail, duration: parseDurationString(vid.duration) }));
                                }} className="aspect-video rounded-lg overflow-hidden cursor-grab active:cursor-grabbing relative group bg-black shadow-sm hover:shadow-md transition-all" onClick={() => onAddClip(vid.src, 'video')}>
                                    <img src={vid.thumbnail} alt={vid.name} className="w-full h-full object-cover opacity-90 group-hover:opacity-100" />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-10 h-10 bg-white/30 rounded-full flex items-center justify-center backdrop-blur-sm group-hover:bg-white/60 transition-colors scale-90 group-hover:scale-100">
                                            <div className="w-0 h-0 border-l-[10px] border-l-white border-y-[6px] border-y-transparent ml-1"></div>
                                        </div>
                                    </div>
                                    <div className="absolute bottom-2 left-2 text-white text-xs font-medium drop-shadow-md">
                                        {vid.name}
                                    </div>
                                    {vid.duration && (
                                        <div className="absolute top-1 right-1 bg-black/70 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-md backdrop-blur-sm">
                                            {vid.duration}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            case 'projects':
                return (
                    <div className="p-4 pb-24">
                        <div className="mb-4 flex items-center bg-gray-100 rounded-lg px-3">
                            <Search size={16} className="text-gray-500" />
                            <input type="text" placeholder="Search content" className="w-full bg-transparent p-2.5 text-sm outline-none" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            {MOCK_PROJECTS.map((p) => (
                                <div key={p.id} className="group cursor-pointer">
                                    <div className="aspect-video bg-gray-200 rounded-lg overflow-hidden mb-2 shadow-sm group-hover:shadow-md transition-all border border-gray-200">
                                        <img src={p.thumbnail} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                    </div>
                                    <p className="text-xs font-bold text-gray-700 truncate group-hover:text-violet-700">{p.name}</p>
                                    <p className="text-[10px] text-gray-400">{p.lastModified}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            default:
                return <div className="p-4 text-gray-500 text-sm">Select a category to see items.</div>;
        }
    };

    return (
        <div className={`bg-white h-full border-r border-gray-200 flex flex-col transition-all duration-300 ease-in-out overflow-hidden relative z-20 ${isOpen ? 'w-80' : 'w-0 opacity-0'}`}>
            {/* 
        Using a fixed width inner container (w-80) ensures that the content doesn't reflow 
        awkwardly while the parent container animates from 0px to 320px.
        overflow-x-hidden handles cases where scrollbars might slightly reduce available width.
      */}
            <div className="w-80 h-full flex flex-col overflow-x-hidden">
                <div className="h-16 flex items-center justify-between px-5 border-b border-gray-100 shrink-0 bg-white z-10">
                    <span className="font-bold text-gray-800 capitalize text-lg tracking-tight">{activeTab === 'images' ? 'Photos' : activeTab}</span>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
                        <X size={18} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};

export default ResourcePanel;
