import type { ApiRecipeData } from "../components/features/recipe/recipe";

// В проде фронт отдаётся через nginx на том же origin, что и API (см. nginx.conf,
// проксирует /v1 на backend) — относительный путь работает без какой-либо настройки.
// В деве (vite dev server на 5173) бэкенд крутится отдельно на 8000 — нужен абсолютный URL.
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "http://localhost:8000/v1" : "/v1");

export interface CreateRecipeJobResponse {
    job_id: string;
    status: string;
    canonical_key: string;
    source_url: string;
    created_at: string;
    data?: ApiRecipeData;
    pdf_url?: string;
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
        const body: CreateRecipeJobResponse = await response.json();
        // pdf_url приходит с сервера уже как абсолютный путь ("/v1/recipes/{id}/pdf").
        // Достраиваем до полного URL только если BASE_URL сам абсолютный (дев-режим,
        // отдельный порт) — new URL() не принимает относительную строку как base.
        if (body.pdf_url && /^https?:\/\//.test(BASE_URL)) {
            body.pdf_url = new URL(body.pdf_url, BASE_URL).href;
        }
        return body;
    }

    const body = await response.json().catch(() => null);
    const code = body?.error?.code ?? "INTERNAL_SERVER_ERROR";
    const message = body?.error?.message ?? "Внутренняя ошибка сервера";
    throw new RecipeApiError(code, message, body?.error?.details);
}