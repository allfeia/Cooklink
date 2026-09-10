import ytDlp from 'yt-dlp-exec';
import axios from 'axios';
import { sleep } from '../../utils/sleep';
import { getYtDlpCookiesOption } from '../../utils/ytDlpCookies';
import { subtitlesStore, type Transcript } from './subtitlesStore';
import {
    buildMediaProbe,
    selectSubtitleTrack,
    type MediaProbe,
} from '../../media/mediaProbe';

export const MAX_RETRIES = 3;
export const BASE_RETRY_DELAY_MS = 500;

export type SubtitlesErrorCode = 'NO_SUBTITLES' | 'SUBTITLES_FETCH_FAILED';

export class SubtitlesError extends Error {
    constructor(
        public code: SubtitlesErrorCode,
        message: string,
        public details?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'SubtitlesError';
    }
}

function isRateLimitError(err: unknown): boolean {
    return err instanceof Error && err.message.includes('429');
}

export function computeBackoffDelayMs(attempt: number): number {
    return BASE_RETRY_DELAY_MS * 2 ** (attempt - 1);
}

async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (!isRateLimitError(err) || attempt === MAX_RETRIES) {
                break;
            }
            await sleep(computeBackoffDelayMs(attempt));
        }
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new SubtitlesError('SUBTITLES_FETCH_FAILED', 'Не удалось получить субтитры', {
        reason: message,
    });
}

function stripVttMarkup(raw: string): string {
    return raw
        .replace(/WEBVTT[^\n]*\n/g, '')
        .replace(/^\d+\n/gm, '')
        .replace(/\d{2}:\d{2}:\d{2}[.,]\d{3} --> [^\n]+/g, '')
        .replace(/<[^>]+>/g, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{2,}/g, '\n')
        .trim();
}


async function findSubtitleTrack(
    sourceUrl: string
): Promise<{ url: string; language: 'ru' | 'en' } | null> {
    const raw = await ytDlp(sourceUrl, {
        dumpSingleJson: true,
        noWarnings: true,
        noCheckCertificates: true,
        skipDownload: true,
        ...getYtDlpCookiesOption(),
    });

    return selectSubtitleTrack(buildMediaProbe(raw).subtitleTracks);
}

export async function fetchSubtitles(
    sourceUrl: string,
    videoId: string,
    mediaProbe?: MediaProbe
): Promise<Transcript> {
    const track = mediaProbe
        ? selectSubtitleTrack(mediaProbe.subtitleTracks)
        : await withRateLimitRetry(() => findSubtitleTrack(sourceUrl));

    if (!track) {
        throw new SubtitlesError('NO_SUBTITLES', 'Субтитры недоступны', { source_url: sourceUrl });
    }

    const rawText = await withRateLimitRetry(async () => {
        const response = await axios.get<string>(track.url, { responseType: 'text' });
        return response.data;
    });

    const transcriptText = stripVttMarkup(rawText);
    if (!transcriptText) {
        throw new SubtitlesError('NO_SUBTITLES', 'Субтитры недоступны', { source_url: sourceUrl });
    }

    const transcript: Transcript = {
        video_id: videoId,
        language: track.language,
        transcript_text: transcriptText,
        fetched_at: new Date().toISOString(),
    };

    await subtitlesStore.save(transcript);

    return transcript;
}
