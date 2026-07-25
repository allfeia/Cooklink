export interface VideoMetadata {
    video_id: string;
    platform: 'youtube';
    title: string;
    channel_name: string | null;
    duration_seconds: number;
    fetched_at: string;
}

export interface VideoMetadataRepository {
    save(metadata: VideoMetadata): Promise<void>;
}

export class InMemoryVideoMetadataRepository implements VideoMetadataRepository {
    private metadataByVideoId = new Map<string, VideoMetadata>();

    async save(metadata: VideoMetadata): Promise<void> {
        this.metadataByVideoId.set(metadata.video_id, metadata);
    }
}

export const videoMetadataStore: VideoMetadataRepository = new InMemoryVideoMetadataRepository();