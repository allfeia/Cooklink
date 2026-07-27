import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { transcripts } from '../../db/schema';

export interface Transcript {
    video_id: string;
    language: 'ru' | 'en';
    transcript_text: string;
    fetched_at: string;
}

export interface TranscriptRepository {
    save(transcript: Transcript): Promise<void>;
    get(videoId: string): Promise<Transcript | undefined>;
}

export class InMemoryTranscriptRepository implements TranscriptRepository {
    private transcriptByVideoId = new Map<string, Transcript>();

    async save(transcript: Transcript): Promise<void> {
        this.transcriptByVideoId.set(transcript.video_id, transcript);
    }

    async get(videoId: string): Promise<Transcript | undefined> {
        return this.transcriptByVideoId.get(videoId);
    }
}

function toDomain(row: typeof transcripts.$inferSelect): Transcript {
    return {
        video_id: row.videoId,
        language: row.language as 'ru' | 'en',
        transcript_text: row.transcriptText,
        fetched_at: row.fetchedAt.toISOString(),
    };
}

export class PostgresTranscriptRepository implements TranscriptRepository {
    async save(transcript: Transcript): Promise<void> {
        const values = {
            videoId: transcript.video_id,
            language: transcript.language,
            transcriptText: transcript.transcript_text,
            fetchedAt: new Date(transcript.fetched_at),
        };

        await db
            .insert(transcripts)
            .values(values)
            .onConflictDoUpdate({ target: transcripts.videoId, set: values });
    }

    async get(videoId: string): Promise<Transcript | undefined> {
        const [row] = await db
            .select()
            .from(transcripts)
            .where(eq(transcripts.videoId, videoId))
            .limit(1);
        return row ? toDomain(row) : undefined;
    }
}

export const subtitlesStore: TranscriptRepository = new PostgresTranscriptRepository();
