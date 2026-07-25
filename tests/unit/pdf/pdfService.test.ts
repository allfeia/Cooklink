import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { generatePdf } from '../../../backend/src/routes/pdf/pdfService';
import type { RecipeData } from '../../../backend/src/routes/recipe/recipeStore';

const recipe: RecipeData = {
    title: 'Паста Карбонара',
    type: 'Горячее',
    cooking_time_minutes: 20,
    difficulty: 2,
    portions: 2,
    ingredients: [{ name: 'спагетти', quantity: 200, unit: 'г' }],
    steps: [{ step_number: 1, description: 'Отварите спагетти' }],
};

describe('generatePdf', () => {
    const mockFetch = vi.fn();

    beforeEach(() => {
        mockFetch.mockReset();
        vi.stubGlobal('fetch', mockFetch);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns a Buffer with the pdf bytes on success', async () => {
        const pdfBytes = new TextEncoder().encode('%PDF-1.4 fake');
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            arrayBuffer: async () => pdfBytes.buffer,
        });

        const result = await generatePdf(recipe);

        expect(Buffer.isBuffer(result)).toBe(true);
        expect(result.toString()).toContain('%PDF-1.4');
    });

    it('posts to the Gotenberg chromium HTML conversion endpoint', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            arrayBuffer: async () => new ArrayBuffer(0),
        });

        await generatePdf(recipe);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url, init] = mockFetch.mock.calls[0];
        expect(String(url)).toContain('/forms/chromium/convert/html');
        expect(init.method).toBe('POST');
    });

    it('throws PDF_GENERATION_FAILED when Gotenberg responds with an error status', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 500,
            text: async () => 'internal error',
        });

        await expect(generatePdf(recipe)).rejects.toMatchObject({
            code: 'PDF_GENERATION_FAILED',
        });
    });

    it('throws PDF_GENERATION_FAILED when the request itself fails (network error)', async () => {
        mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(generatePdf(recipe)).rejects.toMatchObject({
            code: 'PDF_GENERATION_FAILED',
            details: expect.objectContaining({ reason: 'ECONNREFUSED' }),
        });
    });
});
