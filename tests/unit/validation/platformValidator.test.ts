import { describe, expect, it } from 'vitest';
import { validateByPlatform } from '../../../common/validation/platformValidator';

const VIDEO_ID = 'dQw4w9WgXcQ';

describe('validateByPlatform', () => {
    describe('youtube', () => {
        it('validates youtube watch url', () => {
            expect(
                validateByPlatform('youtube', `https://youtube.com/watch?v=${VIDEO_ID}`)
            ).toBe(VIDEO_ID);
        });

        it('validates youtube watch url with www', () => {
            expect(
                validateByPlatform('youtube', `https://www.youtube.com/watch?v=${VIDEO_ID}`)
            ).toBe(VIDEO_ID);
        });

        it('validates youtu.be url', () => {
            expect(
                validateByPlatform('youtube', `https://youtu.be/${VIDEO_ID}`)
            ).toBe(VIDEO_ID);
        });

        it('validates shorts url', () => {
            expect(
                validateByPlatform('youtube', `https://youtube.com/shorts/${VIDEO_ID}`)
            ).toBe(VIDEO_ID);
        });

        it('validates embed url', () => {
            expect(
                validateByPlatform('youtube', `https://youtube.com/embed/${VIDEO_ID}`)
            ).toBe(VIDEO_ID);
        });

        it('validates v url', () => {
            expect(
                validateByPlatform('youtube', `https://youtube.com/v/${VIDEO_ID}`)
            ).toBe(VIDEO_ID);
        });

        it('validates mobile youtube url', () => {
            expect(
                validateByPlatform('youtube', `https://m.youtube.com/watch?v=${VIDEO_ID}`)
            ).toBe(VIDEO_ID);
        });
    });

    describe('invalid youtube urls', () => {
        it('rejects playlist without video id', () => {
            expect(
                validateByPlatform('youtube', 'https://youtube.com/playlist?list=123')
            ).toBeNull();
        });

        it('rejects empty video id', () => {
            expect(
                validateByPlatform('youtube', 'https://youtube.com/watch?v=')
            ).toBeNull();
        });

        it('rejects url without scheme', () => {
            expect(
                validateByPlatform('youtube', `youtube.com/watch?v=${VIDEO_ID}`)
            ).toBeNull();
        });

        it('rejects invalid video id characters', () => {
            expect(
                validateByPlatform('youtube', 'https://youtube.com/watch?v=!!!!!!!!!!!')
            ).toBeNull();
        });

        it('rejects short video id', () => {
            expect(
                validateByPlatform('youtube', 'https://youtube.com/watch?v=12345')
            ).toBeNull();
        });
    });

    describe('unsupported platforms', () => {
        it('returns null for unsupported platform', () => {
            expect(
                validateByPlatform('rutube' as any, 'https://rutube.ru/video/123')
            ).toBeNull();
        });
    });

    describe('invalid input', () => {
        it('rejects empty string', () => {
            expect(validateByPlatform('youtube', '')).toBeNull();
        });

        it('rejects non-string input', () => {
            expect(validateByPlatform('youtube', null)).toBeNull();
            expect(validateByPlatform('youtube', undefined)).toBeNull();
            expect(validateByPlatform('youtube', 123)).toBeNull();
        });
    });
});