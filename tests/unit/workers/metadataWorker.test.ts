import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runMetadataCheck } from '../../../backend/src/workers/metadataWorker';
import { recipeJobStore, type RecipeJob } from '../../../backend/src/routes/recipeJobStore';

const { mockYtDlp } = vi.hoisted(() => ({
    mockYtDlp: vi.fn(),
}));

vi.mock('yt-dlp-exec', () => ({
    __esModule: true,
    default: mockYtDlp,
}));

const buildRaw = (overrides: Partial<{
    title: string;
    channel: string | null;
    duration: number;
    availability: string;
    has_audio: boolean;
}> = {}) => ({
    title: 'Паста Карбонара',
    channel: 'Chef Channel',
    duration: 300,
    availability: 'public',
    has_audio: true,
    ...overrides,
} as any);

describe('runMetadataCheck', () => {
    let job: RecipeJob;

    beforeEach(async () => {
        mockYtDlp.mockReset();
        job = {
            job_id: 'job-1',
            source_url: 'https://youtube.com/watch?v=abc',
            canonical_key: 'youtube:abc',
            status: 'scanning',
            created_at: new Date().toISOString(),
        };
        await recipeJobStore.create(job);
    });

    it('moves the job to transcribing on success', async () => {
        mockYtDlp.mockResolvedValue(buildRaw());

        await runMetadataCheck(job.job_id, job.source_url, 'abc', 'youtube');

        expect(job.status).toBe('transcribing');
    });

    it('marks the job as failed when metadata check fails', async () => {
        mockYtDlp.mockResolvedValue(buildRaw({ availability: 'private' }));

        await expect(
            runMetadataCheck(job.job_id, job.source_url, 'abc', 'youtube')
        ).rejects.toMatchObject({ code: 'VIDEO_UNAVAILABLE' });

        expect(job.status).toBe('failed');
        expect(job.error_code).toBe('VIDEO_UNAVAILABLE');
        expect(job.error_message).toBeTruthy();
    });
});
