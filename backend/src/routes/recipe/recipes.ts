import { Router } from 'express';
import { randomUUID } from 'crypto';
import { parseVideoUrl, type ValidVideoUrl } from '../../../../common/validation/validatePipeline';
import { recipeJobStore, type RecipeJob } from '../recipeJobStore';
import { pdfStore } from '../pdf/pdfStore';
import { recipeStore, type RecipeData } from '../recipe/recipeStore';
import type { Transcript } from '../subtitles/subtitlesStore';

const METADATA_WORKER_URL = process.env.METADATA_WORKER_URL ?? 'http://localhost:4001';
const SUBTITLES_WORKER_URL = process.env.SUBTITLES_WORKER_URL ?? 'http://localhost:4002';
const LLM_WORKER_URL = process.env.LLM_WORKER_URL ?? 'http://localhost:4003';
const PDF_WORKER_URL = process.env.PDF_WORKER_URL ?? 'http://localhost:4004';

const router = Router();

interface WorkerErrorBody {
    error: { code: string; message: string; details?: Record<string, unknown> };
}

async function runPipeline(job: RecipeJob, parsed: ValidVideoUrl): Promise<void> {
    console.log(`[pipeline] job ${job.job_id}: scanning`);

    // метаданные
    const metaRes = await fetch(`${METADATA_WORKER_URL}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jobId: job.job_id,
            sourceUrl: parsed.sourceUrl,
            videoId: parsed.videoId,
            platform: parsed.platform,
        }),
    });
    if (!metaRes.ok) {
        const body = (await metaRes.json()) as WorkerErrorBody;
        console.error(`[pipeline] job ${job.job_id}: failed at metadata (${body.error.code})`);
        return;
    }

    // субтитры
    console.log(`[pipeline] job ${job.job_id}: transcribing`);
    const subRes = await fetch(`${SUBTITLES_WORKER_URL}/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jobId: job.job_id,
            sourceUrl: parsed.sourceUrl,
            videoId: parsed.videoId,
        }),
    });
    if (!subRes.ok) {
        const body = (await subRes.json()) as WorkerErrorBody;
        console.error(`[pipeline] job ${job.job_id}: failed at subtitles (${body.error.code})`);
        return;
    }
    const { transcript } = (await subRes.json()) as { transcript: Transcript };

    // извлечение рецепта через LLM
    console.log(`[pipeline] job ${job.job_id}: llm_processing`);
    const llmRes = await fetch(`${LLM_WORKER_URL}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jobId: job.job_id,
            transcriptText: transcript.transcript_text,
            canonicalKey: parsed.canonicalKey,
        }),
    });
    if (!llmRes.ok) {
        const body = (await llmRes.json()) as WorkerErrorBody;
        console.error(`[pipeline] job ${job.job_id}: failed at llm (${body.error.code})`);
        return;
    }
    const { recipe } = (await llmRes.json()) as { recipe: RecipeData };

    // генерация PDF
    console.log(`[pipeline] job ${job.job_id}: generating_pdf`);
    const pdfRes = await fetch(`${PDF_WORKER_URL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe }),
    });
    if (!pdfRes.ok) {
        const body = (await pdfRes.json()) as WorkerErrorBody;
        await recipeJobStore.markFailed(job.job_id, body.error.code, body.error.message);
        console.error(`[pipeline] job ${job.job_id}: failed at pdf (${body.error.code})`);
        return;
    }
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
    await pdfStore.save(job.job_id, pdfBuffer);
    await recipeJobStore.updateStatus(job.job_id, 'completed');
    console.log(`[pipeline] job ${job.job_id}: completed`);
}

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
    res.status(202).json(job);

    runPipeline(job, parsed).catch((err) => {
        console.error(`[pipeline] job ${job.job_id}: crashed unexpectedly`, err);
    });
});

router.get('/recipes/:job_id', async (req, res) => {
    const job = await recipeJobStore.findById(req.params.job_id);
    if (!job) {
        return res.status(404).json({
            error: { code: 'JOB_NOT_FOUND', message: 'Задача с указанным идентификатором не найдена' },
        });
    }

    if (job.status === 'failed') {
        return res.status(200).json({
            ...job,
            error: { code: job.error_code, message: job.error_message },
        });
    }

    if (job.status === 'completed') {
        const recipe = await recipeStore.get(job.canonical_key);
        return res.status(200).json({ ...job, data: recipe, pdf_url: `/v1/recipes/${job.job_id}/pdf` });
    }

    return res.status(200).json(job);
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
