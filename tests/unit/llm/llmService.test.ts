import { describe, expect, it, vi, beforeEach } from 'vitest';
import { extractRecipe, MAX_RETRIES } from '../../../backend/src/routes/llm/llmService';

const { mockCreate } = vi.hoisted(() => ({
    mockCreate: vi.fn(),
}));

vi.mock('openai', () => ({
    __esModule: true,
    default: vi.fn().mockImplementation(function () {
        return { chat: { completions: { create: mockCreate } } };
    }),
}));

vi.mock('../../../backend/src/routes/recipe/recipeStore', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../backend/src/routes/recipe/recipeStore')>();
    return { ...actual, recipeStore: new actual.InMemoryRecipeRepository() };
});

function streamOf(text: string) {
    return {
        [Symbol.asyncIterator]: async function* () {
            yield { choices: [{ delta: { content: text } }] };
        },
    };
}

const VALID_RECIPE_JSON = JSON.stringify({
    title: 'Паста Карбонара',
    type: 'Горячее',
    cooking_time_minutes: 20,
    nutrition_per_100g: { calories: 250, protein: 12, fat: 10, carbs: 30 },
    portions: 2,
    ingredients: [{ name: 'спагетти', quantity: 200, unit: 'г' }],
    steps: [{ step_number: 1, description: 'Отварите спагетти в подсоленной воде.' }],
});

describe('extractRecipe', () => {
    beforeEach(() => {
        mockCreate.mockReset();
    });

    describe('happy path', () => {
        it('returns parsed recipe for a valid JSON response', async () => {
            mockCreate.mockResolvedValue(streamOf(VALID_RECIPE_JSON));

            const result = await extractRecipe('транскрипт с рецептом', 'abc');

            expect(result).toEqual(JSON.parse(VALID_RECIPE_JSON));
            expect(mockCreate).toHaveBeenCalledTimes(1);
        });

        it('strips markdown fences before parsing', async () => {
            mockCreate.mockResolvedValue(streamOf('```json\n' + VALID_RECIPE_JSON + '\n```'));

            const result = await extractRecipe('транскрипт с рецептом', 'abc');

            expect(result.title).toBe('Паста Карбонара');
        });
    });

    describe('провайдер модели вернул ошибку', () => {
        it('маппит 429 в LLM_RATE_LIMITED без ретраев', async () => {
            mockCreate.mockRejectedValue(Object.assign(new Error('Too Many Requests'), { status: 429 }));

            await expect(
                extractRecipe('транскрипт с рецептом', 'abc')
            ).rejects.toMatchObject({ code: 'LLM_RATE_LIMITED' });

            expect(mockCreate).toHaveBeenCalledTimes(1);
        });

        it('маппит 402 в LLM_QUOTA_EXCEEDED (исчерпан бюджет), не в INTERNAL_SERVER_ERROR', async () => {
            mockCreate.mockRejectedValue(Object.assign(new Error('Payment Required'), { status: 402 }));

            await expect(
                extractRecipe('транскрипт с рецептом', 'abc')
            ).rejects.toMatchObject({ code: 'LLM_QUOTA_EXCEEDED' });

            expect(mockCreate).toHaveBeenCalledTimes(1);
        });

        it('прочие ошибки провайдера пробрасывает как есть', async () => {
            mockCreate.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));

            await expect(
                extractRecipe('транскрипт с рецептом', 'abc')
            ).rejects.not.toMatchObject({ code: expect.any(String) });
        });
    });

    describe('AI_EXTRACTION_FAILED', () => {
        it('throws immediately without retry when the response is empty', async () => {
            mockCreate.mockResolvedValue(streamOf(''));

            await expect(
                extractRecipe('пустой транскрипт', 'abc')
            ).rejects.toMatchObject({ code: 'AI_EXTRACTION_FAILED' });

            expect(mockCreate).toHaveBeenCalledTimes(1);
        });

        it('treats a whitespace-only response as empty', async () => {
            mockCreate.mockResolvedValue(streamOf('   \n  '));

            await expect(
                extractRecipe('бессвязный набор символов', 'abc')
            ).rejects.toMatchObject({ code: 'AI_EXTRACTION_FAILED' });

            expect(mockCreate).toHaveBeenCalledTimes(1);
        });
    });

    describe('INVALID_JSON_SCHEMA', () => {
        it('retries on non-JSON response and eventually throws', async () => {
            mockCreate.mockResolvedValue(streamOf('это не джейсон вообще'));

            await expect(
                extractRecipe('транскрипт', 'abc')
            ).rejects.toMatchObject({
                code: 'INVALID_JSON_SCHEMA',
                details: expect.objectContaining({ retry_count: MAX_RETRIES - 1 }),
            });

            expect(mockCreate).toHaveBeenCalledTimes(MAX_RETRIES);
        });

        it('retries when required fields are missing and eventually throws', async () => {
            mockCreate.mockResolvedValue(streamOf(JSON.stringify({ title: 'Без ингредиентов' })));

            await expect(
                extractRecipe('транскрипт', 'abc')
            ).rejects.toMatchObject({ code: 'INVALID_JSON_SCHEMA' });

            expect(mockCreate).toHaveBeenCalledTimes(MAX_RETRIES);
        });

        it('rejects non-numeric portions/nutrition values (HTML-injection guard for the PDF template)', async () => {
            const malicious = JSON.stringify({
                ...JSON.parse(VALID_RECIPE_JSON),
                portions: '<img src=x onerror=alert(1)>',
            });
            mockCreate.mockResolvedValue(streamOf(malicious));

            await expect(
                extractRecipe('транскрипт', 'abc')
            ).rejects.toMatchObject({ code: 'INVALID_JSON_SCHEMA' });

            expect(mockCreate).toHaveBeenCalledTimes(MAX_RETRIES);
        });

        it('retries when type is outside the fixed enum and eventually throws', async () => {
            const invalidType = JSON.stringify({
                ...JSON.parse(VALID_RECIPE_JSON),
                type: 'Завтрак',
            });
            mockCreate.mockResolvedValue(streamOf(invalidType));

            await expect(
                extractRecipe('транскрипт', 'abc')
            ).rejects.toMatchObject({ code: 'INVALID_JSON_SCHEMA' });

            expect(mockCreate).toHaveBeenCalledTimes(MAX_RETRIES);
        });

        it('succeeds on the second attempt after one invalid response', async () => {
            mockCreate
                .mockResolvedValueOnce(streamOf('сломанный ответ'))
                .mockResolvedValueOnce(streamOf(VALID_RECIPE_JSON));

            const result = await extractRecipe('транскрипт', 'abc');

            expect(result.title).toBe('Паста Карбонара');
            expect(mockCreate).toHaveBeenCalledTimes(2);
        });

        it('treats a truncated stream as invalid JSON and retries', async () => {
            const truncated = VALID_RECIPE_JSON.slice(0, VALID_RECIPE_JSON.length - 20);
            mockCreate.mockResolvedValue(streamOf(truncated));

            await expect(
                extractRecipe('транскрипт', 'abc')
            ).rejects.toMatchObject({ code: 'INVALID_JSON_SCHEMA' });

            expect(mockCreate).toHaveBeenCalledTimes(MAX_RETRIES);
        });
    });
});
