
// =================================================================================================
// Export Modal - Professional Video Export UI
// Original design inspired by Filmora concepts but with unique styling
// =================================================================================================

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Download, Settings, Cpu, Zap, HardDrive, Clock, Server, Globe, FolderOpen } from 'lucide-react';
import type { Track, CanvasDimension } from '@/types';
import {
    exportEngine,
    deviceDetector,
    type ExportSettings,
    type ExportProgress,
    type DeviceCapabilities,
    RESOLUTION_PRESETS,
    BITRATE_CONFIGS,
    DEFAULT_EXPORT_SETTINGS,
} from '@/core';
import { serverExportService } from '@/core/export/ServerExportService';

interface ExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    tracks: Track[];
    duration: number; // seconds
    dimension: CanvasDimension;
    projectName: string;
}

const ExportModal: React.FC<ExportModalProps> = ({
    isOpen,
    onClose,
    tracks,
    duration,
    dimension,
    projectName,
}) => {
    // State
    const [settings, setSettings] = useState<ExportSettings>({
        ...DEFAULT_EXPORT_SETTINGS,
        projectName,
        resolution: { width: dimension.width, height: dimension.height, label: `${dimension.height}p` },
    });
    const [deviceCapabilities, setDeviceCapabilities] = useState<DeviceCapabilities | null>(null);
    const [showRecommendations, setShowRecommendations] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [progress, setProgress] = useState<ExportProgress>({ phase: 'preparing', progress: 0 });
    const [useServerExport, setUseServerExport] = useState(false);
    const [serverAvailable, setServerAvailable] = useState(false);

    // File System Access API state for custom save location
    const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
    const [saveLocation, setSaveLocation] = useState<string>('Downloads folder');

    // Load device capabilities on mount
    useEffect(() => {
        if (isOpen) {
            deviceDetector.getDeviceCapabilities().then(setDeviceCapabilities);
            // Check if server export is available
            serverExportService.isAvailable().then(available => {
                setServerAvailable(available);
                if (available) setUseServerExport(true); // Default to server if available
            });
        }
    }, [isOpen]);

    // Sync resolution when canvas dimension changes
    useEffect(() => {
        if (isOpen) {
            setSettings(prev => ({
                ...prev,
                resolution: {
                    width: dimension.width,
                    height: dimension.height,
                    label: `${Math.min(dimension.width, dimension.height)}p`
                }
            }));
        }
    }, [isOpen, dimension.width, dimension.height]);

    // Calculate summary info
    const summaryInfo = useMemo(() => {
        const fps = settings.fps;
        const bitrateConfig = BITRATE_CONFIGS[settings.resolution.label] || BITRATE_CONFIGS['1080p'];
        const bitrate = bitrateConfig[settings.quality];
        const colorSpace = 'SDR-Rec.709';

        return { fps, bitrate, colorSpace };
    }, [settings.fps, settings.resolution.label, settings.quality]);

    // Calculate estimated file size
    const estimatedSize = useMemo(() => {
        const bitrate = summaryInfo.bitrate;
        const sizeBytes = (bitrate * 1000 * duration) / 8; // Convert kbps to bytes
        const sizeMB = sizeBytes / (1024 * 1024);
        return sizeMB;
    }, [summaryInfo.bitrate, duration]);

    // Check if File System Access API is supported
    const isFileSystemAccessSupported = typeof window !== 'undefined' && 'showSaveFilePicker' in window;

    // Handle choosing save location using File System Access API
    const handleChooseSaveLocation = async () => {
        if (!isFileSystemAccessSupported) {
            console.warn('[ExportModal] File System Access API not supported');
            return;
        }

        try {
            // Get the appropriate file extension and MIME type
            const formatConfig: Record<string, { extensions: string[], mimeType: string }> = {
                mp4: { extensions: ['.mp4'], mimeType: 'video/mp4' },
                webm: { extensions: ['.webm'], mimeType: 'video/webm' },
                mov: { extensions: ['.mov'], mimeType: 'video/quicktime' },
                mkv: { extensions: ['.mkv'], mimeType: 'video/x-matroska' },
                avi: { extensions: ['.avi'], mimeType: 'video/x-msvideo' },
            };

            const config = formatConfig[settings.format] || formatConfig.mp4;

            const options = {
                suggestedName: `${settings.projectName}.${settings.format}`,
                types: [
                    {
                        description: `${settings.format.toUpperCase()} Video`,
                        accept: { [config.mimeType]: config.extensions },
                    },
                ],
            };

            const handle = await (window as any).showSaveFilePicker(options);
            setFileHandle(handle);

            // Extract the file name for display
            const fileName = handle.name;
            setSaveLocation(fileName);

            console.log('[ExportModal] Save location selected:', fileName);
        } catch (error: any) {
            // User cancelled the picker or an error occurred
            if (error.name !== 'AbortError') {
                console.error('[ExportModal] Error choosing save location:', error);
            }
        }
    };

    // Handle export
    const handleExport = async () => {
        setIsExporting(true);

        try {
            let blob: Blob;

            if (useServerExport && serverAvailable) {
                // Use server-side FFmpeg (faster)
                console.log('[ExportModal] Using server-side export');
                blob = await serverExportService.export({
                    tracks,
                    duration,
                    dimension,
                    settings,
                    onProgress: setProgress
                });
            } else {
                // Use client-side FFmpeg.wasm
                console.log('[ExportModal] Using client-side export');
                blob = await exportEngine.export(tracks, duration, dimension, settings, setProgress);
            }

            // Save to chosen location or fall back to auto-download
            if (fileHandle) {
                // Use File System Access API to write to chosen location
                try {
                    console.log('[ExportModal] Saving to user-selected location...');
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    console.log('[ExportModal] File saved successfully to:', saveLocation);
                } catch (writeError) {
                    console.error('[ExportModal] Failed to write to chosen location, falling back to download:', writeError);
                    // Fall back to download if writing fails
                    triggerDownload(blob);
                }
            } else {
                // Fall back to standard download
                triggerDownload(blob);
            }

            // Close modal after successful export
            setTimeout(() => {
                setIsExporting(false);
                onClose();
            }, 1500);
        } catch (error) {
            console.error('[ExportModal] Export failed:', error);
            setIsExporting(false);
        }
    };

    // Helper function to trigger browser download
    const triggerDownload = (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${settings.projectName}.${settings.format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Check if option is recommended
    const isRecommended = (type: 'resolution' | 'format' | 'encoder', value: string): boolean => {
        if (!showRecommendations || !deviceCapabilities) return true;

        switch (type) {
            case 'resolution':
                return deviceCapabilities.recommendedResolutions.includes(value);
            case 'format':
                return deviceCapabilities.recommendedFormats.includes(value);
            case 'encoder':
                return deviceCapabilities.recommendedEncoders.includes(value);
            default:
                return true;
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm" style={{ zIndex: 50000 }}>
            <div className="relative w-full max-w-2xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl shadow-2xl border border-gray-700/50 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/50 bg-gradient-to-r from-purple-900/20 to-blue-900/20">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-purple-500/20">
                            <Download className="w-5 h-5 text-purple-400" />
                        </div>
                        <h2 className="text-xl font-bold text-white">Export Video</h2>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isExporting}
                        className="p-2 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
                    >
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                    {/* Top Section: Name + Save To */}
                    <div className="space-y-4">
                        {/* Project Name */}
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Project Name</label>
                            <input
                                type="text"
                                value={settings.projectName}
                                onChange={(e) => setSettings({ ...settings, projectName: e.target.value })}
                                disabled={isExporting}
                                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                                placeholder="Enter project name..."
                            />
                        </div>

                        {/* Save To */}
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Save To</label>
                            <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg">
                                <HardDrive className="w-4 h-4 text-gray-500 flex-shrink-0" />
                                <span className="text-sm text-gray-400 flex-1 truncate" title={saveLocation}>
                                    {fileHandle ? saveLocation : 'Downloads folder'}
                                </span>
                                {!fileHandle && (
                                    <span className="text-xs text-purple-400 flex-shrink-0">Auto</span>
                                )}
                                {isFileSystemAccessSupported && (
                                    <button
                                        onClick={handleChooseSaveLocation}
                                        disabled={isExporting}
                                        className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-purple-300 bg-purple-500/20 hover:bg-purple-500/30 rounded-md transition-colors disabled:opacity-50"
                                    >
                                        <FolderOpen className="w-3.5 h-3.5" />
                                        Browse
                                    </button>
                                )}
                                {fileHandle && (
                                    <button
                                        onClick={() => {
                                            setFileHandle(null);
                                            setSaveLocation('Downloads folder');
                                        }}
                                        disabled={isExporting}
                                        className="text-xs text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-50"
                                        title="Reset to auto-download"
                                    >
                                        Reset
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Settings Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        {/* Format */}
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Format</label>
                            <select
                                value={settings.format}
                                onChange={(e) => setSettings({ ...settings, format: e.target.value as 'mp4' | 'webm' | 'mov' | 'mkv' | 'avi' })}
                                disabled={isExporting}
                                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                            >
                                <option value="mp4" style={{ opacity: isRecommended('format', 'mp4') ? 1 : 0.5 }}>
                                    MP4 (H.264) - Best Compatibility {!isRecommended('format', 'mp4') && showRecommendations && '(Not Recommended)'}
                                </option>
                                <option value="webm" style={{ opacity: isRecommended('format', 'webm') ? 1 : 0.5 }}>
                                    WebM (VP9) - Web Optimized {!isRecommended('format', 'webm') && showRecommendations && '(Not Recommended)'}
                                </option>
                                <option value="mov" style={{ opacity: isRecommended('format', 'mov') ? 1 : 0.5 }}>
                                    MOV (H.264) - Apple/Final Cut {!isRecommended('format', 'mov') && showRecommendations && '(Not Recommended)'}
                                </option>
                                <option value="mkv" style={{ opacity: isRecommended('format', 'mkv') ? 1 : 0.5 }}>
                                    MKV (H.264) - High Quality {!isRecommended('format', 'mkv') && showRecommendations && '(Not Recommended)'}
                                </option>
                                <option value="avi" style={{ opacity: isRecommended('format', 'avi') ? 1 : 0.5 }}>
                                    AVI (MPEG-4) - Legacy Support {!isRecommended('format', 'avi') && showRecommendations && '(Not Recommended)'}
                                </option>
                            </select>
                        </div>

                        {/* Resolution */}
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Resolution</label>
                            <select
                                value={settings.resolution.label}
                                onChange={(e) => {
                                    const preset = RESOLUTION_PRESETS.find(r => r.label === e.target.value);
                                    if (preset) {
                                        // Flip dimensions if canvas is portrait (height > width)
                                        const isPortrait = dimension.height > dimension.width;
                                        const width = isPortrait ? preset.height : preset.width;
                                        const height = isPortrait ? preset.width : preset.height;
                                        setSettings({ ...settings, resolution: { width, height, label: preset.label } });
                                    }
                                }}
                                disabled={isExporting}
                                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                            >
                                {RESOLUTION_PRESETS.map((preset) => {
                                    // Flip dimensions for display if canvas is portrait
                                    const isPortrait = dimension.height > dimension.width;
                                    const displayWidth = isPortrait ? preset.height : preset.width;
                                    const displayHeight = isPortrait ? preset.width : preset.height;
                                    return (
                                        <option
                                            key={preset.label}
                                            value={preset.label}
                                            style={{ opacity: isRecommended('resolution', preset.label) ? 1 : 0.5 }}
                                        >
                                            {displayWidth}×{displayHeight} ({preset.label})
                                            {!isRecommended('resolution', preset.label) && showRecommendations && ' (Not Recommended)'}
                                        </option>
                                    );
                                })}
                            </select>
                        </div>

                        {/* Encoder */}
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Encoder</label>
                            <select
                                value={settings.encoder}
                                onChange={(e) => setSettings({ ...settings, encoder: e.target.value as any })}
                                disabled={isExporting}
                                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                            >
                                <option value="auto">Auto (Best for device)</option>
                                <option value="vp9" style={{ opacity: isRecommended('encoder', 'vp9') ? 1 : 0.5 }}>
                                    VP9 {!isRecommended('encoder', 'vp9') && showRecommendations && '(Not Recommended)'}
                                </option>
                                <option value="vp8" style={{ opacity: isRecommended('encoder', 'vp8') ? 1 : 0.5 }}>
                                    VP8 {!isRecommended('encoder', 'vp8') && showRecommendations && '(Not Recommended)'}
                                </option>
                                <option value="h264" style={{ opacity: isRecommended('encoder', 'h264') ? 1 : 0.5 }}>
                                    H.264 {!isRecommended('encoder', 'h264') && showRecommendations && '(Not Recommended)'}
                                </option>
                            </select>
                        </div>

                        {/* Quality */}
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Quality</label>
                            <div className="flex items-center gap-2 p-1 bg-gray-800 border border-gray-700 rounded-lg">
                                {(['low', 'medium', 'high'] as const).map((quality) => (
                                    <button
                                        key={quality}
                                        onClick={() => setSettings({ ...settings, quality })}
                                        disabled={isExporting}
                                        className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${settings.quality === quality
                                            ? 'bg-purple-500 text-white'
                                            : 'text-gray-400 hover:text-white hover:bg-gray-700'
                                            } disabled:opacity-50`}
                                    >
                                        {quality.charAt(0).toUpperCase() + quality.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Dynamic Summary */}
                    <div className="flex items-center justify-center gap-4 px-4 py-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
                        <div className="flex items-center gap-2 text-sm">
                            <Settings className="w-4 h-4 text-purple-400" />
                            <span className="text-gray-300">{summaryInfo.fps} fps</span>
                        </div>
                        <div className="w-px h-4 bg-gray-600" />
                        <div className="flex items-center gap-2 text-sm">
                            <Cpu className="w-4 h-4 text-blue-400" />
                            <span className="text-gray-300">{summaryInfo.bitrate.toLocaleString()} kbps</span>
                        </div>
                        <div className="w-px h-4 bg-gray-600" />
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-gray-300">{summaryInfo.colorSpace}</span>
                        </div>
                    </div>

                    {/* GPU Acceleration + Recommendations */}
                    <div className="space-y-3">
                        {/* GPU Acceleration Toggle */}
                        <div className="flex items-center justify-between px-4 py-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
                            <div className="flex items-center gap-3">
                                <Zap className="w-5 h-5 text-yellow-400" />
                                <div>
                                    <div className="text-sm font-medium text-white">Use GPU Acceleration</div>
                                    <div className="text-xs text-gray-400">
                                        {deviceCapabilities?.isDedicatedGPU
                                            ? `${deviceCapabilities.gpuVendor.toUpperCase()} GPU detected`
                                            : 'Integrated GPU'}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    const newUseGPU = !settings.useGPU;
                                    setSettings({ ...settings, useGPU: newUseGPU });

                                    // Log GPU acceleration status to console
                                    if (newUseGPU) {
                                        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                                        console.log('%c⚡ GPU ACCELERATION ENABLED', 'font-weight: bold; font-size: 14px; color: #00ff00');
                                        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                                        if (deviceCapabilities) {
                                            const gpuType = deviceCapabilities.isDedicatedGPU ? '🎮 DEDICATED' : '💻 INTEGRATED';
                                            const color = deviceCapabilities.isDedicatedGPU ? '#00ff00' : '#ffaa00';
                                            console.log(`%c${gpuType} GPU`, `color: ${color}; font-weight: bold`);
                                            console.log(`%c├─ Vendor: ${deviceCapabilities.gpuVendor?.toUpperCase() || 'Unknown'}`, 'color: #00aaff');
                                            console.log(`%c├─ VRAM: ${deviceCapabilities.vramGB.toFixed(1)} GB`, 'color: #ff00ff');
                                            console.log(`%c├─ Hardware Encode: ${deviceCapabilities.hardwareEncodingAvailable ? '✅ Yes' : '❌ No'}`, 'color: #00aaff');
                                            console.log(`%c└─ Recommended: ${deviceCapabilities.maxResolution.label}`, 'color: #ffaa00');
                                        }
                                        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
                                    } else {
                                        console.log('%c⚡ GPU ACCELERATION DISABLED - Using CPU rendering', 'color: #ff6600; font-weight: bold');
                                    }
                                }}
                                disabled={isExporting}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${settings.useGPU ? 'bg-purple-500' : 'bg-gray-600'
                                    }`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.useGPU ? 'translate-x-6' : 'translate-x-1'
                                    }`} />
                            </button>
                        </div>

                        {/* Server Export Toggle */}
                        <div className={`flex items-center justify-between px-4 py-3 rounded-lg border ${serverAvailable ? 'bg-gradient-to-r from-green-900/30 to-emerald-900/30 border-green-700/50' : 'bg-gray-800/50 border-gray-700/50'}`}>
                            <div className="flex items-center gap-3">
                                <Server className={`w-5 h-5 ${serverAvailable ? 'text-green-400' : 'text-gray-500'}`} />
                                <div>
                                    <div className="text-sm font-medium text-white flex items-center gap-2">
                                        Server-side Export
                                    </div>
                                    <div className="text-xs text-gray-400">
                                        {serverAvailable
                                            ? 'Uses native FFmpeg with hardware acceleration'
                                            : 'Server not available - using browser export'}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => setUseServerExport(!useServerExport)}
                                disabled={isExporting || !serverAvailable}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${useServerExport && serverAvailable ? 'bg-green-500' : 'bg-gray-600'
                                    }`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${useServerExport && serverAvailable ? 'translate-x-6' : 'translate-x-1'
                                    }`} />
                            </button>
                        </div>

                        {/* Server Export Text Warning */}
                        {useServerExport && serverAvailable && (
                            <div className="px-4 py-2 bg-amber-900/20 border border-amber-700/40 rounded-lg">
                                <p className="text-xs text-amber-400">
                                    <span className="font-medium">⚠️ Note:</span> If using text with custom fonts, font combinations, or text effects, turn off server-side export for proper rendering.
                                </p>
                            </div>
                        )}

                        {/* Recommend to Device Toggle */}
                        <div className="flex items-center justify-between px-4 py-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
                            <div className="flex items-center gap-3">
                                <Cpu className="w-5 h-5 text-blue-400" />
                                <div>
                                    <div className="text-sm font-medium text-white">Show Recommended Settings</div>
                                    <div className="text-xs text-gray-400">Highlight best options for your device</div>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowRecommendations(!showRecommendations)}
                                disabled={isExporting}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${showRecommendations ? 'bg-purple-500' : 'bg-gray-600'
                                    }`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showRecommendations ? 'translate-x-6' : 'translate-x-1'
                                    }`} />
                            </button>
                        </div>
                    </div>

                    {/* Duration + Size + Export Button */}
                    <div className="flex items-center justify-between pt-4 border-t border-gray-700/50">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm text-gray-400">
                                <Clock className="w-4 h-4" />
                                <span>Duration: {Math.floor(duration / 60)}:{(duration % 60).toFixed(0).padStart(2, '0')}</span>
                            </div>
                            <div className="text-sm text-gray-400">
                                Estimated size: <span className="text-white font-medium">{estimatedSize.toFixed(1)} MB</span>
                            </div>
                        </div>

                        <button
                            onClick={handleExport}
                            disabled={isExporting || !settings.projectName}
                            className="px-6 py-3 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isExporting ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>Exporting...</span>
                                </>
                            ) : (
                                <>
                                    <Download className="w-5 h-5" />
                                    <span>Export Video</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Progress Overlay */}
                {isExporting && (
                    <div className="absolute inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-10">
                        <div className="bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl border border-gray-700">
                            <div className="text-center space-y-6">
                                {/* Phase */}
                                <div>
                                    <div className="text-xl font-bold text-white mb-2">
                                        {progress.phase === 'preparing' && 'Preparing...'}
                                        {progress.phase === 'rendering' && 'Rendering Frames...'}
                                        {progress.phase === 'encoding' && 'Encoding Video...'}
                                        {progress.phase === 'finalizing' && 'Finalizing...'}
                                        {progress.phase === 'complete' && '✓ Complete!'}
                                        {progress.phase === 'error' && '✗ Error'}
                                    </div>
                                    {progress.error && (
                                        <div className="text-sm text-red-400">{progress.error}</div>
                                    )}
                                </div>

                                {/* Progress Bar */}
                                <div className="space-y-2">
                                    <div className="h-2 bg-gray-900 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300"
                                            style={{ width: `${progress.progress}%` }}
                                        />
                                    </div>
                                    <div className="text-sm text-gray-400">{progress.progress.toFixed(0)}%</div>
                                </div>

                                {/* Frame Counter */}
                                {progress.currentFrame && progress.totalFrames && (
                                    <div className="text-sm text-gray-400">
                                        Frame {progress.currentFrame} / {progress.totalFrames}
                                    </div>
                                )}

                                {/* Time Remaining */}
                                {progress.estimatedTimeRemaining && (
                                    <div className="text-sm text-gray-400">
                                        Estimated time remaining: {progress.estimatedTimeRemaining}s
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ExportModal;
