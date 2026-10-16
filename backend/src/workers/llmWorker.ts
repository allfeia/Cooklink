import { recipeJobStore } from '../routes/recipeJobStore';
import { logger } from '../logging/logger';
import { extractRecipe, LlmExtractionError } from '../routes/llm/llmService';
import type { RecipeData } from '../routes/recipe/recipeStore';

export { LlmExtractionError };
export type { LlmErrorCode } from '../routes/llm/llmService';

export async function runRecipeExtraction(
    jobId: string,
    transcriptText: string,
    canonicalKey: string
): Promise<RecipeData> {
    const log = logger.child({ job_id: jobId });
    let recipe: RecipeData;
    try {
        recipe = await extractRecipe(transcriptText, canonicalKey, log);
    } catch (err) {
        log.error({ err, stage: 'llm' }, 'extractRecipe failed');
        const code = err instanceof LlmExtractionError ? err.code : 'INTERNAL_SERVER_ERROR';
        const message = err instanceof Error ? err.message : 'Внутренняя ошибка сервера';
        await recipeJobStore.markFailed(jobId, code, message);
        throw err;
    }
    log.info({ stage: 'llm', ingredients: recipe.ingredients.length, steps: recipe.steps.length }, 'recipe extracted');
    await recipeJobStore.updateStatus(jobId, 'generating_pdf');

    return recipe;
}
