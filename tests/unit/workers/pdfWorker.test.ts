import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { runPdfGeneration } from '../../../backend/src/workers/pdfWorker';
import { pdfStore } from '../../../backend/src/routes/pdf/pdfStore';
import { recipeJobStore, type RecipeJob } from '../../../backend/src/routes/recipeJobStore';
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

describe('runPdfGeneration', () => {
    const mockFetch = vi.fn();
    let job: RecipeJob;

    beforeEach(async () => {
        mockFetch.mockReset();
        vi.stubGlobal('fetch', mockFetch);

        job = {
            job_id: 'job-1',
            source_url: 'https://youtube.com/watch?v=abc',
            canonical_key: 'youtube:abc',
            status: 'generating_pdf',
            created_at: new Date().toISOString(),
        };
        await recipeJobStore.create(job);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('saves the pdf and moves the job to completed on success', async () => {
        const pdfBytes = new TextEncoder().encode('%PDF-1.4 fake');
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            arrayBuffer: async () => pdfBytes.buffer,
        });

        await runPdfGeneration(job.job_id, recipe);

        expect(job.status).toBe('completed');
        const saved = await pdfStore.get(job.job_id);
        expect(saved).toBeDefined();
        expect(saved!.toString()).toContain('%PDF-1.4');
    });

    it('marks the job as failed when Gotenberg fails', async () => {
        const failingJob: RecipeJob = { ...job, job_id: 'job-2' };
        await recipeJobStore.create(failingJob);
        mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });

        await expect(runPdfGeneration(failingJob.job_id, recipe)).rejects.toMatchObject({
            code: 'PDF_GENERATION_FAILED',
        });

        expect(failingJob.status).toBe('failed');
        expect(failingJob.error_code).toBe('PDF_GENERATION_FAILED');
        await expect(pdfStore.get(failingJob.job_id)).resolves.toBeUndefined();
    });
});
