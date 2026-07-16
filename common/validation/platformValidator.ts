import type { Platform } from './domainDetection';

const YOUTUBE_REGEX =
    /^https?:\/\/(?:m\.|www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([a-zA-Z0-9_-]{11})/;

export function validateByPlatform(platform: Platform, rawUrl: unknown): string | null {
    if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) return null;

    switch (platform) {
        case 'youtube': {
            const match = rawUrl.match(YOUTUBE_REGEX);
            return match ? match[1] : null;
        }
        default:
            return null;
    }
}