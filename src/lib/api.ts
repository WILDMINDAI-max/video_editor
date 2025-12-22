import { getCachedRequest, setCachedRequest } from './apiCache';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
const API_GATEWAY_URL = `${API_BASE_URL}/api`;

/**
 * Get Bearer token for authentication (fallback when cookies don't work)
 * Shared helper function for all canvas API calls
 */
async function getBearerTokenForCanvas(): Promise<string | null> {
    try {
        if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
            return null;
        }

        // Check URL hash first (token passed from parent window)
        try {
            const hash = window.location.hash;
            const authTokenMatch = hash.match(/authToken=([^&]+)/);
            if (authTokenMatch) {
                const passedToken = decodeURIComponent(authTokenMatch[1]);
                if (passedToken && passedToken.startsWith('eyJ')) {
                    // Store it for future use
                    try {
                        localStorage.setItem('authToken', passedToken);
                    } catch { }
                    return passedToken;
                }
            }
        } catch { }

        // Try localStorage
        const storedToken = localStorage.getItem('authToken');
        if (storedToken && storedToken.startsWith('eyJ')) {
            return storedToken;
        }

        // Try user object
        const userString = localStorage.getItem('user');
        if (userString) {
            try {
                const userObj = JSON.parse(userString);
                const token = userObj?.idToken || userObj?.token || null;
                if (token && token.startsWith('eyJ')) {
                    return token;
                }
            } catch { }
        }

        // Try idToken directly
        const idToken = localStorage.getItem('idToken');
        if (idToken && idToken.startsWith('eyJ')) {
            return idToken;
        }

        return null;
    } catch (error) {
        console.warn('[getBearerTokenForCanvas] Error getting token:', error);
        return null;
    }
}

export interface ImageGenerationRequest {
    prompt: string;
    model: string;
    aspectRatio: string;
    num_images?: number;
}

export interface ImageGenerationResponse {
    responseStatus: 'success' | 'error';
    message: string;
    data: {
        images: Array<{
            url: string;
            originalUrl: string;
            id: string;
        }>;
        historyId?: string;
    };
}

/**
 * Generate image using FAL API (Google Nano Banana, Seedream v4)
 */
export async function generateImageFAL(
    prompt: string,
    model: string,
    aspectRatio: string,
    token?: string
): Promise<ImageGenerationResponse> {
    // Map frontend model names to backend model names
    let backendModel = model.toLowerCase();
    if (backendModel.includes('google nano banana') || backendModel.includes('nano banana')) {
        backendModel = 'gemini-25-flash-image';
    } else if (backendModel.includes('seedream') && backendModel.includes('4k')) {
        backendModel = 'seedream-v4';
    } else if (backendModel.includes('seedream')) {
        backendModel = 'seedream-v4';
    }

    const headers: HeadersInit = {
        'Content-Type': 'application/json',
    };

    // Add Authorization header if token is provided
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_GATEWAY_URL}/fal/generate`, {
        method: 'POST',
        headers,
        credentials: 'include', // This will automatically send cookies if they exist
        body: JSON.stringify({
            prompt,
            model: backendModel,
            aspect_ratio: aspectRatio,
            num_images: 1,
        }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to generate image' }));
        throw new Error(error.message || 'Failed to generate image');
    }

    return response.json();
}

/**
 * Generate image using BFL API (Flux models)
 */
export async function generateImageBFL(
    prompt: string,
    model: string,
    aspectRatio: string,
    token?: string
): Promise<ImageGenerationResponse> {
    // Map frontend model names to backend model names
    let backendModel = model.toLowerCase().replace(/\s+/g, '-');
    if (backendModel.includes('flux-kontext-max')) {
        backendModel = 'flux-kontext-max';
    } else if (backendModel.includes('flux-kontext-pro')) {
        backendModel = 'flux-kontext-pro';
    }

    const headers: HeadersInit = {
        'Content-Type': 'application/json',
    };

    // Add Authorization header if token is provided
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_GATEWAY_URL}/bfl/generate`, {
        method: 'POST',
        headers,
        credentials: 'include', // This will automatically send cookies if they exist
        body: JSON.stringify({
            prompt,
            model: backendModel,
            frameSize: aspectRatio,
            n: 1,
        }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to generate image' }));
        throw new Error(error.message || 'Failed to generate image');
    }

    return response.json();
}

