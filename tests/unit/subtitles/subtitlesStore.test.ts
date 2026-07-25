import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryTranscriptRepository, type Transcript } from '../../../backend/src/routes/subtitles/subtitlesStore';

describe('InMemoryTranscriptRepository', () => {
    let repo: InMemoryTranscriptRepository;

    beforeEach(() => {
        repo = new InMemoryTranscriptRepository();
    });

    const buildTranscript = (overrides: Partial<Transcript> = {}): Transcript => ({
        video_id: 'abc',
        language: 'ru',
        transcript_text: 'Привет, сегодня готовим пасту карбонара',
        fetched_at: new Date().toISOString(),
        ...overrides,
    });

    it('saves a transcript without throwing', async () => {
        await expect(repo.save(buildTranscript())).resolves.toBeUndefined();
    });

    it('saves transcripts for distinct video ids independently', async () => {
        await repo.save(buildTranscript({ video_id: 'video-a' }));
        await expect(
            repo.save(buildTranscript({ video_id: 'video-b' }))
        ).resolves.toBeUndefined();
    });

    it('overwrites existing transcript for the same video_id', async () => {
        await repo.save(buildTranscript({ video_id: 'abc', language: 'ru' }));
        await expect(
            repo.save(buildTranscript({ video_id: 'abc', language: 'en' }))
        ).resolves.toBeUndefined();
    });
});
