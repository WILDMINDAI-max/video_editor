"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import ResourcePanel from './components/ResourcePanel';
import EditPanel from './components/EditPanel';
import Canvas from './components/Canvas';
import Timeline from './components/Timeline';
import ProjectDrawer from './components/ProjectDrawer';
import TransitionPanel from './components/TransitionPanel';
import RightSidebar from './components/RightSidebar';
import PreviewModal from './components/PreviewModal';
import ExportModal from './components/ExportModal';
import { Tab, CanvasDimension, Track, TimelineItem, RESIZE_OPTIONS, MOCK_VIDEOS, MOCK_IMAGES, Transition, TransitionType } from '@/types';
import { ProjectManager, LoadProjectResult } from '@/core/project/ProjectManager';
import { ProjectUpload } from '@/core/project/ProjectTypes';
import '@/app/animations.css';

interface VideoEditorProps { }

const VideoEditor: React.FC<VideoEditorProps> = () => {
    // --- Font Loading ---
    useEffect(() => {
        const linkId = 'video-editor-fonts';
        if (!document.getElementById(linkId)) {
            const link = document.createElement('link');
            link.id = linkId;
            link.rel = 'stylesheet';
            link.href = 'https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Alex+Brush&family=Alfa+Slab+One&family=Allura&family=Anton&family=Archivo+Black&family=Arimo:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&family=Arvo:ital,wght@0,400;0,700;1,400;1,700&family=Bebas+Neue&family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..900&family=Crimson+Text:ital,wght@0,400;0,600;0,700;1,400;1,600;1,700&family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Dancing+Script:wght@400..700&family=EB+Garamond:ital,wght@0,400..800;1,400..800&family=Fira+Code:wght@300..700&family=Great+Vibes&family=IBM+Plex+Mono:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;1,100;1,200;1,300;1,400;1,500;1,600;1,700&family=Inconsolata:wght@200..900&family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&family=Lato:ital,wght@0,100;0,300;0,400;0,700;0,900;1,100;1,300;1,400;1,700;1,900&family=League+Spartan:wght@100..900&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&family=Lobster&family=Lora:ital,wght@0,400..700;1,400..700&family=Merriweather:ital,wght@0,300;0,400;0,700;0,900;1,300;1,400;1,700;1,900&family=Montserrat:ital,wght@0,100..900;1,100..900&family=Noto+Sans:ital,wght@0,100..900;1,100..900&family=Nunito:ital,wght@0,200..1000;1,200..1000&family=Open+Sans:ital,wght@0,300..800;1,300..800&family=Oswald:wght@200..700&family=Pacifico&family=Parisienne&family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&family=Quicksand:wght@300..700&family=Raleway:ital,wght@0,100..900;1,100..900&family=Roboto+Slab:wght@100..900&family=Roboto:ital,wght@0,100;0,300;0,400;0,500;0,700;0,900;1,100;1,300;1,400;1,500;1,700;1,900&family=Rye&family=Satisfy&family=Shrikhand&family=Source+Code+Pro:ital,wght@0,200..900;1,200..900&family=Source+Sans+Pro:ital,wght@0,200;0,300;0,400;0,600;0,700;0,900;1,200;1,300;1,400;1,600;1,700;1,900&family=Spectral:ital,wght@0,200;0,300;0,400;0,500;0,600;0,700;0,800;1,200;1,300;1,400;1,500;1,600;1,700;1,800&family=Stardos+Stencil:wght@400;700&family=Tilt+Neon&family=Ubuntu+Mono:ital,wght@0,400;0,700;1,400;1,700&family=Ubuntu:ital,wght@0,300;0,400;0,500;0,700;1,300;1,400;1,500;1,700&family=UnifrakturMaguntia&display=swap';
            document.head.appendChild(link);
        }
    }, []);

    // --- State ---
    const [projectName, setProjectName] = useState('Untitled Video Design');
    const [activeTab, setActiveTab] = useState<Tab>('text');
    const [isResourcePanelOpen, setIsResourcePanelOpen] = useState(true);
    const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);
    const [activeEditView, setActiveEditView] = useState<'main' | 'adjust' | 'eraser' | 'color' | 'text-effects' | 'animate' | 'font'>('main');
    const [isProjectDrawerOpen, setIsProjectDrawerOpen] = useState(false);
    const [currentDimension, setCurrentDimension] = useState<CanvasDimension>(RESIZE_OPTIONS[3]);
    const [timelineHeight, setTimelineHeight] = useState(260);
    const [isDraggingTimeline, setIsDraggingTimeline] = useState(false);

    const [scalePercent, setScalePercent] = useState(0); // 0 means "Fit"
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);

    // Interaction Modes
    const [interactionMode, setInteractionMode] = useState<'none' | 'crop' | 'erase'>('none');
    const [eraserSettings, setEraserSettings] = useState<{ size: number; type: 'erase' | 'restore'; showOriginal: boolean }>({
        size: 20,
        type: 'erase',
        showOriginal: false
    });

    // Clipboard
    const [clipboard, setClipboard] = useState<TimelineItem | null>(null);

    // Uploads
    const [uploads, setUploads] = useState<Array<{ id: string, type: 'image' | 'video' | 'audio', src: string, name: string, thumbnail?: string, duration?: string }>>([]);

    // Transition Editing State
    const [transitionEditTarget, setTransitionEditTarget] = useState<{ trackId: string, itemId: string } | null>(null);
    const [previewTransition, setPreviewTransition] = useState<Transition | null>(null);

    // Timeline State
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);

    // --- Undo/Redo State ---
    const [past, setPast] = useState<Track[][]>([]);
    const [future, setFuture] = useState<Track[][]>([]);

    // Initial Tracks Configuration
    const [tracks, setTracks] = useState<Track[]>([
        {
            id: 'main-video',
            type: 'video',
            name: 'Main Video',
            items: [
                {
                    id: 'init-1',
                    type: 'video',
                    src: MOCK_VIDEOS[0].src,
                    thumbnail: MOCK_VIDEOS[0].thumbnail,
                    name: 'Intro Clip',
                    start: 0,
                    duration: 5,
                    offset: 0,
                    trackId: 'main-video',
                    layer: 0,
                    transition: { type: 'none', duration: 0 },
                    isLocked: false,
                    volume: 100,
                    speed: 1,
                    isBackground: true,
                    x: 0,
                    y: 0,
                    width: 100,
                    height: 100
                },
                {
                    id: 'init-2',
                    type: 'video',
                    src: MOCK_VIDEOS[1].src,
                    thumbnail: MOCK_VIDEOS[1].thumbnail,
                    name: 'Scene 2',
                    start: 5,
                    duration: 5,
                    offset: 0,
                    trackId: 'main-video',
                    layer: 0,
                    transition: { type: 'dissolve', duration: 1 },
                    isLocked: false,
                    volume: 100,
                    speed: 1,
                    isBackground: true,
                    x: 0,
                    y: 0,
                    width: 100,
                    height: 100
                }
            ]
        },
        {
            id: 'audio',
            type: 'audio',
            name: 'Audio',
            items: []
        }
    ]);

    const addToHistory = () => {
        setPast(prev => [...prev, tracks]);
        setFuture([]);
    };

    const handleCreateNewProject = (dimension: CanvasDimension) => {
        if (confirm(`Create new ${dimension.name} project? Unsaved changes will be lost.`)) {
            setProjectName('Untitled Video Design');
            setCurrentDimension(dimension);
            setTracks([
                {
                    id: 'main-video',
                    type: 'video',
                    name: 'Main Video',
                    items: []
                },
                {
                    id: 'audio',
                    type: 'audio',
                    name: 'Audio Track',
                    items: []
                }
            ]);
            setPast([]);
            setFuture([]);
            setCurrentTime(0);
        }
    };

    const handleOpenProject = () => {
        setIsProjectDrawerOpen(true);
    };

    const handleSaveProject = async () => {
        // Convert current uploads to ProjectUpload format
        const projectUploads: ProjectUpload[] = uploads.map(u => ({
            id: u.id,
            type: u.type,
            src: u.src,
            name: u.name,
            thumbnail: u.thumbnail,
            duration: u.duration
        }));

        await ProjectManager.saveProject(
            projectName,
            currentDimension,
            currentTime,
            tracks,
            projectUploads
        );
    };

    const handleLoadProject = async () => {
        try {
            const file = await ProjectManager.openFileDialog();
            if (!file) return;

            let result: LoadProjectResult;

            // Check if it's a ZIP-based project file
            if (file.name.endsWith('.wmpv') || file.name.endsWith('.zip')) {
                // Use ZIP loader for new format
                result = await ProjectManager.loadProjectFromZip(file);
            } else {
                // Fallback to JSON loader for legacy files
                const content = await ProjectManager.readFile(file);
                result = ProjectManager.loadProject(content);
            }

            if (!result.success || !result.data) {
                alert(result.error || 'Failed to load project file.');
                return;
            }

            const { data } = result;

            // Restore project state
            setProjectName(data.name || 'Untitled Project');
            setCurrentDimension(data.dimension);
            setTracks(data.tracks);
            setCurrentTime(data.currentTime || 0);

            // Restore uploads
            if (data.uploads && Array.isArray(data.uploads)) {
                setUploads(data.uploads.map(u => ({
                    id: u.id,
                    type: u.type,
                    src: u.src,
                    name: u.name,
                    thumbnail: u.thumbnail,
                    duration: u.duration
                })));
            }

            // Reset undo/redo history
            setPast([]);
            setFuture([]);

            // Show success message for legacy files
            if (result.isLegacyFormat) {
                console.log('Loaded legacy project format. Consider re-saving to upgrade.');
            }
        } catch (error) {
            console.error('Error loading project:', error);
            alert('Failed to load project file. Please ensure it is a valid project file.');
        }
    };

    const handleMakeCopy = () => {
        setProjectName(`Copy of ${projectName}`);
        alert('Project copy created.');
    };

    const handleMoveToTrash = () => {
        if (confirm('Are you sure you want to move this project to trash? This action cannot be undone.')) {
            setProjectName('Untitled Video Design');
            setTracks([
                {
                    id: 'main-video',
                    type: 'video',
                    name: 'Main Video',
                    items: []
                },
                {
                    id: 'audio',
                    type: 'audio',
                    name: 'Audio Track',
                    items: []
                }
            ]);
            setPast([]);
            setFuture([]);
            setCurrentTime(0);
        }
    };

    const formatDuration = (seconds: number): string => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const getAudioDuration = (file: File): Promise<number> => {
        return new Promise((resolve) => {
            const audio = document.createElement('audio');
            audio.onloadedmetadata = () => {
                resolve(audio.duration);
            };
            audio.src = URL.createObjectURL(file);
        });
    };



    const generateVideoThumbnail = (file: File): Promise<{ thumbnail: string, duration: number }> => {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.onloadedmetadata = () => {
                video.currentTime = 1; // Seek to 1s
            };
            video.onseeked = () => {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
                resolve({ thumbnail: canvas.toDataURL('image/jpeg'), duration: video.duration });
            };
            video.src = URL.createObjectURL(file);
        });
    };

    const handleUpload = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = 'image/*,video/*,audio/*';
        input.onchange = async (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (!files) return;

            const newUploads: Array<{ id: string, type: 'image' | 'video' | 'audio', src: string, name: string, thumbnail?: string, duration?: string }> = [];

            for (const file of Array.from(files)) {
                const url = URL.createObjectURL(file);
                const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'audio';
                let thumbnail: string | undefined;
                let durationStr: string | undefined;

                if (type === 'video') {
                    const result = await generateVideoThumbnail(file);
                    thumbnail = result.thumbnail;
                    durationStr = formatDuration(result.duration);
                } else if (type === 'audio') {
                    const duration = await getAudioDuration(file);
                    durationStr = formatDuration(duration);
                }

                newUploads.push({
                    id: Math.random().toString(36).substr(2, 9),
                    type: type as 'image' | 'video' | 'audio',
                    src: url,
                    name: file.name,
                    thumbnail,
                    duration: durationStr
                });
            }

            setUploads(prev => [...newUploads, ...prev]);
        };
        input.click();
    };

    const handleRemoveUpload = (id: string) => {
        setUploads(prev => prev.filter(upload => upload.id !== id));
    };

    const handleUndo = () => {
        if (past.length === 0) return;
        const previous = past[past.length - 1];
        const newPast = past.slice(0, past.length - 1);
        setFuture(prev => [tracks, ...prev]);
        setTracks(previous);
        setPast(newPast);
    };

    const handleRedo = () => {
        if (future.length === 0) return;
        const next = future[0];
        const newFuture = future.slice(1);
        setPast(prev => [...prev, tracks]);
        setTracks(next);
        setFuture(newFuture);
    };

    // --- Derived State ---
    const mainTrack = tracks.find(t => t.id === 'main-video');
    const mainTrackDuration = mainTrack?.items.reduce((max, item) => Math.max(max, item.start + item.duration), 0) || 0;
    const totalDuration = mainTrackDuration > 0 ? mainTrackDuration : 5;

    // Helper to get selected item object
    const selectedItem = useMemo(() => {
        if (!selectedTrackId || !selectedItemId) return null;
        const track = tracks.find(t => t.id === selectedTrackId);
        return track?.items.find(i => i.id === selectedItemId) || null;
    }, [selectedTrackId, selectedItemId, tracks]);

    // Effect to handle interaction mode changes
    useEffect(() => {
        if (interactionMode === 'erase') {
            setIsEditPanelOpen(true);
            setIsResourcePanelOpen(false);
        }
    }, [interactionMode]);

    // Reset interaction mode when selection is cleared
    useEffect(() => {
        if (!selectedItemId) {
            setInteractionMode('none');
        }
    }, [selectedItemId]);

    useEffect(() => {
        if (currentTime > totalDuration) {
            setCurrentTime(totalDuration);
        }
    }, [totalDuration, currentTime]);

    // --- Handlers ---

    const handleClipSelect = (trackId: string, itemId: string | null) => {
        setSelectedTrackId(trackId);
        setSelectedItemId(itemId);

        if (itemId) {
            // Logic for when an item is selected
            const track = tracks.find(t => t.id === trackId);
            const item = track?.items.find(i => i.id === itemId);

            if (item) {
                if (item.type === 'text') {
                    // For Text: Open Resource Panel (Text Tab) to show Fonts/Alignment
                    setActiveTab('text');
                    setIsResourcePanelOpen(true);
                    setIsEditPanelOpen(false);
                } else if (item.type === 'video' || item.type === 'image' || item.type === 'color') {
                    // For Media: Open Edit Panel
                    setIsEditPanelOpen(true);
                    setIsResourcePanelOpen(false);
                    setActiveEditView('main');
                } else {
                    setIsEditPanelOpen(false);
                    setIsResourcePanelOpen(true);
                }
            }
        } else {
            // Logic for deselection (click outside)
            setIsEditPanelOpen(false);
            setIsResourcePanelOpen(true); // Re-open resources so user can add new things
        }
    };

    const handleTabChange = (tab: Tab) => {
        // Close transition panel when switching tabs
        setTransitionEditTarget(null);

        // If edit panel is open, close it and open resource panel
        if (isEditPanelOpen) {
            setIsEditPanelOpen(false);
            setInteractionMode('none'); // Exit eraser if active
            setActiveTab(tab);
            setIsResourcePanelOpen(true);
            return;
        }

        if (activeTab === tab && isResourcePanelOpen) {
            setIsResourcePanelOpen(false);
        } else {
            setActiveTab(tab);
            setIsResourcePanelOpen(true);
        }
    };

    const handleOpenEditPanel = (view: 'main' | 'adjust' | 'eraser' | 'color' | 'text-effects' | 'animate' | 'font' = 'main') => {
        setIsResourcePanelOpen(false); // Close resource panel
        setTransitionEditTarget(null); // Close transition panel
        setInteractionMode('none'); // Ensure regular edit mode
        setActiveEditView(view);
        setIsEditPanelOpen(true);
    };

    const handleAddClip = (src: string, type: 'video' | 'image' | 'color' | 'text' | 'audio', overrides?: Partial<TimelineItem>) => {
        const isAudio = type === 'audio';

        // Items that should go to main background (Video, Image, Color)
        const isMainContent = type === 'video' || type === 'image' || type === 'color';

        let targetTrackId: string;
        let startTime = currentTime;
        let isBackground = false;

        if (isAudio) {
            targetTrackId = 'audio';
        } else if (isMainContent) {
            targetTrackId = 'main-video';
            isBackground = true;

            // Append to end of main track (standard video editor behavior)
            const mainTrack = tracks.find(t => t.id === 'main-video');
            const trackDuration = mainTrack?.items.reduce((max, i) => Math.max(max, i.start + i.duration), 0) || 0;
            startTime = trackDuration;
        } else {
            // Overlays (Text) - Create new track
            targetTrackId = `track-${Date.now()}`;
            isBackground = false;
        }

        // Default Styling based on Text Type
        let fontSize = 40;
        let fontWeight: 'normal' | 'bold' = 'normal';

        if (type === 'text') {
            if (src === 'Heading' || src === 'SALE' || src === 'Chill') { fontSize = 64; fontWeight = 'bold'; }
            else if (src === 'Subheading') { fontSize = 40; fontWeight = 'bold'; }
            else if (src === 'Body Text') { fontSize = 24; }
        }

        const newItem: TimelineItem = {
            id: Date.now().toString(),
            type: type as any,
            src,
            name: type === 'color' ? 'Solid Color' : type === 'text' ? src : (type === 'video' ? 'Video Clip' : 'Image Clip'),
            start: startTime,
            duration: type === 'video' ? 5 : 3,
            offset: 0,
            trackId: targetTrackId,
            layer: isBackground ? 0 : 1,
            thumbnail: type === 'video' ? MOCK_VIDEOS.find(v => v.src === src)?.thumbnail : src,
            transition: { type: 'none', duration: 0.5 },
            isLocked: false,
            volume: type === 'video' || type === 'audio' ? 100 : undefined,
            speed: type === 'video' ? 1 : undefined,
            isBackground: isBackground,
            x: 0,
            y: 0,
            width: isBackground ? 100 : (type === 'text' ? undefined : 50),
            height: isBackground ? 100 : (type === 'text' ? undefined : 50),

            // Text Defaults
            fontSize,
            fontWeight,
            fontFamily: 'Inter, sans-serif',
            color: '#000000',
            textAlign: 'center',
            fontStyle: 'normal',
            textDecoration: 'none',
            textTransform: 'none',
            listType: 'none',

            // Apply Overrides
            fit: type === 'image' ? 'contain' : 'cover',
            ...overrides
        };

        if (isAudio) {
            addToHistory();
            setTracks(prev => prev.map(t => t.id === 'audio' ? { ...t, items: [...t.items, newItem] } : t));
        } else if (isMainContent) {
            // Add to Main Video Track
            addToHistory();
            setTracks(prev => prev.map(t => t.id === 'main-video' ? { ...t, items: [...t.items, newItem] } : t));
            // Move playhead to the start of the new clip so user sees it immediately
            setCurrentTime(startTime);
            setTimeout(() => handleClipSelect('main-video', newItem.id), 0);
        } else {
            // Create new overlay track
            const newTrack: Track = {
                id: targetTrackId,
                type: 'overlay',
                name: type === 'text' ? 'Text' : 'Overlay',
                items: [newItem]
            };

            // Insert new track after main video but before audio
            addToHistory();
            setTracks(prev => {
                const newTracks = [...prev];
                const audioIndex = newTracks.findIndex(t => t.id === 'audio');
                if (audioIndex !== -1) {
                    newTracks.splice(audioIndex, 0, newTrack);
                } else {
                    newTracks.push(newTrack);
                }
                return newTracks;
            });
            setTimeout(() => handleClipSelect(targetTrackId, newItem.id), 0);
        }
    };

    const handleUpdateClip = (trackId: string, updatedItem: TimelineItem, skipHistory = false) => {
        if (!skipHistory) addToHistory();
        setTracks(prev => prev.map(track => {
            if (track.id === trackId) {
                const newItems = track.items.map(i => i.id === updatedItem.id ? updatedItem : i);
                return { ...track, items: newItems };
            }
            return track;
        }));
    };

    const handleDeleteClip = (trackId: string, itemId: string) => {
        addToHistory();
        setTracks(prev => {
            const newTracks = prev.map(track => {
                if (track.id === trackId) {
                    return { ...track, items: track.items.filter(i => i.id !== itemId) };
                }
                return track;
            });

            // Clean up empty overlay tracks (don't remove main or audio)
            return newTracks.filter(t => {
                if (t.id === 'main-video' || t.id === 'audio') return true;
                return t.items.length > 0;
            });
        });

        // Explicitly clear selection if the deleted item was selected
        if (selectedItemId === itemId) {
            handleClipSelect('', null);
        }
    };

    const handleClearAll = () => {
        addToHistory();
        setTracks(prev => {
            // Clear all items from all tracks
            const clearedTracks = prev.map(track => ({
                ...track,
                items: []
            }));

            // Remove empty overlay tracks (keep main-video and audio even if empty)
            return clearedTracks.filter(t => {
                if (t.id === 'main-video' || t.id === 'audio') return true;
                return t.items.length > 0;
            });
        });
        // Clear selection
        handleClipSelect('', null);
    };

    // --- Clip Actions (Context Menu) ---

    const handleCopyClip = (item: TimelineItem) => {
        setClipboard(item);
    };

    const handlePasteClip = (targetTrackId: string, insertTime: number) => {
        if (!clipboard) return;

        if (targetTrackId === 'main-video') {
            const newItem: TimelineItem = {
                ...clipboard,
                id: Date.now().toString(),
                start: insertTime,
                trackId: targetTrackId,
                isLocked: false,
                isBackground: true
            };
            addToHistory();
            setTracks(prev => prev.map(track => {
                if (track.id === targetTrackId) {
                    return { ...track, items: [...track.items, newItem] };
                }
                return track;
            }));
        } else {
            // Create new track for pasted overlay
            const newTrackId = `track-${Date.now()}`;
            const newItem: TimelineItem = {
                ...clipboard,
                id: Date.now().toString(),
                start: insertTime,
                trackId: newTrackId,
                isLocked: false,
                isBackground: false
            };
            const newTrack: Track = {
                id: newTrackId,
                type: 'overlay',
                name: 'Copy of ' + clipboard.name,
                items: [newItem]
            };

            setTracks(prev => {
                const newTracks = [...prev];
                const audioIndex = newTracks.findIndex(t => t.id === 'audio');
                if (audioIndex !== -1) newTracks.splice(audioIndex, 0, newTrack);
                else newTracks.push(newTrack);
                return newTracks;
            });
            addToHistory();
            setTimeout(() => {
                setSelectedTrackId(newTrackId);
                setSelectedItemId(newItem.id);
            }, 0);
        }
    };

    const handleMoveClip = (itemId: string, sourceTrackId: string, targetTrackId: string, newStart: number) => {
        // 1. Find the item
        const sourceTrack = tracks.find(t => t.id === sourceTrackId);
        const item = sourceTrack?.items.find(i => i.id === itemId);
        const targetTrack = tracks.find(t => t.id === targetTrackId);

        if (!sourceTrack || !item || !targetTrack) return;

        // 2. Validate Constraints
        // Audio Track: Only accepts audio items
        if (targetTrack.type === 'audio' && item.type !== 'audio') return;
        // Video/Overlay Tracks: Do not accept audio items
        if (targetTrack.type !== 'audio' && item.type === 'audio') return;
        // Main Video Track: Do not accept text items
        if (targetTrack.id === 'main-video' && item.type === 'text') return;

        // 3. Prepare New Item
        const isTargetMain = targetTrack.id === 'main-video';
        const isSourceMain = sourceTrackId === 'main-video';
        const newItem: TimelineItem = {
            ...item,
            trackId: targetTrackId,
            start: newStart,
            isBackground: isTargetMain, // Auto-set background if moving to main track
            layer: isTargetMain ? 0 : 1,
            width: isTargetMain ? 100 : (item.type === 'text' ? item.width : (item.width || 50)),
            height: isTargetMain ? 100 : (item.type === 'text' ? item.height : (item.height || 50)),
            x: isTargetMain ? 0 : (item.x || 0),
            y: isTargetMain ? 0 : (item.y || 0),
            // Remove transition if moving from main to overlay
            transition: (isSourceMain && !isTargetMain) ? { type: 'none', duration: 0 } : item.transition
        };

        addToHistory();
        setTracks(prev => {
            const newTracks = prev.map(track => {
                // Remove from source
                if (track.id === sourceTrackId) {
                    return { ...track, items: track.items.filter(i => i.id !== itemId) };
                }
                // Add to target
                if (track.id === targetTrackId) {
                    return { ...track, items: [...track.items, newItem] };
                }
                return track;
            });
            return newTracks;
        });

        // Update selection to new track/item
        setSelectedTrackId(targetTrackId);
        setSelectedItemId(newItem.id);
    };

    const handleDuplicateClip = (trackId: string, itemId: string) => {
        const track = tracks.find(t => t.id === trackId);
        const item = track?.items.find(i => i.id === itemId);
        if (!item || !track) return;

        if (track.id === 'main-video') {
            const newItem: TimelineItem = {
                ...item,
                id: Date.now().toString(),
                start: item.start + item.duration,
                isLocked: false
            };
            addToHistory();
            setTracks(prev => prev.map(t => t.id === trackId ? { ...t, items: [...t.items, newItem] } : t));
        } else {
            // Duplicate overlay -> New Track
            const newTrackId = `track-${Date.now()}`;
            const newItem: TimelineItem = {
                ...item,
                id: Date.now().toString(),
                trackId: newTrackId,
                start: item.start, // Same time, just on top
                x: (item.x || 0) + 5, // Visual offset
                y: (item.y || 0) + 5,
                isLocked: false
            };
            const newTrack: Track = {
                id: newTrackId,
                type: 'overlay',
                name: item.name,
                items: [newItem]
            };

            addToHistory();
            setTracks(prev => {
                const newTracks = [...prev];
                const idx = newTracks.findIndex(t => t.id === trackId);
                // Insert after current track
                newTracks.splice(idx + 1, 0, newTrack);
                return newTracks;
            });
        }
    };

    const handleLockClip = (trackId: string, itemId: string) => {
        addToHistory();
        setTracks(prev => prev.map(track => {
            if (track.id === trackId) {
                return {
                    ...track,
                    items: track.items.map(i => i.id === itemId ? { ...i, isLocked: !i.isLocked } : i)
                };
            }
            return track;
        }));
    };
    const handleDetachBackground = (trackId: string, itemId: string) => {
        addToHistory();
        setTracks(prev => {
            // 1. Find Item
            const sourceTrack = prev.find(t => t.id === trackId);
            const item = sourceTrack?.items.find(i => i.id === itemId);
            if (!sourceTrack || !item) return prev;

            const newTracks = prev.map(t => t.id === trackId ? { ...t, items: t.items.filter(i => i.id !== itemId) } : t);

            if (item.isBackground) {
                // Detach: Create new Overlay Track
                const newTrackId = `track-${Date.now()}`;
                const newItem: TimelineItem = {
                    ...item,
                    trackId: newTrackId,
                    isBackground: false,
                    width: 50,
                    height: undefined,
                    x: 0,
                    y: 0,
                    layer: 10
                };

                const newTrack: Track = {
                    id: newTrackId,
                    type: 'overlay',
                    name: 'Layer ' + (prev.length - 1), // Simple naming
                    items: [newItem]
                };

                // Insert after main video
                const audioIndex = newTracks.findIndex(t => t.id === 'audio');
                if (audioIndex !== -1) newTracks.splice(audioIndex, 0, newTrack);
                else newTracks.push(newTrack);

                setTimeout(() => handleClipSelect(newTrackId, newItem.id), 0);
                return newTracks;

            } else {
                // Attach: Move to Main Video (End)
                const mainTrackIndex = newTracks.findIndex(t => t.id === 'main-video');
                if (mainTrackIndex !== -1) {
                    const mainTrack = newTracks[mainTrackIndex];
                    const lastItem = mainTrack.items[mainTrack.items.length - 1];
                    const newItem: TimelineItem = {
                        ...item,
                        trackId: 'main-video',
                        isBackground: true,
                        x: 0, y: 0, width: 100, height: 100, rotation: 0,
                        start: lastItem ? lastItem.start + lastItem.duration : 0,
                        crop: { x: 50, y: 50, zoom: 1 },
                        layer: 0,
                        border: undefined // Clear border when setting as background
                    };

                    // Immutable update: Create new main track with new item
                    // Ensure we don't add duplicates if something went wrong
                    if (!mainTrack.items.some(i => i.id === newItem.id)) {
                        newTracks[mainTrackIndex] = {
                            ...mainTrack,
                            items: [...mainTrack.items, newItem]
                        };
                    }

                    // Remove empty source track if it was an overlay track
                    if (sourceTrack.id !== 'main-video' && sourceTrack.id !== 'audio') {
                        const idx = newTracks.findIndex(t => t.id === sourceTrack.id);
                        // Check if the track in newTracks (which has the item removed) is now empty
                        if (idx !== -1 && newTracks[idx].items.length === 0) {
                            newTracks.splice(idx, 1);
                        }
                    }

                    setTimeout(() => handleClipSelect('main-video', newItem.id), 0);
                }
                return newTracks;
            }
        });
    };

    const handleAlignClip = (trackId: string, itemId: string, align: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
        addToHistory();
        setTracks(prev => prev.map(track => {
            if (track.id === trackId) {
                return {
                    ...track,
                    items: track.items.map(item => {
                        if (item.id === itemId) {
                            const newItem = { ...item };

                            // For Text: Use Smart Anchoring (Change alignment prop + set position to edge)
                            if (item.type === 'text') {
                                switch (align) {
                                    case 'left':
                                        newItem.textAlign = 'left';
                                        newItem.x = -50; // Left edge
                                        break;
                                    case 'center':
                                        newItem.textAlign = 'center';
                                        newItem.x = 0;
                                        break;
                                    case 'right':
                                        newItem.textAlign = 'right';
                                        newItem.x = 50; // Right edge
                                        break;
                                    case 'top':
                                        newItem.verticalAlign = 'top';
                                        newItem.y = -50; // Top edge
                                        break;
                                    case 'middle':
                                        newItem.verticalAlign = 'middle';
                                        newItem.y = 0;
                                        break;
                                    case 'bottom':
                                        newItem.verticalAlign = 'bottom';
                                        newItem.y = 50; // Bottom edge
                                        break;
                                }
                            } else {
                                // For Non-Text (Fixed Width/Height): Use Center Anchor + Half Size Offset
                                const halfW = (item.width || 0) / 2;
                                const halfH = (item.height || 0) / 2;

                                switch (align) {
                                    case 'left': newItem.x = -50 + halfW; break;
                                    case 'center': newItem.x = 0; break;
                                    case 'right': newItem.x = 50 - halfW; break;
                                    case 'top': newItem.y = -50 + halfH; break;
                                    case 'middle': newItem.y = 0; break;
                                    case 'bottom': newItem.y = 50 - halfH; break;
                                }
                            }
                            return newItem;
                        }
                        return item;
                    })
                };
            }
            return track;
        }));
    };

    const handleDropClip = (trackId: string, time: number, itemData: any) => {
        const targetTrack = tracks.find(t => t.id === trackId);
        if (!targetTrack) return;

        // 1. Audio
        if (itemData.type === 'audio') {
            let audioTrack = tracks.find(t => t.type === 'audio');
            if (!audioTrack) return;

            const newItem: TimelineItem = {
                id: Date.now().toString(),
                type: 'audio',
                src: itemData.src,
                name: itemData.name,
                start: time,
                duration: itemData.duration || 10,
                offset: 0,
                trackId: audioTrack.id,
                layer: 1,
                volume: 100,
                isBackground: false
            };

            addToHistory();
            setTracks(prev => prev.map(t => t.id === audioTrack!.id ? { ...t, items: [...t.items, newItem] } : t));
            return;
        }

        // 2. Text
        if (itemData.type === 'text') {
            // Prevent dropping text on main video track
            if (targetTrack.id === 'main-video') return;

            if (targetTrack.type === 'overlay') {
                const newItem: TimelineItem = {
                    id: Date.now().toString(),
                    type: 'text',
                    src: itemData.src,
                    name: itemData.name,
                    start: time,
                    duration: 3,
                    offset: 0,
                    trackId: trackId,
                    layer: 1,
                    isBackground: false,
                    fontSize: itemData.fontSize || 40,
                    fontWeight: itemData.fontWeight || 'normal',
                    fontFamily: itemData.fontFamily || 'Inter, sans-serif',
                    color: itemData.color || '#000000',
                    textEffect: itemData.textEffect,
                    fontStyle: itemData.fontStyle
                };
                addToHistory();
                setTracks(prev => prev.map(t => t.id === trackId ? { ...t, items: [...t.items, newItem] } : t));
            } else {
                const newTrackId = `track-${Date.now()}`;
                const newItem: TimelineItem = {
                    id: Date.now().toString(),
                    type: 'text',
                    src: itemData.src,
                    name: itemData.name,
                    start: time,
                    duration: 3,
                    offset: 0,
                    trackId: newTrackId,
                    layer: 1,
                    isBackground: false,
                    fontSize: itemData.fontSize || 40,
                    fontWeight: itemData.fontWeight || 'normal',
                    fontFamily: itemData.fontFamily || 'Inter, sans-serif',
                    color: itemData.color || '#000000',
                    textEffect: itemData.textEffect,
                    fontStyle: itemData.fontStyle
                };
                const newTrack: Track = {
                    id: newTrackId,
                    type: 'overlay',
                    name: 'Text',
                    items: [newItem]
                };
                addToHistory();
                setTracks(prev => {
                    const newTracks = [...prev];
                    const audioIndex = newTracks.findIndex(t => t.id === 'audio');
                    if (audioIndex !== -1) newTracks.splice(audioIndex, 0, newTrack);
                    else newTracks.push(newTrack);
                    return newTracks;
                });
            }
            return;
        }

        // 3. Video / Image
        if (itemData.type === 'video' || itemData.type === 'image') {
            if (targetTrack.id === 'main-video') {
                const newItem: TimelineItem = {
                    id: Date.now().toString(),
                    type: itemData.type,
                    src: itemData.src,
                    name: itemData.name,
                    thumbnail: itemData.thumbnail,
                    start: time,
                    duration: itemData.duration || 5,
                    offset: 0,
                    trackId: 'main-video',
                    layer: 0,
                    isBackground: true,
                    width: 100, height: 100, x: 0, y: 0,
                    fit: itemData.type === 'image' ? 'contain' : 'cover'
                };
                addToHistory();
                setTracks(prev => prev.map(t => t.id === 'main-video' ? { ...t, items: [...t.items, newItem] } : t));
            } else if (targetTrack.type === 'overlay') {
                const newItem: TimelineItem = {
                    id: Date.now().toString(),
                    type: itemData.type,
                    src: itemData.src,
                    name: itemData.name,
                    thumbnail: itemData.thumbnail,
                    start: time,
                    duration: itemData.duration || 5,
                    offset: 0,
                    trackId: trackId,
                    layer: 1,
                    isBackground: false,
                    width: 100, height: 100, x: 0, y: 0,
                    fit: itemData.type === 'image' ? 'contain' : 'cover'
                };
                addToHistory();
                setTracks(prev => prev.map(t => t.id === trackId ? { ...t, items: [...t.items, newItem] } : t));
            } else {
                const newTrackId = `track-${Date.now()}`;
                const newItem: TimelineItem = {
                    id: Date.now().toString(),
                    type: itemData.type,
                    src: itemData.src,
                    name: itemData.name,
                    thumbnail: itemData.thumbnail,
                    start: time,
                    duration: itemData.duration || 5,
                    offset: 0,
                    trackId: newTrackId,
                    layer: 1,
                    isBackground: false,
                    width: 100, height: 100, x: 0, y: 0,
                    fit: itemData.type === 'image' ? 'contain' : 'cover'
                };
                const newTrack: Track = {
                    id: newTrackId,
                    type: 'overlay',
                    name: 'Overlay',
                    items: [newItem]
                };
                addToHistory();
                setTracks(prev => {
                    const newTracks = [...prev];
                    const audioIndex = newTracks.findIndex(t => t.id === 'audio');
                    if (audioIndex !== -1) newTracks.splice(audioIndex, 0, newTrack);
                    else newTracks.push(newTrack);
                    return newTracks;
                });
            }
        }
    };

    // --- Keyboard Shortcuts ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                if (selectedItemId && selectedTrackId) {
                    const track = tracks.find(t => t.id === selectedTrackId);
                    const item = track?.items.find(i => i.id === selectedItemId);
                    if (item) handleCopyClip(item);
                }
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                if (clipboard && selectedTrackId) {
                    handlePasteClip(selectedTrackId, currentTime);
                }
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    handleRedo();
                } else {
                    handleUndo();
                }
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                handleRedo();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
                e.preventDefault();
                if (selectedItemId && selectedTrackId) {
                    handleDuplicateClip(selectedTrackId, selectedItemId);
                }
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedItemId && selectedTrackId) {
                    handleDeleteClip(selectedTrackId, selectedItemId);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedItemId, selectedTrackId, clipboard, tracks, currentTime]);


    const handleSplitClip = () => {
        if (!selectedItemId || !selectedTrackId) return;

        let newSelectId: string | null = null;

        addToHistory();
        setTracks(prev => prev.map(track => {
            // Only split items in the selected track
            if (track.id !== selectedTrackId) return track;

            // Only split the selected item
            const itemIndex = track.items.findIndex(i => i.id === selectedItemId);
            if (itemIndex === -1) return track;

            const itemToSplit = track.items[itemIndex];

            // Check if item is locked and if playhead is actually inside the item range
            // (exclusive of edges to prevent zero-duration clips)
            if (!itemToSplit.isLocked &&
                currentTime > itemToSplit.start &&
                currentTime < (itemToSplit.start + itemToSplit.duration)) {

                const splitPoint = currentTime - itemToSplit.start;

                // 1. Left Part (Update existing item logic or create new)
                // We keep reference to some props but it's a new object
                const leftPart: TimelineItem = {
                    ...itemToSplit,
                    duration: splitPoint
                };

                // 2. Right Part (New Item)
                const rightPart: TimelineItem = {
                    ...itemToSplit,
                    id: Date.now().toString(), // Must have unique ID
                    start: currentTime,
                    duration: itemToSplit.duration - splitPoint,
                    offset: itemToSplit.offset + splitPoint,
                    transition: { type: 'none', duration: 0 } // Reset transition for the split point usually
                };

                newSelectId = rightPart.id;

                // Create new items array replacing the original with the two parts
                const newItems = [...track.items];
                newItems.splice(itemIndex, 1, leftPart, rightPart);

                return { ...track, items: newItems };
            }
            return track;
        }));

        // Auto-select the second part of the split clip for better workflow
        if (newSelectId) {
            setTimeout(() => handleClipSelect(selectedTrackId, newSelectId), 50);
        }
    };

    const handleTimelineAdd = (type: 'video' | 'image' | 'color') => {
        // Create a new track
        const newTrackId = `track-${Date.now()}`;
        const newTrack: Track = {
            id: newTrackId,
            type: type === 'image' || type === 'color' ? 'overlay' : 'video',
            name: type === 'video' ? 'Video Track' : 'Overlay Track',
            items: []
        };

        addToHistory();
        setTracks(prev => {
            const newTracks = [...prev];
            const audioIndex = newTracks.findIndex(t => t.id === 'audio');
            if (audioIndex !== -1) newTracks.splice(audioIndex, 0, newTrack);
            else newTracks.push(newTrack);
            return newTracks;
        });
    };

    // Transition Handler
    const handleTransitionUpdate = (newTransition: Transition) => {
        if (!transitionEditTarget) return;
        const { trackId, itemId } = transitionEditTarget;
        const track = tracks.find(t => t.id === trackId);
        const item = track?.items.find(i => i.id === itemId);
        if (item) {
            handleUpdateClip(trackId, { ...item, transition: newTransition });
        }
    };

    const handleApplyTransitionToAll = (transitionToApply: Transition) => {
        if (!transitionEditTarget) return;
        const { trackId } = transitionEditTarget;
        addToHistory();
        setTracks(prev => prev.map(track => {
            if (track.id === trackId) {
                const newItems = track.items.map((item) => {
                    return { ...item, transition: { ...transitionToApply } };
                });
                return { ...track, items: newItems };
            }
            return track;
        }));
    };

    const handleTransitionHover = (type: TransitionType | null) => {
        if (!type || !transitionEditTarget) {
            setPreviewTransition(null);
            return;
        }
        const current = getCurrentTransition();
        setPreviewTransition({
            type,
            duration: current?.duration || 1.5,
            direction: current?.direction || 'left',
            origin: current?.origin || 'center',
            speed: current?.speed || 1.0
        });
    };

    const getCurrentTransition = (): Transition | undefined => {
        if (!transitionEditTarget) return undefined;
        const track = tracks.find(t => t.id === transitionEditTarget.trackId);
        return track?.items.find(i => i.id === transitionEditTarget.itemId)?.transition;
    };

    // High-fidelity playback using requestAnimationFrame
    // OPTIMIZED: Throttle React state updates to ~30fps to prevent excessive re-renders
    // The actual video elements play at native framerate independently
    useEffect(() => {
        if (!isPlaying) return;

        let animationFrameId: number;
        let lastTimestamp = performance.now();
        let lastStateUpdate = performance.now();
        let accumulatedTime = currentTime;

        const loop = (timestamp: number) => {
            const delta = (timestamp - lastTimestamp) / 1000;
            lastTimestamp = timestamp;

            // Accumulate time internally (not in React state)
            accumulatedTime += delta;

            // Check for end
            if (accumulatedTime >= totalDuration) {
                setCurrentTime(0);
                setIsPlaying(false);
                return;
            }

            // Throttle React state updates to ~10fps (every 100ms)
            // The video plays at native framerate via DOM - React only updates the timeline scrubber position
            // This DRAMATICALLY reduces re-renders for smooth 4K/8K playback
            const timeSinceLastUpdate = timestamp - lastStateUpdate;
            if (timeSinceLastUpdate >= 100) {
                lastStateUpdate = timestamp;
                setCurrentTime(accumulatedTime);
            }

            animationFrameId = requestAnimationFrame(loop);
        };

        animationFrameId = requestAnimationFrame(loop);

        return () => cancelAnimationFrame(animationFrameId);
    }, [isPlaying, totalDuration]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDraggingTimeline) {
                const newHeight = window.innerHeight - e.clientY;
                setTimelineHeight(Math.max(200, Math.min(600, newHeight)));
            }
        };
        const handleMouseUp = () => setIsDraggingTimeline(false);
        if (isDraggingTimeline) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
    }, [isDraggingTimeline]);

    const handleClipDragEnd = (trackId: string) => {
        addToHistory();
        setTracks(prev => prev.map(track => {
            if (track.id === trackId) {
                // 1. Sort by current start time
                const sortedItems = [...track.items].sort((a, b) => a.start - b.start);

                // 2. Apply Layout
                if (track.id === 'main-video') {
                    // Magnetic: 0, dur, dur+dur...
                    let currentTime = 0;
                    const newItems = sortedItems.map(item => {
                        const newItem = { ...item, start: currentTime };
                        currentTime += item.duration;
                        return newItem;
                    });
                    return { ...track, items: newItems };
                } else {
                    // Overlays: Resolve Overlaps (Shift Right)
                    let lastEnd = 0;
                    const newItems = sortedItems.map(item => {
                        // If item starts before last ended, push it
                        let start = item.start;
                        if (start < lastEnd) {
                            start = lastEnd;
                        }
                        const newItem = { ...item, start };
                        lastEnd = start + item.duration;
                        return newItem;
                    });
                    return { ...track, items: newItems };
                }
            }
            return track;
        }));
    };

    const handleDimensionChange = (newDim: CanvasDimension) => {
        setCurrentDimension(newDim);

        // Update background items to "contain" fit to preserve image aspect ratio
        // Images will show at their own aspect ratio within the new canvas dimensions
        setTracks(prev => prev.map(track => {
            if (track.type === 'video' || track.type === 'overlay') {
                return {
                    ...track,
                    items: track.items.map(item => {
                        if (item.isBackground) {
                            return { ...item, fit: 'contain' };
                        }
                        return item;
                    })
                };
            }
            return track;
        }));
    };

    return (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm" style={{ zIndex: 20000 }}>
            <div className="bg-white w-[100vw] h-[100vh]  shadow-2xl flex flex-col overflow-hidden relative" style={{ zIndex: 20001 }}>
                <Header
                    projectName={projectName}
                    setProjectName={setProjectName}
                    onToggleProjectMenu={() => setIsProjectDrawerOpen(true)}
                    currentDimension={currentDimension}
                    onResize={handleDimensionChange}
                    scalePercent={scalePercent}
                    setScalePercent={setScalePercent}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    canUndo={past.length > 0}
                    canRedo={future.length > 0}
                    onCreateNew={handleCreateNewProject}
                    onOpenProject={handleOpenProject}
                    onSaveProject={handleSaveProject}
                    onLoadProject={handleLoadProject}
                    onMakeCopy={handleMakeCopy}
                    onMoveToTrash={handleMoveToTrash}
                    onPreview={() => setIsPreviewOpen(true)}
                    onExport={() => setIsExportModalOpen(true)}
                />

                <div className="flex-1 flex overflow-hidden relative">
                    <Sidebar activeTab={activeTab} setActiveTab={handleTabChange} />

                    {/* Resource Panel */}
                    <ResourcePanel
                        activeTab={activeTab}
                        isOpen={isResourcePanelOpen && !isEditPanelOpen}
                        onClose={() => setIsResourcePanelOpen(false)}
                        onAddClip={handleAddClip}
                        selectedItem={selectedItem}
                        onAlign={(align) => selectedTrackId && selectedItemId && handleAlignClip(selectedTrackId, selectedItemId, align)}
                        uploads={uploads}
                        onUpload={handleUpload}
                        onRemoveUpload={handleRemoveUpload}
                    />

                    {/* Edit Panel (Includes Eraser View) */}
                    <EditPanel
                        isOpen={isEditPanelOpen}
                        selectedItem={selectedItem}
                        interactionMode={interactionMode}
                        eraserSettings={eraserSettings}
                        setEraserSettings={setEraserSettings}
                        setInteractionMode={setInteractionMode}
                        initialView={activeEditView}
                        onClose={() => {
                            // Clicking X on panel deselects item
                            handleClipSelect('', null);
                        }}
                        onUpdate={(updatedItem, skipHistory) => selectedTrackId && handleUpdateClip(selectedTrackId, updatedItem, skipHistory)}
                        onOpenEffectView={(view) => handleOpenEditPanel(view)}
                        onAlign={(align) => selectedTrackId && selectedItemId && handleAlignClip(selectedTrackId, selectedItemId, align)}
                    />

                    {/* Transition Panel */}
                    {transitionEditTarget && (
                        <TransitionPanel
                            transition={getCurrentTransition()}
                            onUpdate={handleTransitionUpdate}
                            onApplyToAll={handleApplyTransitionToAll}
                            onHover={handleTransitionHover}
                            onClose={() => {
                                setTransitionEditTarget(null);
                                setPreviewTransition(null);
                            }}
                        />
                    )}

                    <div className="flex-1 flex flex-col min-w-0 relative">
                        <Canvas
                            dimension={currentDimension}
                            scalePercent={scalePercent}
                            setScalePercent={setScalePercent}
                            tracks={tracks}
                            currentTime={currentTime}
                            isPlaying={isPlaying}
                            previewTransition={previewTransition}
                            previewTargetId={transitionEditTarget?.itemId}
                            selectedItemId={selectedItemId}

                            // Interaction Props
                            interactionMode={interactionMode}
                            setInteractionMode={setInteractionMode}
                            eraserSettings={eraserSettings}

                            onSelectClip={handleClipSelect}
                            onUpdateClip={handleUpdateClip}
                            onDeleteClip={handleDeleteClip}
                            onSplitClip={handleSplitClip}
                            onOpenEditPanel={(view) => handleOpenEditPanel(view)}
                            onOpenColorPanel={() => handleOpenEditPanel('color')}
                            onCopy={handleCopyClip}
                            onPaste={(trackId) => handlePasteClip(trackId, currentTime)}
                            onDuplicate={handleDuplicateClip}
                            onLock={handleLockClip}
                            onDetach={handleDetachBackground}
                            onAlign={handleAlignClip}
                        />

                        <div
                            className="h-1 bg-gray-300 cursor-row-resize hover:bg-violet-500 transition-colors shrink-0 z-40 relative"
                            onMouseDown={() => setIsDraggingTimeline(true)}
                        >
                            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-1 bg-gray-400 rounded-full pointer-events-none"></div>
                        </div>

                        <div style={{ height: timelineHeight }} className="shrink-0 shadow-top relative z-30">
                            <Timeline
                                tracks={tracks}
                                currentTime={currentTime}
                                totalDuration={totalDuration}
                                isPlaying={isPlaying}
                                onPlayPause={() => setIsPlaying(!isPlaying)}
                                onSeek={setCurrentTime}
                                onUpdateClip={handleUpdateClip}
                                onDeleteClip={handleDeleteClip}
                                onSplitClip={handleSplitClip}
                                onClearAll={handleClearAll}
                                onAddTrackItem={handleTimelineAdd}
                                onSelectTransition={(trackId, itemId) => setTransitionEditTarget({ trackId, itemId })}
                                selectedItemId={selectedItemId}
                                onSelectClip={handleClipSelect}
                                onCopy={handleCopyClip}
                                onPaste={(trackId) => handlePasteClip(trackId, currentTime)}
                                onDuplicate={handleDuplicateClip}
                                onLock={handleLockClip}
                                onDetach={handleDetachBackground}
                                onMoveClip={handleMoveClip}
                                onDropClip={handleDropClip}
                                onClipDragEnd={handleClipDragEnd}
                            />
                        </div>
                    </div>

                    <RightSidebar
                        selectedItem={selectedItem}
                        onUpdate={(updates) => selectedTrackId && selectedItem && handleUpdateClip(selectedTrackId, { ...selectedItem, ...updates })}
                        onEdit={() => handleOpenEditPanel('main')}
                        onAnimate={() => handleOpenEditPanel('animate')}
                        onEraser={() => setInteractionMode('erase')}
                        onCrop={() => setInteractionMode('crop')}
                        onLock={() => selectedTrackId && selectedItemId && handleLockClip(selectedTrackId, selectedItemId)}
                        onDuplicate={() => selectedTrackId && selectedItemId && handleDuplicateClip(selectedTrackId, selectedItemId)}
                        onDelete={() => selectedTrackId && selectedItemId && handleDeleteClip(selectedTrackId, selectedItemId)}
                        onCopy={() => selectedItem && handleCopyClip(selectedItem)}
                        onPaste={() => selectedTrackId && handlePasteClip(selectedTrackId, currentTime)}
                        onSplit={handleSplitClip}
                        onDetach={handleDetachBackground}
                        onFont={() => handleOpenEditPanel('font')}
                        onTextEffects={() => handleOpenEditPanel('text-effects')}
                    />
                </div>
            </div>
            {/* Preview Modal */}
            <PreviewModal
                isOpen={isPreviewOpen}
                onClose={() => setIsPreviewOpen(false)}
                tracks={tracks}
                dimension={currentDimension}
                totalDuration={totalDuration}
                onDimensionChange={handleDimensionChange}
            />

            {/* Export Modal */}
            <ExportModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                tracks={tracks}
                duration={totalDuration}
                dimension={currentDimension}
                projectName={projectName}
            />
        </div>
    );
};

export default VideoEditor;
