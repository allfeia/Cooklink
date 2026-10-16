import { Counter, Histogram, collectDefaultMetrics } from 'prom-client';

collectDefaultMetrics();

export const jobsCreatedTotal = new Counter({
    name: 'recipe_jobs_created_total',
    help: 'Recipe jobs created',
    labelNames: ['cache'] as const,
});

export const jobsCompletedTotal = new Counter({
    name: 'recipe_jobs_completed_total',
    help: 'Recipe jobs by final status',
    labelNames: ['status'] as const,
});

export const pipelineFailuresTotal = new Counter({
    name: 'recipe_pipeline_failures_total',
    help: 'Pipeline failures by stage',
    labelNames: ['stage'] as const,
});

export const llmRateLimitTotal = new Counter({
    name: 'recipe_llm_rate_limit_total',
    help: 'LLM rate limit errors',
});

export const pdfDownloadsTotal = new Counter({
    name: 'recipe_pdf_downloads_total',
    help: 'PDF downloads',
});

export const pipelineDurationSeconds = new Histogram({
    name: 'recipe_pipeline_duration_seconds',
    help: 'End-to-end pipeline duration in seconds',
    labelNames: ['status'] as const,
    buckets: [10, 30, 60, 90, 120, 180, 300, 600],
});


export const PIPELINE_STAGES = ['metadata', 'subtitles', 'llm', 'pdf'] as const;
for (const stage of PIPELINE_STAGES) pipelineFailuresTotal.inc({ stage }, 0);
for (const cache of ['hit', 'miss']) jobsCreatedTotal.inc({ cache }, 0);
for (const status of ['completed', 'failed', 'cancelled']) jobsCompletedTotal.inc({ status }, 0);
