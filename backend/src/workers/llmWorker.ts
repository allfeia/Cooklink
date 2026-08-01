import { recipeJobStore } from '../routes/recipeJobStore';
import { extractRecipe, LlmExtractionError } from '../routes/llm/llmService';
import type { RecipeData } from '../routes/recipe/recipeStore';

export { LlmExtractionError };
export type { LlmErrorCode } from '../routes/llm/llmService';

export async function runRecipeExtraction(
    jobId: string,
    transcriptText: string,
    canonicalKey: string
): Promise<RecipeData> {
    let recipe: RecipeData;
    try {
        recipe = await extractRecipe(transcriptText, canonicalKey);
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
