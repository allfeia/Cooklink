import { describe, expect, it } from 'vitest';
import { parseVideoUrl } from '../../../common/validation/validatePipeline';

describe('parseVideoUrl', () => {
    it('returns full result for a valid youtube url', () => {
        const result = parseVideoUrl('https://youtube.com/watch?v=dQw4w9WgXcQ');
        expect(result).toEqual({
            platform: 'youtube',
            videoId: 'dQw4w9WgXcQ',
            canonicalKey: 'youtube:dQw4w9WgXcQ',
            sourceUrl: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
        });
    });

    it('returns null when domain is not detected', () => {
        expect(parseVideoUrl('https://vimeo.com/123456')).toBeNull();
    });

    it('returns null when domain matches but path/id is invalid', () => {
        expect(parseVideoUrl('https://youtube.com/playlist?list=123')).toBeNull();
    });

    it('returns null for empty or non-string input', () => {
        expect(parseVideoUrl('')).toBeNull();
        expect(parseVideoUrl(null)).toBeNull();
        expect(parseVideoUrl(undefined)).toBeNull();
    });

    it('keeps sourceUrl exactly as provided, without normalization', () => {
        const result = parseVideoUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ');
        expect(result?.sourceUrl).toBe('https://m.youtube.com/watch?v=dQw4w9WgXcQ');
    });
});