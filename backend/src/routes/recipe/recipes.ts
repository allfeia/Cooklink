import { Router } from 'express';
import { randomUUID } from 'crypto';
import { parseVideoUrl } from '../../../../common/validation/validatePipeline';
import { recipeJobStore, type RecipeJob } from '../recipeJobStore';
import { runMetadataCheck, MetadataError } from '../../workers/metadataWorker';
import { runSubtitlesAndExtraction, SubtitlesError, LlmExtractionError } from '../../workers/subtitlesWorker';
import { runPdfGeneration, PdfGenerationError } from '../../workers/pdfWorker';
import { pdfStore } from '../pdf/pdfStore';

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

    try {
        await runPdfGeneration(job.job_id, recipe);
    } catch (err) {
        if (err instanceof PdfGenerationError) {
            return res.status(500).json({
                error: {
                    code: err.code,
                    message: err.message,
                    details: err.details,
                }
            })
        }
        throw err;
    }

    return res.status(202).json({ ...job, data: recipe, pdf_url: `/v1/recipes/${job.job_id}/pdf` });
});

router.get('/recipes/:job_id/pdf', async (req, res) => {
    const job = await recipeJobStore.findById(req.params.job_id);
    if (!job) {
        return res.status(404).json({
            error: { code: 'JOB_NOT_FOUND', message: 'Задача с указанным идентификатором не найдена' },
        });
    }

    const pdf = await pdfStore.get(job.job_id);
    if (!pdf) {
        return res.status(404).json({
            error: { code: 'PDF_NOT_READY', message: 'PDF ещё не готов. Проверьте статус задачи.' },
        });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${job.job_id}.pdf"`);
    return res.send(pdf);
});

export default router;