import { describe, expect, it, vi, beforeEach } from 'vitest';
import { checkVideoMetadata, MAX_DURATION_SEC } from '../../../backend/src/routes/videoMetadataService';

const { mockYtDlp } = vi.hoisted(() => ({
    mockYtDlp: vi.fn(),
}));

vi.mock('yt-dlp-exec', () => ({
    __esModule: true,
    default: mockYtDlp,
}));

const buildRaw = (overrides: Partial<{
    title: string;
    channel: string | null;
    duration: number;
    availability: string;
    has_audio: boolean;
}> = {}) => ({
    title: 'Паста Карбонара',
    channel: 'Chef Channel',
    duration: 300,
    availability: 'public',
    has_audio: true,
    ...overrides,
} as any);

describe('checkVideoMetadata', () => {
    beforeEach(() => {
        mockYtDlp.mockReset();
    });

    describe('happy path', () => {
        it('returns metadata for a valid public video with audio', async () => {
            mockYtDlp.mockResolvedValue(buildRaw());

            const result = await checkVideoMetadata('https://youtube.com/watch?v=abc', 'abc', 'youtube');

            expect(result).toEqual({
                video_id: 'abc',
                platform: 'youtube',
                title: 'Паста Карбонара',
                channel_name: 'Chef Channel',
                duration_seconds: 300,
                fetched_at: expect.any(String),
            });
        });

    });

    describe('VIDEO_UNAVAILABLE', () => {
        it('throws when yt-dlp call fails', async () => {
            mockYtDlp.mockRejectedValue(new Error('Video is private'));

            await expect(
                checkVideoMetadata('https://youtube.com/watch?v=abc', 'abc', 'youtube')
            ).rejects.toMatchObject({
                code: 'VIDEO_UNAVAILABLE',
                details: { reason: 'Video is private' },
            });
        });

        it('throws when availability is private', async () => {
            mockYtDlp.mockResolvedValue(buildRaw({ availability: 'private' }));

            await expect(
                checkVideoMetadata('https://youtube.com/watch?v=abc', 'abc', 'youtube')
            ).rejects.toMatchObject({ code: 'VIDEO_UNAVAILABLE' });
        });

        it('throws for any other unrecognized availability value', async () => {
            mockYtDlp.mockResolvedValue(buildRaw({ availability: 'premium_only' }));

            await expect(
                checkVideoMetadata('https://youtube.com/watch?v=abc', 'abc', 'youtube')
            ).rejects.toMatchObject({ code: 'VIDEO_UNAVAILABLE' });
        });
    });

    describe('VIDEO_TOO_LONG', () => {
        it('throws when duration exceeds limit', async () => {
            mockYtDlp.mockResolvedValue(buildRaw({ duration: MAX_DURATION_SEC + 1 }));

            await expect(
                checkVideoMetadata('https://youtube.com/watch?v=abc', 'abc', 'youtube')
            ).rejects.toMatchObject({
                code: 'VIDEO_TOO_LONG',
                details: {
                    video_duration_sec: MAX_DURATION_SEC + 1,
                    max_duration_sec: MAX_DURATION_SEC,
                },
            });
        });

        it('does not throw at exactly the limit (900s)', async () => {
            mockYtDlp.mockResolvedValue(buildRaw({ duration: MAX_DURATION_SEC }));

            await expect(
                checkVideoMetadata('https://youtube.com/watch?v=abc', 'abc', 'youtube')
            ).resolves.toBeDefined();
        });

        it('does not throw below the limit (899s)', async () => {
            mockYtDlp.mockResolvedValue(buildRaw({ duration: MAX_DURATION_SEC - 1 }));

            await expect(
                checkVideoMetadata('https://youtube.com/watch?v=abc', 'abc', 'youtube')
            ).resolves.toBeDefined();
        });
    });

    describe('VIDEO_NO_AUDIO', () => {
        it('throws when has_audio is false', async () => {
            mockYtDlp.mockResolvedValue(buildRaw({ has_audio: false }));

            await expect(
                checkVideoMetadata('https://youtube.com/watch?v=abc', 'abc', 'youtube')
            ).rejects.toMatchObject({ code: 'VIDEO_NO_AUDIO' });
        });

        it('does not throw when has_audio is true', async () => {
            mockYtDlp.mockResolvedValue(buildRaw({ has_audio: true }));

            await expect(
                checkVideoMetadata('https://youtube.com/watch?v=abc', 'abc', 'youtube')
            ).resolves.toBeDefined();
        });
    });

    describe('priority when multiple violations', () => {
        it('returns VIDEO_TOO_LONG (not VIDEO_NO_AUDIO) when both duration and audio fail', async () => {
            mockYtDlp.mockResolvedValue(
                buildRaw({ duration: MAX_DURATION_SEC + 1, has_audio: false })
            );

            await expect(
                checkVideoMetadata('https://youtube.com/watch?v=abc', 'abc', 'youtube')
            ).rejects.toMatchObject({ code: 'VIDEO_TOO_LONG' });
        });

        it('returns VIDEO_UNAVAILABLE (not VIDEO_TOO_LONG) when both availability and duration fail', async () => {
            mockYtDlp.mockResolvedValue(
                buildRaw({ availability: 'private', duration: MAX_DURATION_SEC + 1 })
            );

            await expect(
                checkVideoMetadata('https://youtube.com/watch?v=abc', 'abc', 'youtube')
            ).rejects.toMatchObject({ code: 'VIDEO_UNAVAILABLE' });
        });
    });
});