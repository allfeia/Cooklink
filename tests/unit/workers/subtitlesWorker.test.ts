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

        await runSubtitlesFetch(job.job_id, job.source_url, 'abc');

        expect(job.status).toBe('llm_processing');
    });

    it('leaves the job status untouched when no subtitles are found', async () => {
        mockYtDlp.mockResolvedValue({ subtitles: {}, automatic_captions: {} });

        await expect(
            runSubtitlesFetch(job.job_id, job.source_url, 'abc')
        ).rejects.toMatchObject({ code: 'NO_SUBTITLES' });

        expect(job.status).toBe('transcribing');
    });
});
