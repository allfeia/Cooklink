import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runSubtitlesAndExtraction } from '../../../backend/src/workers/subtitlesWorker';
import { recipeJobStore, type RecipeJob } from '../../../backend/src/routes/recipeJobStore';

const { mockYtDlp, mockAxiosGet, mockSleep, mockCreate } = vi.hoisted(() => ({
    mockYtDlp: vi.fn(),
    mockAxiosGet: vi.fn(),
    mockSleep: vi.fn(),
    mockCreate: vi.fn(),
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

vi.mock('openai', () => ({
    __esModule: true,
    default: vi.fn().mockImplementation(function () {
        return { chat: { completions: { create: mockCreate } } };
    }),
}));

const RU_VTT = `WEBVTT

1
00:00:00.000 --> 00:00:02.000
Привет, сегодня готовим пасту карбонара
`;

const VALID_RECIPE_JSON = JSON.stringify({
    title: 'Паста Карбонара',
    type: 'Горячее',
    cooking_time_minutes: 20,
    difficulty: 2,
    portions: 2,
    ingredients: [{ name: 'спагетти', quantity: 200, unit: 'г' }],
    steps: [{ step_number: 1, description: 'Отварите спагетти в подсоленной воде.' }],
});

function streamOf(text: string) {
    return {
        [Symbol.asyncIterator]: async function* () {
            yield { choices: [{ delta: { content: text } }] };
        },
    };
}

describe('runSubtitlesAndExtraction', () => {
    let job: RecipeJob;

    beforeEach(async () => {
        mockYtDlp.mockReset();
        mockAxiosGet.mockReset();
        mockSleep.mockReset();
        mockSleep.mockResolvedValue(undefined);
        mockCreate.mockReset();

        job = {
            job_id: 'job-1',
            source_url: 'https://youtube.com/watch?v=abc',
            canonical_key: 'youtube:abc',
            status: 'transcribing',
            created_at: new Date().toISOString(),
        };
        await recipeJobStore.create(job);
    });

    it('moves the job through llm_processing to generating_pdf on success', async () => {
        mockYtDlp.mockResolvedValue({ subtitles: { ru: [{ ext: 'vtt', url: 'https://cdn/ru.vtt' }] } });
        mockAxiosGet.mockResolvedValue({ data: RU_VTT });
        mockCreate.mockResolvedValue(streamOf(VALID_RECIPE_JSON));

        const recipe = await runSubtitlesAndExtraction(job.job_id, job.source_url, 'abc');

        expect(recipe.title).toBe('Паста Карбонара');
        expect(job.status).toBe('generating_pdf');
    });

    it('leaves the job status untouched when no subtitles are found', async () => {
        mockYtDlp.mockResolvedValue({ subtitles: {}, automatic_captions: {} });

        await expect(
            runSubtitlesAndExtraction(job.job_id, job.source_url, 'abc')
        ).rejects.toMatchObject({ code: 'NO_SUBTITLES' });

        expect(job.status).toBe('transcribing');
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('leaves the job at llm_processing when recipe extraction fails', async () => {
        mockYtDlp.mockResolvedValue({ subtitles: { ru: [{ ext: 'vtt', url: 'https://cdn/ru.vtt' }] } });
        mockAxiosGet.mockResolvedValue({ data: RU_VTT });
        mockCreate.mockResolvedValue(streamOf(''));

        await expect(
            runSubtitlesAndExtraction(job.job_id, job.source_url, 'abc')
        ).rejects.toMatchObject({ code: 'AI_EXTRACTION_FAILED' });

        expect(job.status).toBe('llm_processing');
    });
});
