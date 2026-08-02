import 'dotenv/config';
import { createWorkerApp, sendError, withCatchAll } from './httpServerUtils';
import { generatePdf, PdfGenerationError } from '../routes/pdf/pdfService';
import type { RecipeData } from '../routes/recipe/recipeStore';

export const app = createWorkerApp();

app.post('/generate', async (req, res) => {
    const { recipe } = req.body as { recipe: RecipeData };

    try {
        const pdf = await generatePdf(recipe);
        res.status(200).type('application/pdf').send(pdf);
    } catch (err) {
        if (err instanceof PdfGenerationError) {
            sendError(res, 500, err);
            return;
        }
        console.error('[pdf-worker] unexpected error', err);
        sendError(res, 500, { code: 'INTERNAL_SERVER_ERROR', message: 'Внутренняя ошибка сервера' });
    }
});

withCatchAll(app);

if (require.main === module) {
    const PORT = process.env.PORT || 4004;
    app.listen(PORT, () => console.log(`pdf-worker listening on port ${PORT}`));
}
