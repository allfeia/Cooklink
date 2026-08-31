import { Router } from 'express';
import { randomUUID } from 'crypto';
import { parseVideoUrl, type ValidVideoUrl } from '../../../../common/validation/validatePipeline';
import { recipeJobStore, type RecipeJob } from '../recipeJobStore';
import { pdfStore } from '../pdf/pdfStore';
import { recipeStore, type RecipeData } from '../recipe/recipeStore';
import type { Transcript } from '../subtitles/subtitlesStore';
import {
    jobsCreatedTotal,
    jobsCompletedTotal,
    pipelineFailuresTotal,
    llmRateLimitTotal,
    pdfDownloadsTotal,
    pipelineDurationSeconds,
} from '../../metrics';

const METADATA_WORKER_URL = process.env.METADATA_WORKER_URL ?? 'http://localhost:4001';
const SUBTITLES_WORKER_URL = process.env.SUBTITLES_WORKER_URL ?? 'http://localhost:4002';
const LLM_WORKER_URL = process.env.LLM_WORKER_URL ?? 'http://localhost:4003';
const LLM_EXTRACT_PATH = process.env.LLM_EXTRACT_PATH ?? '/extract';
const PDF_WORKER_URL = process.env.PDF_WORKER_URL ?? 'http://localhost:4004';

const router = Router();

interface WorkerErrorBody {
    error: { code: string; message: string; details?: Record<string, unknown> };
}

async function isCancelled(jobId: string): Promise<boolean> {
    const current = await recipeJobStore.findById(jobId);
    return current?.status === 'cancelled';
}

