import 'dotenv/config';
import { createWorkerApp, sendError, withCatchAll } from './httpServerUtils';
import { runRecipeExtraction, LlmExtractionError } from '../workers/llmWorker';
import { recipeJobStore } from '../routes/recipeJobStore';

const MOCK_RECIPE = {
    title: 'Паста Карбонара',
    type: 'Горячее',
    cooking_time_minutes: 20,
    nutrition_per_100g: { calories: 320, protein: 14, fat: 18, carbs: 28 },
    portions: 2,
    ingredients: [
        { name: 'Спагетти', quantity: '200', unit: 'г' },
        { name: 'Гуанчале', quantity: '100', unit: 'г' },
        { name: 'Яйца', quantity: '2', unit: 'шт' },
        { name: 'Пармезан', quantity: '50', unit: 'г' },
        { name: 'Чёрный перец', quantity: 'по вкусу', unit: '' },
    ],
    steps: [
        { step_number: 1, description: 'Отварите спагетти в подсолёной воде до состояния аль денте.' },
        { step_number: 2, description: 'Обжарьте гуанчале на сухой сковороде до хрустящей корочки.' },
        { step_number: 3, description: 'Смешайте яйца с тёртым пармезаном и щедро поперчите.' },
        { step_number: 4, description: 'Соедините горячие спагетти с гуанчале, снимите с огня.' },
        { step_number: 5, description: 'Добавьте яично-сырную смесь, быстро перемешайте. Подавайте сразу.' },
    ],
};

export const app = createWorkerApp();

app.post('/extract-mock', async (req, res) => {
    const { jobId } = req.body as { jobId: string };
    const delayMs = parseInt(process.env.LLM_MOCK_DELAY_MS ?? '0', 10);
    if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
    await recipeJobStore.updateStatus(jobId, 'generating_pdf');
    res.status(200).json({ recipe: MOCK_RECIPE });
});

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
            sendError(res, err.code === 'LLM_RATE_LIMITED' ? 429 : 422, err);
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
