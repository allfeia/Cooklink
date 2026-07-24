import { recipeJobStore } from '../routes/recipeJobStore';
import { fetchSubtitles, SubtitlesError } from '../routes/subtitlesService';
import type { Transcript } from '../routes/subtitlesStore';
import { extractRecipe, LlmExtractionError } from '../routes/llmService';
import type { RecipeData } from '../routes/recipeStore';

export { SubtitlesError, LlmExtractionError };
export type { SubtitlesErrorCode } from '../routes/subtitlesService';
export type { LlmErrorCode } from '../routes/llmService';

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
        throw err;
    }
    console.log('fetchSubtitles:', transcript);
    await recipeJobStore.updateStatus(jobId, 'llm_processing');

    let recipe: RecipeData;
    try {
        recipe = await extractRecipe(transcript.transcript_text, videoId);
    } catch (err) {
        console.error('extractRecipe failed:', err);
        throw err;
    }
    console.log('extractRecipe:', recipe);
    await recipeJobStore.updateStatus(jobId, 'generating_pdf');

    return recipe;
}
