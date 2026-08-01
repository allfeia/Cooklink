import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runSubtitlesFetch } from '../../../backend/src/workers/subtitlesWorker';
import { recipeJobStore, type RecipeJob } from '../../../backend/src/routes/recipeJobStore';

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

vi.mock('../../../backend/src/routes/recipeJobStore', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../backend/src/routes/recipeJobStore')>();
    return { ...actual, recipeJobStore: new actual.InMemoryRecipeJobRepository() };
});

vi.mock('../../../backend/src/routes/subtitles/subtitlesStore', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../backend/src/routes/subtitles/subtitlesStore')>();
    return { ...actual, subtitlesStore: new actual.InMemoryTranscriptRepository() };
});

const RU_VTT = `WEBVTT

1
00:00:00.000 --> 00:00:02.000
Привет, сегодня готовим пасту карбонара
`;

describe('runSubtitlesFetch', () => {
    let job: RecipeJob;

    beforeEach(async () => {
        mockYtDlp.mockReset();
        mockAxiosGet.mockReset();
        mockSleep.mockReset();
        mockSleep.mockResolvedValue(undefined);

        job = {
            job_id: 'job-1',
            source_url: 'https://youtube.com/watch?v=abc',
            canonical_key: 'youtube:abc',
            status: 'transcribing',
            created_at: new Date().toISOString(),
        };
        await recipeJobStore.create(job);
    });

    it('moves the job to llm_processing on success', async () => {
        mockYtDlp.mockResolvedValue({ subtitles: { ru: [{ ext: 'vtt', url: 'https://cdn/ru.vtt' }] } });
        mockAxiosGet.mockResolvedValue({ data: RU_VTT });

        const transcript = await runSubtitlesFetch(job.job_id, job.source_url, 'abc');

        expect(transcript.transcript_text).toContain('Привет, сегодня готовим пасту карбонара');
        expect(job.status).toBe('llm_processing');
    });

    it('marks the job as failed when no subtitles are found', async () => {
        mockYtDlp.mockResolvedValue({ subtitles: {}, automatic_captions: {} });

        await expect(
            runSubtitlesFetch(job.job_id, job.source_url, 'abc')
        ).rejects.toMatchObject({ code: 'NO_SUBTITLES' });

        expect(job.status).toBe('failed');
        expect(job.error_code).toBe('NO_SUBTITLES');
    });
});
