import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runRecipeExtraction } from '../../../backend/src/workers/llmWorker';
import { recipeJobStore, type RecipeJob } from '../../../backend/src/routes/recipeJobStore';

const { mockCreate } = vi.hoisted(() => ({
    mockCreate: vi.fn(),
}));

vi.mock('openai', () => ({
    __esModule: true,
    default: vi.fn().mockImplementation(function () {
        return { chat: { completions: { create: mockCreate } } };
    }),
}));

vi.mock('../../../backend/src/routes/recipeJobStore', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../backend/src/routes/recipeJobStore')>();
    return { ...actual, recipeJobStore: new actual.InMemoryRecipeJobRepository() };
});

vi.mock('../../../backend/src/routes/recipe/recipeStore', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../backend/src/routes/recipe/recipeStore')>();
    return { ...actual, recipeStore: new actual.InMemoryRecipeRepository() };
});

const VALID_RECIPE_JSON = JSON.stringify({
    title: 'Паста Карбонара',
    type: 'Горячее',
    cooking_time_minutes: 20,
    nutrition_per_100g: { calories: 250, protein: 12, fat: 10, carbs: 30 },
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

describe('runRecipeExtraction', () => {
    let job: RecipeJob;

    beforeEach(async () => {
        mockCreate.mockReset();

        job = {
            job_id: 'job-1',
            source_url: 'https://youtube.com/watch?v=abc',
            canonical_key: 'youtube:abc',
            status: 'llm_processing',
            created_at: new Date().toISOString(),
        };
        await recipeJobStore.create(job);
    });

    it('moves the job to generating_pdf on success', async () => {
        mockCreate.mockResolvedValue(streamOf(VALID_RECIPE_JSON));

        const recipe = await runRecipeExtraction(job.job_id, 'транскрипт с рецептом', job.canonical_key);

        expect(recipe.title).toBe('Паста Карбонара');
        expect(job.status).toBe('generating_pdf');
    });

    it('marks the job as failed when recipe extraction fails', async () => {
        mockCreate.mockResolvedValue(streamOf(''));

        await expect(
            runRecipeExtraction(job.job_id, 'бессвязный транскрипт', job.canonical_key)
        ).rejects.toMatchObject({ code: 'AI_EXTRACTION_FAILED' });

        expect(job.status).toBe('failed');
        expect(job.error_code).toBe('AI_EXTRACTION_FAILED');
    });
});
