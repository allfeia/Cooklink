import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { videoMetadata } from '../../db/schema';

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
    get(videoId: string): Promise<VideoMetadata | undefined>;
}

export class InMemoryVideoMetadataRepository implements VideoMetadataRepository {
    private metadataByVideoId = new Map<string, VideoMetadata>();

    async save(metadata: VideoMetadata): Promise<void> {
        this.metadataByVideoId.set(metadata.video_id, metadata);
    }

    async get(videoId: string): Promise<VideoMetadata | undefined> {
        return this.metadataByVideoId.get(videoId);
    }
}

function toDomain(row: typeof videoMetadata.$inferSelect): VideoMetadata {
    return {
        video_id: row.videoId,
        platform: row.platform as 'youtube',
        title: row.title,
        channel_name: row.channelName,
        duration_seconds: row.durationSeconds,
        fetched_at: row.fetchedAt.toISOString(),
    };
}

export class PostgresVideoMetadataRepository implements VideoMetadataRepository {
    async save(metadata: VideoMetadata): Promise<void> {
        const values = {
            videoId: metadata.video_id,
            platform: metadata.platform,
            title: metadata.title,
            channelName: metadata.channel_name,
            durationSeconds: metadata.duration_seconds,
            fetchedAt: new Date(metadata.fetched_at),
        };

        await db
            .insert(videoMetadata)
            .values(values)
            .onConflictDoUpdate({ target: videoMetadata.videoId, set: values });
    }

    async get(videoId: string): Promise<VideoMetadata | undefined> {
        const [row] = await db
            .select()
            .from(videoMetadata)
            .where(eq(videoMetadata.videoId, videoId))
            .limit(1);
        return row ? toDomain(row) : undefined;
    }
}

export const videoMetadataStore: VideoMetadataRepository = new PostgresVideoMetadataRepository();
