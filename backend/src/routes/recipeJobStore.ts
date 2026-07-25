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

export const recipeJobStore: RecipeJobRepository = new InMemoryRecipeJobRepository();