export type JobStatus =
    | 'scanning'    // получение метаданных видео
    | 'downloading' // скачивание аудиофайла по ссылке
    | 'transcribing' // получение/генерация транскрипции
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
    created_at: string;        // ISO 8601 timestamp
}

export interface RecipeJobRepository {
    create(job: RecipeJob): Promise<void>;
}

export class InMemoryRecipeJobRepository implements RecipeJobRepository {
    private jobsById = new Map<string, RecipeJob>();
    private jobIdByCanonicalKey = new Map<string, string>();

    async create(job: RecipeJob): Promise<void> {
        this.jobsById.set(job.job_id, job);
        this.jobIdByCanonicalKey.set(job.canonical_key, job.job_id);
    }
}

export const recipeJobStore: RecipeJobRepository = new InMemoryRecipeJobRepository();