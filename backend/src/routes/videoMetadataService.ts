import ytDlp from 'yt-dlp-exec';
import type { Platform } from '../../../common/validation/domainDetection';
import { videoMetadataStore, type VideoMetadata } from './videoMetadataStore';

export const MAX_DURATION_SEC = 900; // 15 минут

export type MetadataErrorCode = 'VIDEO_UNAVAILABLE' | 'VIDEO_TOO_LONG' | 'VIDEO_NO_AUDIO';

export class MetadataError extends Error {
    constructor(
        public code: MetadataErrorCode,
        message: string,
        public details?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'MetadataError';
    }
}

async function fetchRawMetadata(sourceUrl: string) {
    try {
        const raw = await ytDlp(sourceUrl, {
            dumpSingleJson: true,
            noWarnings: true,
            noCheckCertificates: true,
            skipDownload: true,
        });
        return raw;
    } catch (err) {
        // console.log('yt-dlp call failed:', err);
        const message = err instanceof Error ? err.message : String(err);
        throw new MetadataError('VIDEO_UNAVAILABLE', 'Видео недоступно', {
            source_url: sourceUrl,
            reason: message,
        });
    }
}


function validateMetadata(sourceUrl: string, raw: Awaited<ReturnType<typeof fetchRawMetadata>>): void {
    if (raw.availability !== 'public' && raw.availability !== 'unlisted') {
        throw new MetadataError('VIDEO_UNAVAILABLE', 'Видео недоступно', {
            source_url: sourceUrl,
        });
    }

    if (raw.duration > MAX_DURATION_SEC) {
        throw new MetadataError('VIDEO_TOO_LONG', 'Длительность видео превышает лимит в 15 минут', {
            video_duration_sec: raw.duration,
            max_duration_sec: MAX_DURATION_SEC,
            source_url: sourceUrl,
        });
    }

    if (raw.has_audio === false) {
        throw new MetadataError('VIDEO_NO_AUDIO', 'В видео отсутствует аудио', {
            source_url: sourceUrl,
        });
    }
}

export async function checkVideoMetadata(
    sourceUrl: string,
    videoId: string,
    platform: Platform
): Promise<VideoMetadata> {
    const raw = await fetchRawMetadata(sourceUrl);
    validateMetadata(sourceUrl, raw);

    const metadata: VideoMetadata = {
        video_id: videoId,
        platform,
        title: raw.title,
        channel_name: raw.channel,
        duration_seconds: raw.duration,
        fetched_at: new Date().toISOString(),
    };

    await videoMetadataStore.save(metadata);

    return metadata;
}