/**
 * Generate image using Replicate API (Seedream v4 alternative)
 */
export async function generateImageReplicate(
    prompt: string,
    model: string,
    aspectRatio: string,
    token?: string
): Promise<ImageGenerationResponse> {
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
    };

    // Add Authorization header if token is provided
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_GATEWAY_URL}/replicate/generate`, {
        method: 'POST',
        headers,
        credentials: 'include', // This will automatically send cookies if they exist
        body: JSON.stringify({
            prompt,
            model: 'bytedance/seedream-4',
            aspect_ratio: aspectRatio,
            size: '4K',
            max_images: 1,
        }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to generate image' }));
        throw new Error(error.message || 'Failed to generate image');
    }

    return response.json();
}

/**
 * Main function to generate image - routes to appropriate API based on model
 */
export async function generateImage(
    prompt: string,
    model: string,
    aspectRatio: string,
    token?: string
): Promise<string> {
    const modelLower = model.toLowerCase();

    // Determine which API to use based on model
    let response: ImageGenerationResponse;

    if (modelLower.includes('flux')) {
        // Use BFL API for Flux models
        response = await generateImageBFL(prompt, model, aspectRatio, token);
    } else if (modelLower.includes('seedream') && modelLower.includes('4k')) {
        // Use Replicate API for Seedream 4K
        response = await generateImageReplicate(prompt, model, aspectRatio, token);
    } else {
        // Use FAL API for Google Nano Banana and Seedream v4
        response = await generateImageFAL(prompt, model, aspectRatio, token);
    }

    if (response.responseStatus === 'error') {
        throw new Error(response.message || 'Failed to generate image');
    }

    // Handle different response structures
    if (response.data) {
        // FAL and BFL return { images: [...] }
        if (response.data.images && Array.isArray(response.data.images) && response.data.images.length > 0) {
            return response.data.images[0].url || response.data.images[0].originalUrl;
        }
    }

    throw new Error('No image URL returned from API');
}

/**
 * Generate image for Canvas using the Canvas-specific endpoint
 * This endpoint automatically uploads to Zata and creates media records
 */
export async function generateImageForCanvas(
    prompt: string,
    model: string,
    aspectRatio: string,
    projectId: string,
    width?: number,
    height?: number,
    imageCount?: number,
    sourceImageUrl?: string,
    sceneNumber?: number,
    previousSceneImageUrl?: string,
    storyboardMetadata?: Record<string, string>
): Promise<{ mediaId: string; url: string; storagePath: string; generationId?: string; images?: Array<{ mediaId: string; url: string; storagePath: string }> }> {
    // Create AbortController for timeout
    // Increased to 10 minutes for image-to-image generation which can take longer
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minute timeout (600 seconds)

    // Get Bearer token for authentication (fallback when cookies don't work)
    const bearerToken = await getBearerTokenForCanvas();

    if (!bearerToken) {
        console.warn('[generateImageForCanvas] ⚠️ No Bearer token found in localStorage - request will rely on cookies only');
    }

    // Helper function to convert blob URLs to data URIs
    const convertBlobUrlToDataUri = async (blobUrl: string): Promise<string> => {
        try {
            const response = await fetch(blobUrl);
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            console.error('[generateImageForCanvas] Failed to convert blob URL to data URI:', error);
            throw new Error('Failed to convert blob URL to data URI. Please try again.');
        }
    };

    // Convert blob URLs to data URIs before sending to backend
    let processedSourceImageUrl = sourceImageUrl;
    if (sourceImageUrl && sourceImageUrl.startsWith('blob:')) {
        console.log('[generateImageForCanvas] Converting blob URL to data URI:', sourceImageUrl.substring(0, 50));
        try {
            // Handle comma-separated blob URLs
            const urls = sourceImageUrl.split(',').map(url => url.trim());
            const convertedUrls = await Promise.all(
                urls.map(url => url.startsWith('blob:') ? convertBlobUrlToDataUri(url) : url)
            );
            processedSourceImageUrl = convertedUrls.join(',');
            console.log('[generateImageForCanvas] ✅ Successfully converted blob URL(s) to data URI(s)');
        } catch (error: any) {
            console.error('[generateImageForCanvas] ❌ Failed to convert blob URL:', error);
            throw new Error('Failed to process image URL. Please try again or use a different image.');
        }
    }

    let processedPreviousSceneImageUrl = previousSceneImageUrl;
    if (previousSceneImageUrl && previousSceneImageUrl.startsWith('blob:')) {
        console.log('[generateImageForCanvas] Converting previous scene blob URL to data URI');
        try {
            processedPreviousSceneImageUrl = await convertBlobUrlToDataUri(previousSceneImageUrl);
            console.log('[generateImageForCanvas] ✅ Successfully converted previous scene blob URL to data URI');
        } catch (error: any) {
            console.error('[generateImageForCanvas] ❌ Failed to convert previous scene blob URL:', error);
            throw new Error('Failed to process previous scene image URL. Please try again.');
        }
    }

    try {
        const requestBody = {
            prompt,
            model,
            width,
            height,
            aspectRatio, // Pass aspectRatio for proper model mapping
            imageCount, // Pass imageCount to generate multiple images
            sourceImageUrl: processedSourceImageUrl, // Use processed URL (data URI instead of blob URL)
            sceneNumber, // Scene number for storyboard generation
            previousSceneImageUrl: processedPreviousSceneImageUrl, // Use processed URL (data URI instead of blob URL)
            storyboardMetadata, // Metadata for storyboard (character, background, etc.)
            meta: {
                source: 'canvas',
                projectId,
            },
        };

        // Build headers with Bearer token if available
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
        };

        if (bearerToken) {
            headers['Authorization'] = `Bearer ${bearerToken}`;
            console.log('[generateImageForCanvas] Using Bearer token authentication');
        }

        console.log('[generateImageForCanvas] 📤 STEP 6: Sending request to backend:', {
            url: `${API_GATEWAY_URL}/canvas/generate`,
            hasBearerToken: !!bearerToken,
            requestBody: {
                ...requestBody,
                sourceImageUrl: sourceImageUrl || 'NONE',
                sourceImageUrlFull: sourceImageUrl,
                previousSceneImageUrl: previousSceneImageUrl || 'NONE',
                previousSceneImageUrlFull: previousSceneImageUrl,
                prompt: prompt.substring(0, 100) + '...',
            },
        });

        const response = await fetch(`${API_GATEWAY_URL}/canvas/generate`, {
            method: 'POST',
            credentials: 'include', // Include cookies (app_session) - works across subdomains if domain=.wildmindai.com
            headers,
            signal: controller.signal,
            body: JSON.stringify(requestBody),
        });

        clearTimeout(timeoutId);

        // Handle empty response
        if (!response || response.status === 0) {
            throw new Error('Empty response from server. Please check if the API Gateway is running.');
        }

        // Try to parse response, handle empty body
        let result;
        const contentType = response.headers.get('content-type') || '';
        const text = await response.text();

        if (!text || text.trim() === '') {
            throw new Error('Empty response body from server');
        }

        if (contentType.includes('application/json')) {
            try {
                result = JSON.parse(text);
            } catch (parseError: any) {
                // If parsing fails, try to get more info
                if (parseError instanceof SyntaxError) {
                    throw new Error(`Invalid JSON response from server. Status: ${response.status}. Response: ${text.substring(0, 200)}`);
                }
                throw new Error(`Failed to parse response: ${parseError.message}`);
            }
        } else {
            // Non-JSON response - include it in error
            throw new Error(`Unexpected content type: ${contentType || 'unknown'}. Response: ${text.substring(0, 200)}`);
        }

        if (!response.ok) {
            const errorMessage = result?.message || result?.error || `HTTP ${response.status}: ${response.statusText}`;
            throw new Error(errorMessage || 'Failed to generate image');
        }

        // Handle API Gateway response format
        if (result.responseStatus === 'error') {
            throw new Error(result.message || 'Failed to generate image');
        }

        // Trigger credit refresh event
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('refresh-credits'));
        }

        // Return the data object directly (contains mediaId, url, storagePath, generationId)
        return result.data || result;
    } catch (error: any) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
            throw new Error('Request timeout. Image generation is taking longer than expected (10 minutes). This may happen with complex image-to-image generation. Please try again or use a simpler prompt.');
        }

        if (error.message) {
            throw error;
        }

        throw new Error('Failed to generate image. Please check your connection and try again.');
    }
}

/**
 * Generate video for Canvas using Seedance 1.0 Pro
 * Returns taskId for polling the result
 */
export async function generateVideoForCanvas(
    prompt: string,
    model: string,
    aspectRatio: string,
    projectId: string,
    duration?: number,
    resolution?: string,
    firstFrameUrl?: string,
    lastFrameUrl?: string
): Promise<{ mediaId?: string; url?: string; storagePath?: string; generationId?: string; taskId?: string; provider?: string }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

    // Get Bearer token for authentication (fallback when cookies don't work)
    const bearerToken = await getBearerTokenForCanvas();

    if (!bearerToken) {
        console.warn('[generateVideoForCanvas] ⚠️ No Bearer token found in localStorage - request will rely on cookies only');
    }

    try {
        // Build headers with Bearer token if available
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
        };

        if (bearerToken) {
            headers['Authorization'] = `Bearer ${bearerToken}`;
            console.log('[generateVideoForCanvas] Using Bearer token authentication');
        }

        const response = await fetch(`${API_GATEWAY_URL}/canvas/generate-video`, {
            method: 'POST',
            credentials: 'include',
            headers,
            signal: controller.signal,
            body: JSON.stringify({
                prompt,
                model,
                aspectRatio,
                duration: duration || 5,
                resolution: resolution || '1080p',
                firstFrameUrl,
                lastFrameUrl,
                meta: {
                    source: 'canvas',
                    projectId,
                },
            }),
        });

        clearTimeout(timeoutId);

        if (!response || response.status === 0) {
            throw new Error('Empty response from server. Please check if the API Gateway is running.');
        }

        let result;
        const contentType = response.headers.get('content-type') || '';
        const text = await response.text();

        if (!text || text.trim() === '') {
            throw new Error('Empty response body from server');
        }

        if (contentType.includes('application/json')) {
            try {
                result = JSON.parse(text);
            } catch (parseError: any) {
                if (parseError instanceof SyntaxError) {
                    throw new Error(`Invalid JSON response from server. Status: ${response.status}. Response: ${text.substring(0, 200)}`);
                }
                throw new Error(`Failed to parse response: ${parseError.message}`);
            }
        } else {
            throw new Error(`Unexpected content type: ${contentType || 'unknown'}. Response: ${text.substring(0, 200)}`);
        }

        if (!response.ok) {
            const errorMessage = result?.message || result?.error || `HTTP ${response.status}: ${response.statusText}`;
            throw new Error(errorMessage || 'Failed to generate video');
        }

        if (result.responseStatus === 'error') {
            throw new Error(result.message || 'Failed to generate video');
        }

        return result.data || result;
    } catch (error: any) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
            throw new Error('Request timeout. Video generation is taking too long. Please try again.');
        }

        if (error.message) {
            throw error;
        }

        throw new Error('Failed to generate video. Please check your connection and try again.');
    }
}

/**
 * Upscale image for Canvas
 */
export async function upscaleImageForCanvas(
    image: string,
    model: string,
    scale: number,
    projectId: string
): Promise<{ url: string; storagePath: string; mediaId?: string; generationId?: string }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

    try {
        const response = await fetch(`${API_GATEWAY_URL}/canvas/upscale`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
            signal: controller.signal,
            body: JSON.stringify({
                image,
                model,
                scale,
                meta: {
                    source: 'canvas',
                    projectId,
                },
            }),
        });

        clearTimeout(timeoutId);

        const contentType = response.headers.get('content-type') || '';
        let text: string;
        let result: any;

        try {
            text = await response.text();
        } catch (readError: any) {
            throw new Error(`Failed to read response: ${readError.message}`);
        }

        if (contentType.includes('application/json')) {
            try {
                result = JSON.parse(text);
            } catch (parseError: any) {
                if (parseError instanceof SyntaxError) {
                    throw new Error(`Invalid JSON response from server. Status: ${response.status}. Response: ${text.substring(0, 200)}`);
                }
                throw new Error(`Failed to parse response: ${parseError.message}`);
            }
        } else {
            throw new Error(`Unexpected content type: ${contentType || 'unknown'}. Response: ${text.substring(0, 200)}`);
        }

        if (!response.ok) {
            const errorMessage = result?.message || result?.error || `HTTP ${response.status}: ${response.statusText}`;
            throw new Error(errorMessage || 'Failed to upscale image');
        }

        if (result.responseStatus === 'error') {
            throw new Error(result.message || 'Failed to upscale image');
        }

        return result.data || result;
    } catch (error: any) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
            throw new Error('Request timeout. Image upscaling is taking too long. Please try again.');
        }

        if (error.message) {
            throw error;
        }

        throw new Error('Failed to upscale image. Please check your connection and try again.');
    }
}

/**
 * Vectorize image for Canvas
 */
export async function vectorizeImageForCanvas(
    image: string,
    projectId: string,
    mode?: string
): Promise<{ url: string; storagePath: string; mediaId?: string; generationId?: string }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

    try {
        const response = await fetch(`${API_GATEWAY_URL}/canvas/vectorize`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
            signal: controller.signal,
            body: JSON.stringify({
                image,
                mode: mode || 'simple',
                meta: {
                    source: 'canvas',
                    projectId,
                },
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Vectorize failed: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        return {
            url: data.data?.url || data.url || '',
            storagePath: data.data?.storagePath || '',
            mediaId: data.data?.mediaId,
            generationId: data.data?.generationId,
        };
    } finally {
        clearTimeout(timeoutId);
    }
}

export interface MediaItem {
    id: string;
    url: string;
    type: 'image' | 'video' | 'music' | 'uploaded';
    thumbnail?: string;
    prompt?: string;
    model?: string;
    createdAt?: string;
    storagePath?: string;
    mediaId?: string;
}

export interface MediaLibraryResponse {
    responseStatus: 'success' | 'error';
    message?: string;
    data?: {
        images?: MediaItem[];
        videos?: MediaItem[];
        music?: MediaItem[];
        uploaded?: MediaItem[];
        pagination?: {
            page: number;
            limit: number;
            totalImages: number;
            totalVideos: number;
            totalUploaded: number;
            hasMoreImages: boolean;
            hasMoreVideos: boolean;
            hasMoreUploaded: boolean;
        };
    };
}

/**
 * Get user's media library (generated and uploaded)
 */
export async function getMediaLibrary(page: number = 1, limit: number = 20): Promise<MediaLibraryResponse> {
    try {
        const response = await fetch(`${API_GATEWAY_URL}/canvas/media-library?page=${page}&limit=${limit}`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Failed to fetch media library' }));
            return {
                responseStatus: 'error',
                message: error.message || 'Failed to fetch media library',
            };
        }

        const result = await response.json();
        return {
            responseStatus: 'success',
            data: result.data || {
                images: [],
                videos: [],
                music: [],
                uploaded: [],
            },
        };
    } catch (error: any) {
        return {
            responseStatus: 'error',
            message: error.message || 'Failed to fetch media library',
        };
    }
}
