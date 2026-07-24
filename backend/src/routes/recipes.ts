import { Router } from 'express';
import { randomUUID } from 'crypto';
import { parseVideoUrl } from '../../../common/validation/validatePipeline';
import { recipeJobStore, type RecipeJob } from './recipeJobStore';
import { runMetadataCheck, MetadataError } from '../workers/metadataWorker';
import { runSubtitlesAndExtraction, SubtitlesError, LlmExtractionError } from '../workers/subtitlesWorker';

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

    try {
        await runMetadataCheck(job.job_id, parsed.sourceUrl, parsed.videoId, parsed.platform);
    } catch (err) {
        if (err instanceof MetadataError) {
            return res.status(400).json({
                error: {
                    code: err.code,
                    message: err.message,
                    details: err.details,
                }
            })
        }
        throw err;
    }

    let recipe;
    try {
        recipe = await runSubtitlesAndExtraction(job.job_id, parsed.sourceUrl, parsed.videoId);
    } catch (err) {
        if (err instanceof SubtitlesError) {
            return res.status(400).json({
                error: {
                    code: err.code,
                    message: err.message,
                    details: err.details,
                }
            })
        }
        if (err instanceof LlmExtractionError) {
            return res.status(422).json({
                error: {
                    code: err.code,
                    message: err.message,
                    details: err.details,
                }
            })
        }
        throw err;
    }

    await recipeJobStore.updateStatus(job.job_id, 'completed');

    return res.status(202).json({ ...job, data: recipe });
});

export default router;