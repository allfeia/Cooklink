import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryRecipeJobRepository, type RecipeJob } from '../../../backend/src/routes/recipeJobStore';

describe('InMemoryRecipeJobRepository', () => {
    let repo: InMemoryRecipeJobRepository;

    beforeEach(() => {
        repo = new InMemoryRecipeJobRepository();
    });

    const buildJob = (overrides: Partial<RecipeJob> = {}): RecipeJob => ({
        job_id: 'job-1',
        source_url: 'https://youtube.com/watch?v=abc',
        canonical_key: 'youtube:abc',
        status: 'scanning',
        created_at: new Date().toISOString(),
        ...overrides,
    });

    it('creates and finds a job by id', async () => {
        const job = buildJob();
        await repo.create(job);

        await expect(repo.findById(job.job_id)).resolves.toEqual(job);
    });

    it('returns undefined for an unknown job id', async () => {
        await expect(repo.findById('unknown')).resolves.toBeUndefined();
    });

    it('updateStatus moves the job to the given status', async () => {
        const job = buildJob();
        await repo.create(job);

        await repo.updateStatus(job.job_id, 'transcribing');

        const found = await repo.findById(job.job_id);
        expect(found?.status).toBe('transcribing');
    });

    it('updateStatus throws for an unknown job id', async () => {
        await expect(repo.updateStatus('unknown', 'transcribing')).rejects.toThrow();
    });

    it('markFailed sets status to failed with error_code and error_message', async () => {
        const job = buildJob({ status: 'llm_processing' });
        await repo.create(job);

        await repo.markFailed(job.job_id, 'AI_EXTRACTION_FAILED', 'Не удалось извлечь рецепт');

        const found = await repo.findById(job.job_id);
        expect(found?.status).toBe('failed');
        expect(found?.error_code).toBe('AI_EXTRACTION_FAILED');
        expect(found?.error_message).toBe('Не удалось извлечь рецепт');
    });

    it('markFailed throws for an unknown job id', async () => {
        await expect(repo.markFailed('unknown', 'CODE', 'message')).rejects.toThrow();
    });
});
