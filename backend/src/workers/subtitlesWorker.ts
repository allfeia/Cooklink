import { recipeJobStore } from '../routes/recipeJobStore';
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
    let transcript: Transcript;
    try {
        transcript = await fetchSubtitles(sourceUrl, videoId, mediaProbe);
    } catch (err) {
        console.error('fetchSubtitles failed:', err);
        const code = err instanceof SubtitlesError ? err.code : 'INTERNAL_SERVER_ERROR';
        const message = err instanceof Error ? err.message : 'Внутренняя ошибка сервера';
        await recipeJobStore.markFailed(jobId, code, message);
        throw err;
    }
    console.log('fetchSubtitles:', transcript);
    await recipeJobStore.updateStatus(jobId, 'llm_processing');

    return transcript;
}
