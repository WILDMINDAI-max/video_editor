/**
 * Project Manager - Handles saving and loading of video editor projects
 * Uses ZIP format with de-duplication for efficient storage
 */

import JSZip from 'jszip';
import {
    WMPVProjectFile,
    WMPVProjectData,
    WMPVFileHeader,
    ProjectUpload,
    CURRENT_VERSION,
    APP_VERSION,
    MAGIC_BYTES,
    FILE_EXTENSION
} from './ProjectTypes';
import { Track, CanvasDimension, TimelineItem } from '@/types';

/**
 * Result of loading a project
 */
export interface LoadProjectResult {
    success: boolean;
    data?: WMPVProjectData;
    error?: string;
    isLegacyFormat?: boolean;
}

/**
 * Media cache entry for de-duplication
 */
interface MediaCacheEntry {
    zipPath: string;
    mimeType: string;
    size: number;
}

/**
 * Project Manager class for handling save/load operations
 * Uses ZIP format with de-duplication
 */
export class ProjectManager {
    /**
     * Check if a URL is a blob URL that needs embedding
     */
    private static isBlobUrl(url: string): boolean {
        return url?.startsWith('blob:') ?? false;
    }

    /**
     * Fetch blob data from URL
     */
    private static async fetchBlob(url: string): Promise<Blob | null> {
        try {
            const response = await fetch(url);
            return await response.blob();
        } catch (error) {
            console.warn(`[ProjectManager] Failed to fetch: ${url}`, error);
            return null;
        }
    }

    /**
     * Get file extension from mime type
     */
    private static getExtension(mimeType: string): string {
        const mimeMap: Record<string, string> = {
            'video/mp4': '.mp4',
            'video/webm': '.webm',
            'video/quicktime': '.mov',
            'audio/mpeg': '.mp3',
            'audio/wav': '.wav',
            'audio/ogg': '.ogg',
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'image/webp': '.webp',
        };
        return mimeMap[mimeType] || '.bin';
    }

    /**
     * Generate a simple hash from blob for de-duplication
     * Uses blob URL as key since same blob URL means same file
     */
    private static getBlobKey(blobUrl: string): string {
        // Blob URLs are unique per file, so we can use them directly as keys
        return blobUrl;
    }

    /**
     * Generate content-based hash for de-duplication
     * Uses size + first 1KB + last 1KB as fingerprint
     */
    private static async generateContentHash(blob: Blob): Promise<string> {
        const size = blob.size;

        // Read first and last 1KB for fingerprint
        const chunkSize = 1024;
        const firstChunk = blob.slice(0, chunkSize);
        const lastChunk = blob.slice(Math.max(0, size - chunkSize), size);

        const firstBytes = await firstChunk.arrayBuffer();
        const lastBytes = await lastChunk.arrayBuffer();

        // Create simple hash from size + first/last bytes
        const firstArr = new Uint8Array(firstBytes);
        const lastArr = new Uint8Array(lastBytes);

        let hash = size.toString(36);
        for (let i = 0; i < Math.min(32, firstArr.length); i++) {
            hash += firstArr[i].toString(16).padStart(2, '0');
        }
        for (let i = 0; i < Math.min(32, lastArr.length); i++) {
            hash += lastArr[i].toString(16).padStart(2, '0');
        }

        return hash;
    }

