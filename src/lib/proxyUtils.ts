/**
 * Utility functions for using API Gateway proxy routes
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api-gateway-services-wildmind.onrender.com';

/**
 * Extract storage path from Zata URL
 * @param url - Zata URL (e.g., https://idr01.zata.ai/devstoragev1/canvas/project-123/image.jpg)
 * @returns Storage path (e.g., canvas/project-123/image.jpg)
 */
export function extractZataPath(url: string): string | null {
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(Boolean);

        // Find bucket name (usually 'devstoragev1' or 'canvas')
        const bucketIndex = pathParts.findIndex(p =>
            p === 'devstoragev1' ||
            p === 'canvas' ||
            p.startsWith('canvas/')
        );

        if (bucketIndex >= 0) {
            // Return path after bucket name
            return pathParts.slice(bucketIndex + 1).join('/');
        }

        // If no bucket found, return path without first segment
        return pathParts.slice(1).join('/') || null;
    } catch {
        return null;
    }
}

/**
 * Build proxy download URL
 * @param resourceUrl - Original resource URL (Zata URL or external URL)
 * @returns Proxy download URL
 */
export function buildProxyDownloadUrl(resourceUrl: string): string {
    // Check if it's a Zata URL
    if (resourceUrl.includes('zata.ai') || resourceUrl.includes('zata')) {
        const zataPath = extractZataPath(resourceUrl);
        if (zataPath) {
            return `${API_BASE_URL}/api/proxy/download/${encodeURIComponent(zataPath)}`;
        }
    }

    // For external URLs, use the full URL as the path
    return `${API_BASE_URL}/api/proxy/download/${encodeURIComponent(resourceUrl)}`;
}

/**
 * Build proxy resource URL (for viewing, not downloading)
 * @param resourceUrl - Original resource URL
 * @returns Proxy resource URL
 */
export function buildProxyResourceUrl(resourceUrl: string): string {
    // Check if it's a Zata URL
    if (resourceUrl.includes('zata.ai') || resourceUrl.includes('zata')) {
        const zataPath = extractZataPath(resourceUrl);
        if (zataPath) {
            return `${API_BASE_URL}/api/proxy/resource/${encodeURIComponent(zataPath)}`;
        }
    }

    // For external URLs, use the full URL as the path
    return `${API_BASE_URL}/api/proxy/resource/${encodeURIComponent(resourceUrl)}`;
}

/**
 * Build proxy media URL (for media streaming)
 * @param resourceUrl - Original resource URL
 * @returns Proxy media URL
 */
export function buildProxyMediaUrl(resourceUrl: string): string {
    // Check if it's a Zata URL
    if (resourceUrl.includes('zata.ai') || resourceUrl.includes('zata')) {
        const zataPath = extractZataPath(resourceUrl);
        if (zataPath) {
            return `${API_BASE_URL}/api/proxy/media/${encodeURIComponent(zataPath)}`;
        }
    }

    // For external URLs, use the full URL as the path
    return `${API_BASE_URL}/api/proxy/media/${encodeURIComponent(resourceUrl)}`;
}

/**
 * Build proxy thumbnail URL
 * @param resourceUrl - Original resource URL
 * @param width - Thumbnail width (default: 512)
 * @param quality - Thumbnail quality 10-95 (default: 60)
 * @param format - Output format: 'webp' | 'avif' | 'auto' (default: 'auto')
 * @returns Proxy thumbnail URL
 */
export function buildProxyThumbnailUrl(
    resourceUrl: string,
    width: number = 512,
    quality: number = 60,
    format: 'webp' | 'avif' | 'auto' = 'auto'
): string {
    const zataPath = extractZataPath(resourceUrl);
    if (!zataPath) {
        // For external URLs, can't generate thumbnails
        return resourceUrl;
    }

    const params = new URLSearchParams({
        w: String(Math.max(16, Math.min(4096, width))),
        q: String(Math.max(10, Math.min(95, quality))),
        fmt: format,
    });

    return `${API_BASE_URL}/api/proxy/thumb/${encodeURIComponent(zataPath)}?${params.toString()}`;
}
