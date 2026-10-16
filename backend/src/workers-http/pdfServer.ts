import 'dotenv/config';
import { createWorkerApp, sendError, withCatchAll } from './httpServerUtils';
import { logger } from '../logging/logger';
import { generatePdf, PdfGenerationError } from '../routes/pdf/pdfService';
import type { RecipeData } from '../routes/recipe/recipeStore';

export const app = createWorkerApp();

app.post('/generate', async (req, res) => {
    const { jobId, recipe } = req.body as { jobId?: string; recipe: RecipeData };
    const log = jobId ? logger.child({ job_id: jobId }) : logger;

    try {
        const pdf = await generatePdf(recipe, log);
        res.status(200).type('application/pdf').send(pdf);
    } catch (err) {
        if (err instanceof PdfGenerationError) {
            sendError(res, 500, err);
            return;
        }
        log.error({ err, error_code: 'INTERNAL_SERVER_ERROR' }, 'unexpected error');
        sendError(res, 500, { code: 'INTERNAL_SERVER_ERROR', message: 'Внутренняя ошибка сервера' });
    }
});

withCatchAll(app);

if (require.main === module) {
    const PORT = process.env.PORT || 4004;
    app.listen(PORT, () => logger.info({ port: Number(PORT) }, 'listening'));
}
