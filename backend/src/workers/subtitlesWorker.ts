import { recipeJobStore } from '../routes/recipeJobStore';
import { fetchSubtitles, SubtitlesError } from '../routes/subtitlesService';
import type { Transcript } from '../routes/subtitlesStore';

export { SubtitlesError };
export type { SubtitlesErrorCode } from '../routes/subtitlesService';

export async function runSubtitlesFetch(
    jobId: string,
    sourceUrl: string,
    videoId: string
): Promise<Transcript> {
    const transcript = await fetchSubtitles(sourceUrl, videoId);
    console.log('fetchSubtitles:', transcript);
    await recipeJobStore.updateStatus(jobId, 'llm_processing');
    return transcript;
}
