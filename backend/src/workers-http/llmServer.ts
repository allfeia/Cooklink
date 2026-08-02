import 'dotenv/config';
import { createWorkerApp, sendError, withCatchAll } from './httpServerUtils';
import { runRecipeExtraction, LlmExtractionError } from '../workers/llmWorker';

export const app = createWorkerApp();

app.post('/extract', async (req, res) => {
    const { jobId, transcriptText, canonicalKey } = req.body as {
        jobId: string;
        transcriptText: string;
        canonicalKey: string;
    };

    try {
        const recipe = await runRecipeExtraction(jobId, transcriptText, canonicalKey);
        res.status(200).json({ recipe });
    } catch (err) {
        if (err instanceof LlmExtractionError) {
            sendError(res, 422, err);
            return;
        }
        console.error('[llm-worker] unexpected error', err);
        sendError(res, 500, { code: 'INTERNAL_SERVER_ERROR', message: 'Внутренняя ошибка сервера' });
    }
});

withCatchAll(app);

if (require.main === module) {
    const PORT = process.env.PORT || 4003;
    app.listen(PORT, () => console.log(`llm-worker listening on port ${PORT}`));
}
