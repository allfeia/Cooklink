import { detectPlatform, type Platform } from './domainDetection';
import { validateByPlatform } from './platformValidator';

export interface ValidVideoUrl {
    platform: Platform;
    videoId: string;
    canonicalKey: string;
    sourceUrl: string;
}

export function parseVideoUrl(rawUrl: unknown): ValidVideoUrl | null {
    const result = ((): ValidVideoUrl | null => {
        if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) return null;

        const platform = detectPlatform(rawUrl);
        if (!platform) return null;

        const videoId = validateByPlatform(platform, rawUrl);
        if (!videoId) return null;

        return {
            platform,
            videoId,
            canonicalKey: `${platform}:${videoId}`,
            sourceUrl: rawUrl,
        };
    })();
    console.log('parseVideoUrl: ', result);
    return result;
}