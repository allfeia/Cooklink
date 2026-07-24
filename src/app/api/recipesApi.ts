import type { ApiRecipeData } from "../components/features/recipe/recipe";

const BASE_URL = import.meta.env.API_BASE_URL ?? "http://localhost:8000/v1";

export interface CreateRecipeJobResponse {
    job_id: string;
    status: string;
    canonical_key: string;
    source_url: string;
    created_at: string;
    data?: ApiRecipeData;
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

export async function createRecipeJob(sourceUrl: string): Promise<CreateRecipeJobResponse> {
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