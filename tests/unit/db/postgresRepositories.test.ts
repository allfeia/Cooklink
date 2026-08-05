import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

vi.mock('../../../backend/src/db/client', async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    const schema = await import('../../../backend/src/db/schema');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const client = new PGlite();
    const db = drizzle(client, { schema });

    const migrationsFolder = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../../backend/drizzle'
    );
    await migrate(db, { migrationsFolder });

    return { db };
});

import { PostgresRecipeJobRepository, type RecipeJob } from '../../../backend/src/routes/recipeJobStore';
import { PostgresVideoMetadataRepository, type VideoMetadata } from '../../../backend/src/routes/metadata/videoMetadataStore';
import { PostgresTranscriptRepository, type Transcript } from '../../../backend/src/routes/subtitles/subtitlesStore';
import { PostgresRecipeRepository, type RecipeData } from '../../../backend/src/routes/recipe/recipeStore';

const buildJob = (overrides: Partial<RecipeJob> = {}): RecipeJob => ({
    job_id: randomUUID(),
    source_url: 'https://youtube.com/watch?v=abc',
    canonical_key: `youtube:${randomUUID()}`,
    status: 'scanning',
    created_at: new Date().toISOString(),
    ...overrides,
});

const buildMetadata = (videoId: string, overrides: Partial<VideoMetadata> = {}): VideoMetadata => ({
    video_id: videoId,
    platform: 'youtube',
    title: 'Паста Карбонара',
    channel_name: 'Chef Channel',
    duration_seconds: 300,
    fetched_at: new Date().toISOString(),
    ...overrides,
});

describe('PostgresRecipeJobRepository (PGlite)', () => {
    const repo = new PostgresRecipeJobRepository();

    it('create + findById roundtrip', async () => {
        const job = buildJob();
        await repo.create(job);

        const found = await repo.findById(job.job_id);

        expect(found).toEqual(job);
    });

    it('findById returns undefined for an unknown job', async () => {
        await expect(repo.findById(randomUUID())).resolves.toBeUndefined();
    });

    it('updateStatus changes the status', async () => {
        const job = buildJob();
        await repo.create(job);

        await repo.updateStatus(job.job_id, 'transcribing');

        const found = await repo.findById(job.job_id);
        expect(found?.status).toBe('transcribing');
    });

    it('updateStatus on an unknown job id is a no-op', async () => {
        await expect(repo.updateStatus(randomUUID(), 'transcribing')).resolves.toBeUndefined();
    });

    it('markFailed sets status=failed with error_code and error_message', async () => {
        const job = buildJob();
        await repo.create(job);

        await repo.markFailed(job.job_id, 'NO_SUBTITLES', 'Субтитры недоступны');

        const found = await repo.findById(job.job_id);
        expect(found?.status).toBe('failed');
        expect(found?.error_code).toBe('NO_SUBTITLES');
        expect(found?.error_message).toBe('Субтитры недоступны');
    });

    it('markFailed on an unknown job id is a no-op', async () => {
        await expect(repo.markFailed(randomUUID(), 'NO_SUBTITLES', 'x')).resolves.toBeUndefined();
    });

    it('updateStatus не перезаписывает cancelled', async () => {
        const job = buildJob();
        await repo.create(job);
        await repo.cancel(job.job_id);

        await repo.updateStatus(job.job_id, 'llm_processing');

        const found = await repo.findById(job.job_id);
        expect(found?.status).toBe('cancelled');
    });

    it('updateStatus не перезаписывает completed', async () => {
        const job = buildJob();
        await repo.create(job);
        await repo.updateStatus(job.job_id, 'completed');

        await repo.updateStatus(job.job_id, 'failed');

        const found = await repo.findById(job.job_id);
        expect(found?.status).toBe('completed');
    });

    it('markFailed не перезаписывает cancelled', async () => {
        const job = buildJob();
        await repo.create(job);
        await repo.cancel(job.job_id);

        await repo.markFailed(job.job_id, 'AI_EXTRACTION_FAILED', 'ошибка');

        const found = await repo.findById(job.job_id);
        expect(found?.status).toBe('cancelled');
        expect(found?.error_code).toBeUndefined();
    });

    it('markFailed не перезаписывает completed', async () => {
        const job = buildJob();
        await repo.create(job);
        await repo.updateStatus(job.job_id, 'completed');

        await repo.markFailed(job.job_id, 'PDF_GENERATION_FAILED', 'ошибка');

        const found = await repo.findById(job.job_id);
        expect(found?.status).toBe('completed');
        expect(found?.error_code).toBeUndefined();
    });
});

