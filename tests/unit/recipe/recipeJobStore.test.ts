import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryRecipeJobRepository, type RecipeJob } from '../../../backend/src/routes/recipeJobStore';

const buildJob = (overrides: Partial<RecipeJob> = {}): RecipeJob => ({
    job_id: 'job-1',
    source_url: 'https://youtube.com/watch?v=abc',
    canonical_key: 'youtube:abc',
    status: 'scanning',
    created_at: new Date().toISOString(),
    ...overrides,
});

describe('InMemoryRecipeJobRepository', () => {
    let repo: InMemoryRecipeJobRepository;

    beforeEach(() => {
        repo = new InMemoryRecipeJobRepository();
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

describe('InMemoryRecipeJobRepository — защита от перезаписи терминального статуса', () => {
    let repo: InMemoryRecipeJobRepository;

    beforeEach(() => {
        repo = new InMemoryRecipeJobRepository();
    });

    it('updateStatus не перезаписывает cancelled (защита от race condition воркера)', async () => {
        const job = buildJob({ job_id: 'job-2', status: 'transcribing' });
        await repo.create(job);
        await repo.cancel(job.job_id);

        await repo.updateStatus(job.job_id, 'llm_processing');

        const found = await repo.findById(job.job_id);
        expect(found?.status).toBe('cancelled');
    });

    it('updateStatus не перезаписывает completed', async () => {
        const job = buildJob({ job_id: 'job-3', status: 'generating_pdf' });
        await repo.create(job);
        await repo.updateStatus(job.job_id, 'completed');

        await repo.updateStatus(job.job_id, 'failed');

        const found = await repo.findById(job.job_id);
        expect(found?.status).toBe('completed');
    });

    it('updateStatus не перезаписывает failed', async () => {
        const job = buildJob({ job_id: 'job-4', status: 'llm_processing' });
        await repo.create(job);
        await repo.markFailed(job.job_id, 'AI_EXTRACTION_FAILED', 'ошибка');

        await repo.updateStatus(job.job_id, 'generating_pdf');

        const found = await repo.findById(job.job_id);
        expect(found?.status).toBe('failed');
    });

    it('markFailed не перезаписывает cancelled', async () => {
        const job = buildJob({ job_id: 'job-5', status: 'llm_processing' });
        await repo.create(job);
        await repo.cancel(job.job_id);

        await repo.markFailed(job.job_id, 'AI_EXTRACTION_FAILED', 'ошибка');

        const found = await repo.findById(job.job_id);
        expect(found?.status).toBe('cancelled');
        expect(found?.error_code).toBeUndefined();
    });

    it('markFailed не перезаписывает completed', async () => {
        const job = buildJob({ job_id: 'job-6', status: 'generating_pdf' });
        await repo.create(job);
        await repo.updateStatus(job.job_id, 'completed');

        await repo.markFailed(job.job_id, 'PDF_GENERATION_FAILED', 'ошибка');

        const found = await repo.findById(job.job_id);
        expect(found?.status).toBe('completed');
        expect(found?.error_code).toBeUndefined();
    });

    it('cancel возвращает false для уже терминального статуса', async () => {
        const job = buildJob({ job_id: 'job-7' });
        await repo.create(job);
        await repo.cancel(job.job_id);

        const result = await repo.cancel(job.job_id);

        expect(result).toBe(false);
        expect((await repo.findById(job.job_id))?.status).toBe('cancelled');
    });
});
