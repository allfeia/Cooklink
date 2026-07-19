import { Router } from 'express';
import { randomUUID } from 'crypto';
import { parseVideoUrl } from '../../../common/validation/validatePipeline';
import { recipeJobStore, type RecipeJob } from './recipeJobStore';

const router = Router();

router.post('/recipes', async (req, res) => {
    const { source_url } = req.body;

    const parsed = parseVideoUrl(source_url);
    if (!parsed) {
        return res.status(400).json({
            error: {
                code: 'INVALID_URL',
                message: 'Неверный формат ссылки',
                details: { source_url },
            },
        });
    }

    // TODO (следующий спринт): поиск по canonical_key в Redis/Postgres —
    // если найден существующий job, вернуть его без создания нового.
    // Пока пропускаем, job создаётся сразу.

    const job: RecipeJob = {
        job_id: randomUUID(),
        source_url: parsed.sourceUrl,
        canonical_key: parsed.canonicalKey,
        status: 'scanning',
        created_at: new Date().toISOString(),
    };

    await recipeJobStore.create(job);

    return res.status(202).json(job);
});

export default router;