import type { ApiRecipeData } from "../components/features/recipe/recipe";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "http://localhost:8000/v1" : "/v1");

export type JobStatus =
    | "scanning"
    | "transcribing"
    | "llm_processing"
    | "generating_pdf"
    | "completed"
    | "failed"
    | "cancelled";

export interface RecipeJobResponse {
    job_id: string;
    status: JobStatus;
    canonical_key: string;
    source_url: string;
    created_at: string;
    data?: ApiRecipeData;
    pdf_url?: string;
    error?: { code: string; message: string; details?: Record<string, unknown> };
}

export class RecipeApiError extends Error {
    constructor(
        public code: string,
        message: string,
        public details?: Record<string, unknown>
    ) {
        super(message);
        this.name = "RecipeApiError";
    }
}

function resolvePdfUrl(body: RecipeJobResponse): void {
    if (body.pdf_url && /^https?:\/\//.test(BASE_URL)) {
        body.pdf_url = new URL(body.pdf_url, BASE_URL).href;
    }
}

export async function createRecipeJob(sourceUrl: string): Promise<RecipeJobResponse> {
    const response = await fetch(`${BASE_URL}/recipes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_url: sourceUrl }),
    });

    if (response.status === 202) {
        return response.json();
    }

    const body = await response.json().catch(() => null);
    const code = body?.error?.code ?? "INTERNAL_SERVER_ERROR";
    const message = body?.error?.message ?? "Внутренняя ошибка сервера";
    throw new RecipeApiError(code, message, body?.error?.details);
}

export async function getRecipeJob(jobId: string): Promise<RecipeJobResponse> {
    const response = await fetch(`${BASE_URL}/recipes/${jobId}`);

    if (response.ok) {
        const body: RecipeJobResponse = await response.json();
        resolvePdfUrl(body);
        return body;
    }

    const body = await response.json().catch(() => null);
    const code = body?.error?.code ?? "INTERNAL_SERVER_ERROR";
    const message = body?.error?.message ?? "Внутренняя ошибка сервера";
    throw new RecipeApiError(code, message, body?.error?.details);
}

const POLL_INTERVAL_MS = 2000;

export async function pollRecipeJob(
    jobId: string,
    onStatusChange?: (status: JobStatus) => void
): Promise<RecipeJobResponse> {
    for (;;) {
        const job = await getRecipeJob(jobId);
        console.log(`[poll] job ${jobId}: ${job.status}`);
        onStatusChange?.(job.status);

        if (job.status === "completed") {
            return job;
        }
        if (job.status === "failed") {
            throw new RecipeApiError(
                job.error?.code ?? "INTERNAL_SERVER_ERROR",
                job.error?.message ?? "Внутренняя ошибка сервера"
            );
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
}