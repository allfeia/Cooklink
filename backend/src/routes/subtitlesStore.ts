export interface Transcript {
    video_id: string;
    language: 'ru' | 'en';
    transcript_text: string;
    fetched_at: string;
}

export interface TranscriptRepository {
    save(transcript: Transcript): Promise<void>;
}

export class InMemoryTranscriptRepository implements TranscriptRepository {
    private transcriptByVideoId = new Map<string, Transcript>();

    async save(transcript: Transcript): Promise<void> {
        this.transcriptByVideoId.set(transcript.video_id, transcript);
    }
}

export const subtitlesStore: TranscriptRepository = new InMemoryTranscriptRepository();
