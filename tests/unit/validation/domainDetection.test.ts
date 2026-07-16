import { describe, expect, it } from 'vitest';
import { detectPlatform } from '../../../common/validation/domainDetection';

describe('detectPlatform', () => {
    describe('youtube', () => {
        it('detects youtube.com domain', () => {
            expect(
                detectPlatform('https://youtube.com/watch?v=dQw4w9WgXcQ')
            ).toBe('youtube');
        });

        it('detects www.youtube.com domain', () => {
            expect(
                detectPlatform('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
            ).toBe('youtube');
        });

        it('detects youtu.be domain', () => {
            expect(
                detectPlatform('https://youtu.be/dQw4w9WgXcQ')
            ).toBe('youtube');
        });
    });


    describe('invalid youtube domains', () => {
        it('rejects fake youtube subdomain', () => {
            expect(
                detectPlatform(
                    'https://youtube.com.evil.ru/watch?v=dQw4w9WgXcQ'
                )
            ).toBeNull();
        });

        it('rejects user info attack', () => {
            expect(
                detectPlatform(
                    'https://youtube.com@evil.com/watch?v=dQw4w9WgXcQ'
                )
            ).toBeNull();
        });

        it('rejects youtube url without scheme', () => {
            expect(
                detectPlatform(
                    'youtube.com/watch?v=dQw4w9WgXcQ'
                )
            ).toBeNull();
        });
    });


    describe('unsupported platforms', () => {
        it('rejects vimeo', () => {
            expect(
                detectPlatform('https://vimeo.com/123456')
            ).toBeNull();
        });

        it('rejects tiktok', () => {
            expect(
                detectPlatform('https://tiktok.com/video/123456')
            ).toBeNull();
        });

        it('rejects random text', () => {
            expect(
                detectPlatform('hello world')
            ).toBeNull();
        });
    });


    describe('invalid input', () => {
        it('rejects empty string', () => {
            expect(
                detectPlatform('')
            ).toBeNull();
        });

        it('rejects whitespace string', () => {
            expect(
                detectPlatform('     ')
            ).toBeNull();
        });

        it('does not throw for non-string input', () => {
            expect(
                detectPlatform(null)
            ).toBeNull();

            expect(
                detectPlatform(undefined)
            ).toBeNull();

            expect(
                detectPlatform(123)
            ).toBeNull();

            expect(
                detectPlatform({})
            ).toBeNull();
        });
    });
});