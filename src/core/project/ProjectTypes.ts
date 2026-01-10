/**
 * WildMind Project Video (.wmpv) File Format Types
 * 
 * This file defines the structure for saving and loading video editor projects.
 */

import { Track, CanvasDimension } from '@/types';

/**
 * Upload item stored in project
 */
export interface ProjectUpload {
    id: string;
    type: 'image' | 'video' | 'audio';
    src: string;
    name: string;
    thumbnail?: string;
    duration?: string;
}

/**
 * File header with magic bytes and metadata
 */
export interface WMPVFileHeader {
    /** Magic bytes for file identification */
    magic: 'WMPV';
    /** File format version */
    version: string;
    /** Date the project was created */
    createdAt: string;
    /** Date the project was last modified */
    modifiedAt: string;
    /** Application version that created this file */
    appVersion: string;
}

/**
 * Complete project data
 */
export interface WMPVProjectData {
    /** Project name */
    name: string;
    /** Canvas dimensions */
    dimension: CanvasDimension;
    /** Current playhead position in seconds */
    currentTime: number;
    /** All timeline tracks with their items */
    tracks: Track[];
    /** User-uploaded media files */
    uploads: ProjectUpload[];
}

/**
 * Complete project file structure
 */
export interface WMPVProjectFile {
    header: WMPVFileHeader;
    project: WMPVProjectData;
}

/**
 * Current file format version
 */
export const CURRENT_VERSION = '1.0.0';

/**
 * Application version
 */
export const APP_VERSION = '1.0.0';

/**
 * Magic bytes for file validation
 */
export const MAGIC_BYTES = 'WMPV';

/**
 * File extension
 */
export const FILE_EXTENSION = '.wmpv';
