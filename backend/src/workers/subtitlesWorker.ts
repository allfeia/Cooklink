import { recipeJobStore } from '../routes/recipeJobStore';
import { fetchSubtitles, SubtitlesError } from '../routes/subtitles/subtitlesService';
import type { Transcript } from '../routes/subtitles/subtitlesStore';
import { extractRecipe, LlmExtractionError } from '../routes/llm/llmService';
import type { RecipeData } from '../routes/recipe/recipeStore';

export { SubtitlesError, LlmExtractionError };
export type { SubtitlesErrorCode } from '../routes/subtitles/subtitlesService';
export type { LlmErrorCode } from '../routes/llm/llmService';

export async function runSubtitlesAndExtraction(
    jobId: string,
    sourceUrl: string,
    videoId: string
): Promise<RecipeData> {
    let transcript: Transcript;
    try {
        transcript = await fetchSubtitles(sourceUrl, videoId);
    } catch (err) {
        console.error('fetchSubtitles failed:', err);
        const code = err instanceof SubtitlesError ? err.code : 'INTERNAL_SERVER_ERROR';
        const message = err instanceof Error ? err.message : 'Внутренняя ошибка сервера';
        await recipeJobStore.markFailed(jobId, code, message);
        throw err;
    }
    console.log('fetchSubtitles:', transcript);
    await recipeJobStore.updateStatus(jobId, 'llm_processing');

    let recipe: RecipeData;
    try {
        recipe = await extractRecipe(transcript.transcript_text, videoId);
    } catch (err) {
        console.error('extractRecipe failed:', err);
        const code = err instanceof LlmExtractionError ? err.code : 'INTERNAL_SERVER_ERROR';
        const message = err instanceof Error ? err.message : 'Внутренняя ошибка сервера';
        await recipeJobStore.markFailed(jobId, code, message);
        throw err;
    }
    console.log('extractRecipe:', recipe);
    await recipeJobStore.updateStatus(jobId, 'generating_pdf');

    return recipe;
}
