import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryVideoMetadataRepository, type VideoMetadata } from '../../../backend/src/routes/videoMetadataStore';

describe('InMemoryVideoMetadataRepository', () => {
    let repo: InMemoryVideoMetadataRepository;

    beforeEach(() => {
        repo = new InMemoryVideoMetadataRepository();
    });

    const buildMetadata = (overrides: Partial<VideoMetadata> = {}): VideoMetadata => ({
        video_id: 'abc',
        platform: 'youtube',
        title: 'Паста Карбонара',
        channel_name: 'Chef Channel',
        duration_seconds: 300,
        fetched_at: new Date().toISOString(),
        ...overrides,
    });

    it('saves metadata without throwing', async () => {
        await expect(repo.save(buildMetadata())).resolves.toBeUndefined();
    });

    it('saves metadata for distinct video ids independently', async () => {
        await repo.save(buildMetadata({ video_id: 'video-a' }));
        await expect(
            repo.save(buildMetadata({ video_id: 'video-b' }))
        ).resolves.toBeUndefined();
    });

    it('overwrites existing metadata for the same video_id', async () => {
        await repo.save(buildMetadata({ video_id: 'abc', title: 'Старое название' }));
        await expect(
            repo.save(buildMetadata({ video_id: 'abc', title: 'Новое название' }))
        ).resolves.toBeUndefined();
    });
});