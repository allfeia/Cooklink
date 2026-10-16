import { recipeJobStore } from '../routes/recipeJobStore';
import { logger } from '../logging/logger';
import { fetchSubtitles, SubtitlesError } from '../routes/subtitles/subtitlesService';
import type { Transcript } from '../routes/subtitles/subtitlesStore';
import type { MediaProbe } from '../media/mediaProbe';

export { SubtitlesError };
export type { SubtitlesErrorCode } from '../routes/subtitles/subtitlesService';

export async function runSubtitlesFetch(
    jobId: string,
    sourceUrl: string,
    videoId: string,
    mediaProbe?: MediaProbe
): Promise<Transcript> {
    const log = logger.child({ job_id: jobId });
    let transcript: Transcript;
    try {
        transcript = await fetchSubtitles(sourceUrl, videoId, mediaProbe);
    } catch (err) {
        log.error({ err, stage: 'subtitles' }, 'fetchSubtitles failed');
        const code = err instanceof SubtitlesError ? err.code : 'INTERNAL_SERVER_ERROR';
        const message = err instanceof Error ? err.message : 'Внутренняя ошибка сервера';
        await recipeJobStore.markFailed(jobId, code, message);
        throw err;
    }
    log.info(
        { stage: 'subtitles', language: transcript.language, chars: transcript.transcript_text.length },
        'subtitles fetched',
    );
    await recipeJobStore.updateStatus(jobId, 'llm_processing');

    return transcript;
}