async function generatePdfOnly(job: RecipeJob, recipe: RecipeData): Promise<void> {
    const endTimer = pipelineDurationSeconds.startTimer();
    console.log(`[pipeline] job ${job.job_id}: generating_pdf (cached recipe)`);
    const pdfRes = await fetch(`${PDF_WORKER_URL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe }),
    });
    if (!pdfRes.ok) {
        const body = (await pdfRes.json()) as WorkerErrorBody;
        await recipeJobStore.markFailed(job.job_id, body.error.code, body.error.message);
        console.error(`[pipeline] job ${job.job_id}: failed at pdf (${body.error.code})`);
        pipelineFailuresTotal.inc({ stage: 'pdf' });
        jobsCompletedTotal.inc({ status: 'failed' });
        endTimer({ status: 'failed' });
        return;
    }
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
    await pdfStore.save(job.job_id, pdfBuffer);
    await recipeJobStore.updateStatus(job.job_id, 'completed');
    console.log(`[pipeline] job ${job.job_id}: completed (cached recipe)`);
    jobsCompletedTotal.inc({ status: 'completed' });
    endTimer({ status: 'completed' });
}

async function runPipeline(job: RecipeJob, parsed: ValidVideoUrl): Promise<void> {
    const pipelineStart = Date.now();
    const endTimer = pipelineDurationSeconds.startTimer();
    const t = () => `+${((Date.now() - pipelineStart) / 1000).toFixed(1)}s`;

    const failAt = (stage: string, errorCode: string) => {
        pipelineFailuresTotal.inc({ stage });
        if (errorCode === 'LLM_RATE_LIMITED') llmRateLimitTotal.inc();
        jobsCompletedTotal.inc({ status: 'failed' });
        endTimer({ status: 'failed' });
    };

    console.log(`[pipeline] job ${job.job_id}: scanning`);

    // метаданные
    const metaStart = Date.now();
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
        console.error(`[pipeline] job ${job.job_id}: failed at metadata (${body.error.code}) ${t()}`);
        failAt('metadata', body.error.code);
        return;
    }
    console.log(`[pipeline] job ${job.job_id}: metadata done in ${Date.now() - metaStart}ms ${t()}`);

    if (await isCancelled(job.job_id)) {
        console.log(`[pipeline] job ${job.job_id}: cancelled before subtitles`);
        jobsCompletedTotal.inc({ status: 'cancelled' });
        endTimer({ status: 'failed' });
        return;
    }

    // субтитры
    console.log(`[pipeline] job ${job.job_id}: transcribing`);
    const subStart = Date.now();
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
        console.error(`[pipeline] job ${job.job_id}: failed at subtitles (${body.error.code}) ${t()}`);
        failAt('subtitles', body.error.code);
        return;
    }
    const { transcript } = (await subRes.json()) as { transcript: Transcript };
    console.log(`[pipeline] job ${job.job_id}: subtitles done in ${Date.now() - subStart}ms ${t()}`);

    if (await isCancelled(job.job_id)) {
        console.log(`[pipeline] job ${job.job_id}: cancelled before llm`);
        jobsCompletedTotal.inc({ status: 'cancelled' });
        endTimer({ status: 'failed' });
        return;
    }

    // извлечение рецепта через LLM
    console.log(`[pipeline] job ${job.job_id}: llm_processing`);
    const llmStart = Date.now();
    const llmRes = await fetch(`${LLM_WORKER_URL}${LLM_EXTRACT_PATH}`, {
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
        console.error(`[pipeline] job ${job.job_id}: failed at llm (${body.error.code}) ${t()}`);
        failAt('llm', body.error.code);
        return;
    }
    const { recipe } = (await llmRes.json()) as { recipe: RecipeData };
    console.log(`[pipeline] job ${job.job_id}: llm done in ${Date.now() - llmStart}ms ${t()}`);

    if (await isCancelled(job.job_id)) {
        console.log(`[pipeline] job ${job.job_id}: cancelled before pdf`);
        jobsCompletedTotal.inc({ status: 'cancelled' });
        endTimer({ status: 'failed' });
        return;
    }

    // генерация PDF
    console.log(`[pipeline] job ${job.job_id}: generating_pdf`);
    const pdfStart = Date.now();
    const pdfRes = await fetch(`${PDF_WORKER_URL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe }),
    });
    if (!pdfRes.ok) {
        const body = (await pdfRes.json()) as WorkerErrorBody;
        await recipeJobStore.markFailed(job.job_id, body.error.code, body.error.message);
        console.error(`[pipeline] job ${job.job_id}: failed at pdf (${body.error.code}) ${t()}`);
        failAt('pdf', body.error.code);
        return;
    }
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
    await pdfStore.save(job.job_id, pdfBuffer);
    await recipeJobStore.updateStatus(job.job_id, 'completed');
    console.log(`[pipeline] job ${job.job_id}: pdf done in ${Date.now() - pdfStart}ms ${t()}`);
    console.log(`[pipeline] job ${job.job_id}: completed — total ${Date.now() - pipelineStart}ms`);
    jobsCompletedTotal.inc({ status: 'completed' });
    endTimer({ status: 'completed' });
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

    const cachedRecipe = await recipeStore.get(parsed.canonicalKey);

    const job: RecipeJob = {
        job_id: randomUUID(),
        source_url: parsed.sourceUrl,
        canonical_key: parsed.canonicalKey,
        status: cachedRecipe ? 'generating_pdf' : 'scanning',
        created_at: new Date().toISOString(),
    };

    await recipeJobStore.create(job);
    jobsCreatedTotal.inc({ cache: cachedRecipe ? 'hit' : 'miss' });
    res.status(202).json(job);

    if (cachedRecipe) {
        generatePdfOnly(job, cachedRecipe).catch((err) => {
            console.error(`[pipeline] job ${job.job_id}: crashed at pdf (cached)`, err);
        });
    } else {
        runPipeline(job, parsed).catch((err) => {
            console.error(`[pipeline] job ${job.job_id}: crashed unexpectedly`, err);
        });
    }
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

router.post('/recipes/:job_id/cancel', async (req, res) => {
    const job = await recipeJobStore.findById(req.params.job_id);
    if (!job) {
        return res.status(404).json({
            error: { code: 'JOB_NOT_FOUND', message: 'Задача с указанным идентификатором не найдена' },
        });
    }

    const wasCancelled = await recipeJobStore.cancel(job.job_id);
    if (wasCancelled) {
        console.log(`[pipeline] job ${job.job_id}: cancel requested`);
        jobsCompletedTotal.inc({ status: 'cancelled' });
    }

    const updated = await recipeJobStore.findById(job.job_id);
    return res.status(200).json(updated);
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

    pdfDownloadsTotal.inc();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${job.job_id}.pdf"`);
    return res.send(pdf);
});

export default router;
