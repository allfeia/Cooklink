import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
    fetchSubtitles,
    computeBackoffDelayMs,
    MAX_RETRIES,
} from '../../../backend/src/routes/subtitles/subtitlesService';

const { mockYtDlp, mockAxiosGet, mockSleep } = vi.hoisted(() => ({
    mockYtDlp: vi.fn(),
    mockAxiosGet: vi.fn(),
    mockSleep: vi.fn(),
}));

vi.mock('yt-dlp-exec', () => ({
    __esModule: true,
    default: mockYtDlp,
}));

vi.mock('axios', () => ({
    __esModule: true,
    default: { get: mockAxiosGet },
}));

vi.mock('../../../backend/src/utils/sleep', () => ({
    sleep: mockSleep,
}));

vi.mock('../../../backend/src/routes/subtitles/subtitlesStore', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../backend/src/routes/subtitles/subtitlesStore')>();
    return { ...actual, subtitlesStore: new actual.InMemoryTranscriptRepository() };
});

const RU_VTT = `WEBVTT

1
00:00:00.000 --> 00:00:02.000
Привет, сегодня готовим пасту карбонара
`;

const EN_VTT = `WEBVTT

1
00:00:00.000 --> 00:00:02.000
Hi, today we're cooking carbonara
`;

const buildInfo = (overrides: Partial<{
    subtitles: Record<string, { ext: string; url: string }[]>;
    automatic_captions: Record<string, { ext: string; url: string }[]>;
}> = {}) => ({
    subtitles: {},
    automatic_captions: {},
    ...overrides,
});

describe('fetchSubtitles', () => {
    beforeEach(() => {
        mockYtDlp.mockReset();
        mockAxiosGet.mockReset();
        mockSleep.mockReset();
        mockSleep.mockResolvedValue(undefined);
    });

    describe('happy path', () => {
        it('returns a ru transcript when ru subtitles exist', async () => {
            mockYtDlp.mockResolvedValue(
                buildInfo({ subtitles: { ru: [{ ext: 'vtt', url: 'https://cdn/ru.vtt' }] } })
            );
            mockAxiosGet.mockResolvedValue({ data: RU_VTT });

            const result = await fetchSubtitles('https://youtube.com/watch?v=abc', 'abc');

            expect(result).toEqual({
                video_id: 'abc',
                language: 'ru',
                transcript_text: expect.stringContaining('Привет, сегодня готовим пасту карбонара'),
                fetched_at: expect.any(String),
            });
        });

        it('falls back to en when ru subtitles are missing', async () => {
            mockYtDlp.mockResolvedValue(
                buildInfo({ automatic_captions: { en: [{ ext: 'vtt', url: 'https://cdn/en.vtt' }] } })
            );
            mockAxiosGet.mockResolvedValue({ data: EN_VTT });

            const result = await fetchSubtitles('https://youtube.com/watch?v=abc', 'abc');

            expect(result.language).toBe('en');
            expect(result.transcript_text).toContain("Hi, today we're cooking carbonara");
        });
    });

    describe('with mediaProbe (дедуп — без повторного yt-dlp)', () => {
        it('uses tracks from the probe and does NOT call yt-dlp', async () => {
            mockAxiosGet.mockResolvedValue({ data: RU_VTT });

            const result = await fetchSubtitles('https://youtube.com/watch?v=abc', 'abc', {
                subtitleTracks: {
                    manual: { ru: [{ ext: 'vtt', url: 'https://cdn/ru.vtt' }] },
                    auto: {},
                },
            });

            expect(mockYtDlp).not.toHaveBeenCalled();
            expect(mockAxiosGet).toHaveBeenCalledWith('https://cdn/ru.vtt', expect.anything());
            expect(result.language).toBe('ru');
            expect(result.transcript_text).toContain('Привет, сегодня готовим пасту карбонара');
        });

        it('throws NO_SUBTITLES when the probe has no ru/en tracks, still without yt-dlp', async () => {
            await expect(
                fetchSubtitles('https://youtube.com/watch?v=abc', 'abc', {
                    subtitleTracks: { manual: {}, auto: {} },
                })
            ).rejects.toMatchObject({ code: 'NO_SUBTITLES' });

            expect(mockYtDlp).not.toHaveBeenCalled();
        });
    });

    describe('NO_SUBTITLES', () => {
        it('throws when neither ru nor en tracks exist', async () => {
            mockYtDlp.mockResolvedValue(buildInfo());

            await expect(
                fetchSubtitles('https://youtube.com/watch?v=abc', 'abc')
            ).rejects.toMatchObject({ code: 'NO_SUBTITLES' });
        });

        it('throws when the downloaded track is empty after stripping markup', async () => {
            mockYtDlp.mockResolvedValue(
                buildInfo({ subtitles: { ru: [{ ext: 'vtt', url: 'https://cdn/ru.vtt' }] } })
            );
            mockAxiosGet.mockResolvedValue({ data: 'WEBVTT\n\n' });

            await expect(
                fetchSubtitles('https://youtube.com/watch?v=abc', 'abc')
            ).rejects.toMatchObject({ code: 'NO_SUBTITLES' });
        });
    });

    describe('SUBTITLES_FETCH_FAILED / retry-backoff', () => {
        it('retries exactly MAX_RETRIES times on repeated 429 and then fails', async () => {
            mockYtDlp.mockRejectedValue(new Error('HTTP Error 429: Too Many Requests'));

            await expect(
                fetchSubtitles('https://youtube.com/watch?v=abc', 'abc')
            ).rejects.toMatchObject({ code: 'SUBTITLES_FETCH_FAILED' });

            expect(mockYtDlp).toHaveBeenCalledTimes(MAX_RETRIES);
        });

        it('does not retry non-429 errors', async () => {
            mockYtDlp.mockRejectedValue(new Error('ENOTFOUND'));

            await expect(
                fetchSubtitles('https://youtube.com/watch?v=abc', 'abc')
            ).rejects.toMatchObject({ code: 'SUBTITLES_FETCH_FAILED' });

            expect(mockYtDlp).toHaveBeenCalledTimes(1);
        });

        it('backoff delay grows between retries', () => {
            const first = computeBackoffDelayMs(1);
            const second = computeBackoffDelayMs(2);

            expect(second).toBeGreaterThan(first);
        });
    });
});
