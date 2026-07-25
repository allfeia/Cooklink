import { recipeJobStore } from '../routes/recipeJobStore';
import { generatePdf, PdfGenerationError } from '../routes/pdf/pdfService';
import { pdfStore } from '../routes/pdf/pdfStore';
import type { RecipeData } from '../routes/recipe/recipeStore';

export { PdfGenerationError };
export type { PdfErrorCode } from '../routes/pdf/pdfService';

export async function runPdfGeneration(jobId: string, recipe: RecipeData): Promise<void> {
    let pdf: Buffer;
    try {
        pdf = await generatePdf(recipe);
    } catch (err) {
        console.error('generatePdf failed:', err);
        const code = err instanceof PdfGenerationError ? err.code : 'INTERNAL_SERVER_ERROR';
        const message = err instanceof Error ? err.message : 'Внутренняя ошибка сервера';
        await recipeJobStore.markFailed(jobId, code, message);
        throw err;
    }
    console.log('generatePdf: ok', { job_id: jobId, bytes: pdf.length });

    await pdfStore.save(jobId, pdf);
    await recipeJobStore.updateStatus(jobId, 'completed');
}