describe('PostgresVideoMetadataRepository (PGlite)', () => {
    const repo = new PostgresVideoMetadataRepository();

    it('save + get roundtrip', async () => {
        const videoId = randomUUID().slice(0, 11);
        const metadata = buildMetadata(videoId);

        await repo.save(metadata);
        const found = await repo.get(videoId);

        expect(found).toEqual(metadata);
    });

    it('get returns undefined for an unknown video', async () => {
        await expect(repo.get(randomUUID().slice(0, 11))).resolves.toBeUndefined();
    });

    it('save overwrites (upsert) an existing record for the same video_id', async () => {
        const videoId = randomUUID().slice(0, 11);
        await repo.save(buildMetadata(videoId, { title: 'Старое название' }));

        await repo.save(buildMetadata(videoId, { title: 'Новое название' }));

        const found = await repo.get(videoId);
        expect(found?.title).toBe('Новое название');
    });
});

describe('PostgresTranscriptRepository (PGlite)', () => {
    const metadataRepo = new PostgresVideoMetadataRepository();
    const repo = new PostgresTranscriptRepository();

    const buildTranscript = (videoId: string, overrides: Partial<Transcript> = {}): Transcript => ({
        video_id: videoId,
        language: 'ru',
        transcript_text: 'Привет, сегодня готовим пасту карбонара',
        fetched_at: new Date().toISOString(),
        ...overrides,
    });

    it('save + get roundtrip', async () => {
        const videoId = randomUUID().slice(0, 11);
        await metadataRepo.save(buildMetadata(videoId));
        const transcript = buildTranscript(videoId);

        await repo.save(transcript);
        const found = await repo.get(videoId);

        expect(found).toEqual(transcript);
    });

    it('get returns undefined for an unknown video', async () => {
        await expect(repo.get(randomUUID().slice(0, 11))).resolves.toBeUndefined();
    });

    it('save overwrites (upsert) an existing transcript for the same video_id', async () => {
        const videoId = randomUUID().slice(0, 11);
        await metadataRepo.save(buildMetadata(videoId));
        await repo.save(buildTranscript(videoId, { language: 'ru' }));

        await repo.save(buildTranscript(videoId, { language: 'en' }));

        const found = await repo.get(videoId);
        expect(found?.language).toBe('en');
    });
});

describe('PostgresRecipeRepository (PGlite)', () => {
    const repo = new PostgresRecipeRepository();

    const buildRecipe = (overrides: Partial<RecipeData> = {}): RecipeData => ({
        title: 'Паста Карбонара',
        type: 'Горячее',
        cooking_time_minutes: 20,
        difficulty: 2,
        portions: 2,
        ingredients: [{ name: 'спагетти', quantity: 200, unit: 'г' }],
        steps: [{ step_number: 1, description: 'Отварите спагетти' }],
        ...overrides,
    });

    it('save + get roundtrip', async () => {
        const canonicalKey = `youtube:${randomUUID().slice(0, 11)}`;
        const recipe = buildRecipe();

        await repo.save(canonicalKey, recipe);
        const found = await repo.get(canonicalKey);

        expect(found).toEqual(recipe);
    });

    it('get returns undefined for an unknown canonical_key', async () => {
        await expect(repo.get(`youtube:${randomUUID().slice(0, 11)}`)).resolves.toBeUndefined();
    });

    it('save overwrites (upsert) an existing recipe for the same canonical_key', async () => {
        const canonicalKey = `youtube:${randomUUID().slice(0, 11)}`;
        await repo.save(canonicalKey, buildRecipe({ title: 'Старый рецепт' }));

        await repo.save(canonicalKey, buildRecipe({ title: 'Новый рецепт' }));

        const found = await repo.get(canonicalKey);
        expect(found?.title).toBe('Новый рецепт');
    });
});