    /**
     * Process all media (tracks + uploads) with de-duplication
     * Uses size as dedup key since blob content hashing was unreliable
     */
    private static async processAllMediaForSave(
        tracks: Track[],
        uploads: ProjectUpload[],
        zip: JSZip,
        onProgress?: (message: string) => void
    ): Promise<{ tracks: Track[]; uploads: ProjectUpload[] }> {
        // Media cache: size_mimeType -> { zipPath, mimeType, size }
        // Using size + mimeType as key because same files have same size
        const mediaCache = new Map<string, MediaCacheEntry>();
        let mediaIndex = 0;
        let dedupCount = 0;
        let savedBytes = 0;

        // Helper to add media to ZIP (with size-based de-duplication)
        const addMediaToZip = async (
            blobUrl: string,
            prefix: string,
            itemName?: string
        ): Promise<MediaCacheEntry | null> => {
            // Fetch the blob first
            const blob = await this.fetchBlob(blobUrl);
            if (!blob) return null;

            // Use file size + mime type as dedup key
            // Files with exact same size AND type are almost certainly duplicates
            const dedupKey = `${blob.size}_${blob.type}`;

            // Check if same content already exists
            const cached = mediaCache.get(dedupKey);
            if (cached) {
                dedupCount++;
                savedBytes += blob.size;
                console.log(`[ProjectManager] ✓ De-dup: Reusing ${cached.zipPath} for "${itemName || 'media'}" (saved ${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
                return cached;
            }

            // Add to ZIP
            const ext = this.getExtension(blob.type);
            const filename = `${prefix}${mediaIndex}${ext}`;
            zip.file(filename, blob);
            mediaIndex++;

            const entry: MediaCacheEntry = {
                zipPath: filename,
                mimeType: blob.type,
                size: blob.size
            };
            mediaCache.set(dedupKey, entry);

            console.log(`[ProjectManager] Added to ZIP: ${filename} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
            return entry;
        };

        // Process tracks
        const processedTracks: Track[] = [];
        for (const track of tracks) {
            const processedItems: TimelineItem[] = [];

            for (const item of track.items) {
                const processedItem = { ...item } as any;

                // Process src
                if (item.src && this.isBlobUrl(item.src)) {
                    onProgress?.(`Processing: ${item.name || 'media'}`);
                    const entry = await addMediaToZip(item.src, 'media/', item.name);
                    if (entry) {
                        processedItem._mediaRef = entry.zipPath;
                        processedItem._mimeType = entry.mimeType;
                        processedItem.src = `zip://${entry.zipPath}`;
                    }
                }

                // Process thumbnail
                if (item.thumbnail && this.isBlobUrl(item.thumbnail)) {
                    const entry = await addMediaToZip(item.thumbnail, 'thumbs/', `${item.name}_thumb`);
                    if (entry) {
                        processedItem._thumbRef = entry.zipPath;
                        processedItem.thumbnail = `zip://${entry.zipPath}`;
                    }
                }

                processedItems.push(processedItem);
            }

            processedTracks.push({ ...track, items: processedItems });
        }

        // Process uploads (will reuse from cache if already added)
        const processedUploads: ProjectUpload[] = [];
        for (const upload of uploads) {
            const processedUpload = { ...upload } as any;

            // Process src
            if (upload.src && this.isBlobUrl(upload.src)) {
                onProgress?.(`Processing upload: ${upload.name}`);
                const entry = await addMediaToZip(upload.src, 'media/', upload.name);
                if (entry) {
                    processedUpload._mediaRef = entry.zipPath;
                    processedUpload._mimeType = entry.mimeType;
                    processedUpload.src = `zip://${entry.zipPath}`;
                }
            }

            // Process thumbnail
            if (upload.thumbnail && this.isBlobUrl(upload.thumbnail)) {
                const entry = await addMediaToZip(upload.thumbnail, 'thumbs/');
                if (entry) {
                    processedUpload._thumbRef = entry.zipPath;
                    processedUpload.thumbnail = `zip://${entry.zipPath}`;
                }
            }

            processedUploads.push(processedUpload);
        }

        // Log de-duplication stats
        const totalFiles = mediaIndex;
        const totalCacheHits = [...mediaCache.values()].length;
        console.log(`[ProjectManager] De-duplication: ${totalFiles} unique files stored`);

        return { tracks: processedTracks, uploads: processedUploads };
    }

    /**
     * Restore tracks from ZIP references
     */
    private static async processTracksForLoad(tracks: Track[], zip: JSZip): Promise<Track[]> {
        const restoredTracks: Track[] = [];
        const blobCache = new Map<string, string>(); // zipPath -> blobUrl

        for (const track of tracks) {
            const restoredItems: TimelineItem[] = [];

            for (const item of track.items) {
                const restoredItem = { ...item } as any;

                // Restore src from ZIP
                const mediaRef = restoredItem._mediaRef ||
                    (restoredItem.src?.startsWith('zip://') ? restoredItem.src.replace('zip://', '') : null);

                if (mediaRef) {
                    // Check cache first
                    if (blobCache.has(mediaRef)) {
                        restoredItem.src = blobCache.get(mediaRef);
                    } else {
                        const file = zip.file(mediaRef);
                        if (file) {
                            const blob = await file.async('blob');
                            const typedBlob = new Blob([blob], {
                                type: restoredItem._mimeType || 'application/octet-stream'
                            });
                            const blobUrl = URL.createObjectURL(typedBlob);
                            blobCache.set(mediaRef, blobUrl);
                            restoredItem.src = blobUrl;
                        }
                    }
                    delete restoredItem._mediaRef;
                    delete restoredItem._mimeType;
                }

                // Restore thumbnail from ZIP
                const thumbRef = restoredItem._thumbRef ||
                    (restoredItem.thumbnail?.startsWith('zip://') ? restoredItem.thumbnail.replace('zip://', '') : null);

                if (thumbRef) {
                    if (blobCache.has(thumbRef)) {
                        restoredItem.thumbnail = blobCache.get(thumbRef);
                    } else {
                        const file = zip.file(thumbRef);
                        if (file) {
                            const blob = await file.async('blob');
                            const blobUrl = URL.createObjectURL(blob);
                            blobCache.set(thumbRef, blobUrl);
                            restoredItem.thumbnail = blobUrl;
                        }
                    }
                    delete restoredItem._thumbRef;
                }

                restoredItems.push(restoredItem);
            }

            restoredTracks.push({ ...track, items: restoredItems });
        }

        return restoredTracks;
    }

    /**
     * Restore uploads from ZIP references
     */
    private static async processUploadsForLoad(
        uploads: ProjectUpload[],
        zip: JSZip,
        blobCache: Map<string, string>
    ): Promise<ProjectUpload[]> {
        const restoredUploads: ProjectUpload[] = [];

        for (const upload of uploads) {
            const restoredUpload = { ...upload } as any;

            // Restore src from ZIP
            const mediaRef = restoredUpload._mediaRef ||
                (restoredUpload.src?.startsWith('zip://') ? restoredUpload.src.replace('zip://', '') : null);

            if (mediaRef) {
                if (blobCache.has(mediaRef)) {
                    restoredUpload.src = blobCache.get(mediaRef);
                } else {
                    const file = zip.file(mediaRef);
                    if (file) {
                        const blob = await file.async('blob');
                        const typedBlob = new Blob([blob], {
                            type: restoredUpload._mimeType || 'application/octet-stream'
                        });
                        const blobUrl = URL.createObjectURL(typedBlob);
                        blobCache.set(mediaRef, blobUrl);
                        restoredUpload.src = blobUrl;
                    }
                }
                delete restoredUpload._mediaRef;
                delete restoredUpload._mimeType;
            }

            // Restore thumbnail from ZIP
            const thumbRef = restoredUpload._thumbRef ||
                (restoredUpload.thumbnail?.startsWith('zip://') ? restoredUpload.thumbnail.replace('zip://', '') : null);

            if (thumbRef) {
                if (blobCache.has(thumbRef)) {
                    restoredUpload.thumbnail = blobCache.get(thumbRef);
                } else {
                    const file = zip.file(thumbRef);
                    if (file) {
                        const blob = await file.async('blob');
                        const blobUrl = URL.createObjectURL(blob);
                        blobCache.set(thumbRef, blobUrl);
                        restoredUpload.thumbnail = blobUrl;
                    }
                }
                delete restoredUpload._thumbRef;
            }

            restoredUploads.push(restoredUpload);
        }

        return restoredUploads;
    }

    /**
     * Create a new project file with header and data
     */
    static createProjectFile(
        projectName: string,
        dimension: CanvasDimension,
        currentTime: number,
        tracks: Track[],
        uploads: ProjectUpload[],
        existingCreatedAt?: string
    ): WMPVProjectFile {
        const now = new Date().toISOString();

        const header: WMPVFileHeader = {
            magic: MAGIC_BYTES as 'WMPV',
            version: CURRENT_VERSION,
            createdAt: existingCreatedAt || now,
            modifiedAt: now,
            appVersion: APP_VERSION
        };

        const project: WMPVProjectData = {
            name: projectName,
            dimension,
            currentTime,
            tracks,
            uploads
        };

        return { header, project };
    }

    /**
     * Save project to a downloadable ZIP file with de-duplication
     */
    static async saveProject(
        projectName: string,
        dimension: CanvasDimension,
        currentTime: number,
        tracks: Track[],
        uploads: ProjectUpload[],
        onProgress?: (message: string) => void
    ): Promise<void> {
        const zip = new JSZip();

        onProgress?.('Processing media files (with de-duplication)...');

        // Process all media with de-duplication
        const { tracks: processedTracks, uploads: processedUploads } =
            await this.processAllMediaForSave(tracks, uploads, zip, onProgress);

        onProgress?.('Creating project metadata...');

        // Create project file
        const projectFile = this.createProjectFile(
            projectName,
            dimension,
            currentTime,
            processedTracks,
            processedUploads
        );

        // Add project.json to ZIP
        zip.file('project.json', JSON.stringify(projectFile, null, 2));

        onProgress?.('Generating ZIP file...');

        // Generate ZIP
        const zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        }, (metadata) => {
            onProgress?.(`Compressing: ${metadata.percent.toFixed(0)}%`);
        });

        // Download
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        const sanitizedName = projectName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() || 'Untitled';
        a.download = `${sanitizedName}${FILE_EXTENSION}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        const sizeMB = (zipBlob.size / (1024 * 1024)).toFixed(2);
        console.log(`[ProjectManager] Project saved: ${sizeMB} MB (ZIP with de-duplication)`);
    }

    /**
     * Validate project file format
     */
    static validateProjectFile(data: unknown): { valid: boolean; error?: string } {
        if (!data || typeof data !== 'object') {
            return { valid: false, error: 'Invalid file: Not a valid JSON object' };
        }

        const obj = data as Record<string, unknown>;

        if (obj.header && obj.project) {
            const header = obj.header as Record<string, unknown>;
            if (header.magic !== MAGIC_BYTES) {
                return { valid: false, error: 'Invalid file: Not a WildMind project file' };
            }
            return { valid: true };
        }

        if (obj.tracks && obj.dimension) {
            return { valid: true };
        }

        return { valid: false, error: 'Invalid file: Missing required project data' };
    }

    /**
     * Load project from ZIP file
     */
    static async loadProjectFromZip(file: File): Promise<LoadProjectResult> {
        try {
            const zip = await JSZip.loadAsync(file);

            const projectJsonFile = zip.file('project.json');
            if (!projectJsonFile) {
                return { success: false, error: 'Invalid project file: Missing project.json' };
            }

            const projectJsonText = await projectJsonFile.async('text');
            const data = JSON.parse(projectJsonText);

            const validation = this.validateProjectFile(data);
            if (!validation.valid) {
                return { success: false, error: validation.error };
            }

            // Shared blob cache for de-duplication on load
            const blobCache = new Map<string, string>();

            if (data.header && data.project) {
                const projectFile = data as WMPVProjectFile;

                const restoredTracks = await this.processTracksForLoad(projectFile.project.tracks, zip);

                // Build cache from tracks first
                for (const track of restoredTracks) {
                    for (const item of track.items) {
                        if (item.src && !item.src.startsWith('blob:')) continue;
                        // Cache is already built in processTracksForLoad
                    }
                }

                const restoredUploads = await this.processUploadsForLoad(
                    projectFile.project.uploads || [],
                    zip,
                    blobCache
                );

                return {
                    success: true,
                    data: {
                        ...projectFile.project,
                        tracks: restoredTracks,
                        uploads: restoredUploads
                    }
                };
            }

            if (data.tracks && data.dimension) {
                const restoredTracks = await this.processTracksForLoad(data.tracks, zip);
                const restoredUploads = await this.processUploadsForLoad(data.uploads || [], zip, blobCache);

                return {
                    success: true,
                    data: {
                        name: data.projectName || 'Untitled Project',
                        dimension: data.dimension,
                        currentTime: data.currentTime || 0,
                        tracks: restoredTracks,
                        uploads: restoredUploads
                    },
                    isLegacyFormat: true
                };
            }

            return { success: false, error: 'Unable to parse project file' };
        } catch (error) {
            return {
                success: false,
                error: `Failed to load project: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    /**
     * Load project from file content (legacy JSON support)
     */
    static loadProject(fileContent: string): LoadProjectResult {
        try {
            const data = JSON.parse(fileContent);

            const validation = this.validateProjectFile(data);
            if (!validation.valid) {
                return { success: false, error: validation.error };
            }

            if (data.header && data.project) {
                const projectFile = data as WMPVProjectFile;
                return { success: true, data: projectFile.project };
            }

            if (data.tracks && data.dimension) {
                return {
                    success: true,
                    data: {
                        name: data.projectName || 'Untitled Project',
                        dimension: data.dimension,
                        currentTime: data.currentTime || 0,
                        tracks: data.tracks,
                        uploads: data.uploads || []
                    },
                    isLegacyFormat: true
                };
            }

            return { success: false, error: 'Unable to parse project file' };
        } catch (error) {
            return {
                success: false,
                error: `Failed to parse: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    /**
     * Read file and return its content
     */
    static readFile(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const result = event.target?.result;
                if (typeof result === 'string') {
                    resolve(result);
                } else {
                    reject(new Error('Failed to read file content'));
                }
            };
            reader.onerror = () => reject(new Error('File read error'));
            reader.readAsText(file);
        });
    }

    /**
     * Open file dialog and load project
     */
    static openFileDialog(): Promise<File | null> {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = `${FILE_EXTENSION},.json,.zip`;
            input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                resolve(file || null);
            };
            input.click();
        });
    }
}
