import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { jobs } from '../db/schema';

export type JobStatus =
    | 'scanning'    // получение метаданных видео
    | 'transcribing' // генерация транскрипции
    | 'llm_processing' // извлечение рецепта через LLM
    | 'generating_pdf' // генерация PDF
    | 'completed'    // успешно завершено
    | 'failed'       // ошибка
    | 'cancelled';   // отменено пользователем


export interface RecipeJob {
    job_id: string;            // UUID v4
    source_url: string;        // URL
    canonical_key: string;     // составной ключ видео из домена + id видео
    status: JobStatus;
    error_code?: string;       // присутствует только если status === 'failed'
    error_message?: string;    // описание ошибки
    created_at: string;        // ISO 8601 timestamp
}

export interface RecipeJobRepository {
    create(job: RecipeJob): Promise<void>;
    updateStatus(jobId: string, status: JobStatus): Promise<void>;
    markFailed(jobId: string, errorCode: string, errorMessage: string): Promise<void>;
    findById(jobId: string): Promise<RecipeJob | undefined>;
}

export class InMemoryRecipeJobRepository implements RecipeJobRepository {
    private jobsById = new Map<string, RecipeJob>();
    private jobIdByCanonicalKey = new Map<string, string>();

    async create(job: RecipeJob): Promise<void> {
        this.jobsById.set(job.job_id, job);
        this.jobIdByCanonicalKey.set(job.canonical_key, job.job_id);
    }

    async updateStatus(jobId: string, status: JobStatus): Promise<void> {
        const job = this.jobsById.get(jobId);
        if (!job) {
            throw new Error(`Job not found: ${jobId}`);
        }
        job.status = status;
    }

    async markFailed(jobId: string, errorCode: string, errorMessage: string): Promise<void> {
        const job = this.jobsById.get(jobId);
        if (!job) {
            throw new Error(`Job not found: ${jobId}`);
        }
        job.status = 'failed';
        job.error_code = errorCode;
        job.error_message = errorMessage;
    }

    async findById(jobId: string): Promise<RecipeJob | undefined> {
        return this.jobsById.get(jobId);
    }
}

function toDomain(row: typeof jobs.$inferSelect): RecipeJob {
    return {
        job_id: row.id,
        source_url: row.sourceUrl,
        canonical_key: row.canonicalKey,
        status: row.status as JobStatus,
        error_code: row.errorCode ?? undefined,
        error_message: row.errorMessage ?? undefined,
        created_at: row.createdAt.toISOString(),
    };
}

export class PostgresRecipeJobRepository implements RecipeJobRepository {
    async create(job: RecipeJob): Promise<void> {
        await db.insert(jobs).values({
            id: job.job_id,
            sourceUrl: job.source_url,
            canonicalKey: job.canonical_key,
            status: job.status,
            errorCode: job.error_code,
            errorMessage: job.error_message,
            createdAt: new Date(job.created_at),
        });
    }

    async updateStatus(jobId: string, status: JobStatus): Promise<void> {
        const result = await db.update(jobs).set({ status }).where(eq(jobs.id, jobId)).returning({ id: jobs.id });
        if (result.length === 0) {
            throw new Error(`Job not found: ${jobId}`);
        }
    }

    async markFailed(jobId: string, errorCode: string, errorMessage: string): Promise<void> {
        const result = await db
            .update(jobs)
            .set({ status: 'failed', errorCode, errorMessage })
            .where(eq(jobs.id, jobId))
            .returning({ id: jobs.id });
        if (result.length === 0) {
            throw new Error(`Job not found: ${jobId}`);
        }
    }

    async findById(jobId: string): Promise<RecipeJob | undefined> {
        const [row] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
        return row ? toDomain(row) : undefined;
    }
}

export const recipeJobStore: RecipeJobRepository = new PostgresRecipeJobRepository();
