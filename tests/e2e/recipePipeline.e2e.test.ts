import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Server } from 'http';

/**
 * Backend теперь оркестрирует пайплайн через HTTP-вызовы к 4 отдельным
 * воркер-сервисам (см. backend/src/workers-http/*) вместо прямых вызовов
 * функций в процессе. Поэтому e2e-тест сначала поднимает все 4 воркера
 * на случайных портах, прописывает их адреса в process.env и только потом
 * импортирует backend/src/app — он читает *_WORKER_URL при загрузке модуля.
 */

const { mockYtDlp, mockAxiosGet, mockSleep, mockCreate, mockFetch } = vi.hoisted(() => ({
    mockYtDlp: vi.fn(),
    mockAxiosGet: vi.fn(),
    mockSleep: vi.fn(),
    mockCreate: vi.fn(),
    mockFetch: vi.fn(),
}));

vi.mock('yt-dlp-exec', () => ({
    __esModule: true,
    default: mockYtDlp,
}));

vi.mock('axios', () => ({
    __esModule: true,
    default: { get: mockAxiosGet },
}));

vi.mock('../../backend/src/utils/sleep', () => ({
    sleep: mockSleep,
}));

vi.mock('openai', () => ({
    __esModule: true,
    default: vi.fn().mockImplementation(function () {
        return { chat: { completions: { create: mockCreate } } };
    }),
}));

vi.mock('../../backend/src/routes/recipeJobStore', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../backend/src/routes/recipeJobStore')>();
    return { ...actual, recipeJobStore: new actual.InMemoryRecipeJobRepository() };
});

vi.mock('../../backend/src/routes/metadata/videoMetadataStore', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../backend/src/routes/metadata/videoMetadataStore')>();
    return { ...actual, videoMetadataStore: new actual.InMemoryVideoMetadataRepository() };
});

vi.mock('../../backend/src/routes/subtitles/subtitlesStore', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../backend/src/routes/subtitles/subtitlesStore')>();
    return { ...actual, subtitlesStore: new actual.InMemoryTranscriptRepository() };
});

vi.mock('../../backend/src/routes/recipe/recipeStore', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../backend/src/routes/recipe/recipeStore')>();
    return { ...actual, recipeStore: new actual.InMemoryRecipeRepository() };
});

const RU_VTT = `WEBVTT

1
00:00:00.000 --> 00:00:05.000
Привет, сегодня готовим пасту карбонара. Берём двести грамм спагетти.
`;

const VALID_RECIPE_JSON = JSON.stringify({
    title: 'Паста Карбонара',
    type: 'Горячее',
    cooking_time_minutes: 20,
    nutrition_per_100g: { calories: 250, protein: 12, fat: 10, carbs: 30 },
    portions: 2,
    ingredients: [{ name: 'спагетти', quantity: 200, unit: 'г' }],
    steps: [{ step_number: 1, description: 'Отварите спагетти в подсоленной воде.' }],
});

function streamOf(text: string) {
    return {
        [Symbol.asyncIterator]: async function* () {
            yield { choices: [{ delta: { content: text } }] };
        },
    };
}

function buildRaw(overrides: Partial<{
    title: string;
    channel: string | null;
    duration: number;
    availability: string;
    has_audio: boolean;
    subtitles: Record<string, { ext: string; url: string }[]>;
    automatic_captions: Record<string, { ext: string; url: string }[]>;
}> = {}) {
    return {
        title: 'Паста Карбонара',
        channel: 'Chef Channel',
        duration: 300,
        availability: 'public',
        has_audio: true,
        subtitles: {},
        automatic_captions: {},
        ...overrides,
    };
}

async function listenOnEphemeralPort(app: import('express').Express): Promise<{ server: Server; url: string }> {
    const server: Server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    return { server, url: `http://127.0.0.1:${port}` };
}

let servers: Server[] = [];
let origin: string;
let baseUrl: string;
let realFetch: typeof fetch;

beforeAll(async () => {
    realFetch = global.fetch.bind(global);

    const metadataServer = await import('../../backend/src/workers-http/metadataServer');
    const subtitlesServer = await import('../../backend/src/workers-http/subtitlesServer');
    const llmServer = await import('../../backend/src/workers-http/llmServer');
    const pdfServer = await import('../../backend/src/workers-http/pdfServer');

    const metadata = await listenOnEphemeralPort(metadataServer.app);
    const subtitles = await listenOnEphemeralPort(subtitlesServer.app);
    const llm = await listenOnEphemeralPort(llmServer.app);
    const pdf = await listenOnEphemeralPort(pdfServer.app);

    process.env.METADATA_WORKER_URL = metadata.url;
    process.env.SUBTITLES_WORKER_URL = subtitles.url;
    process.env.LLM_WORKER_URL = llm.url;
    process.env.PDF_WORKER_URL = pdf.url;

    const { default: app } = await import('../../backend/src/app');
    const backend = await listenOnEphemeralPort(app);

    servers = [metadata.server, subtitles.server, llm.server, pdf.server, backend.server];
    origin = backend.url;
    baseUrl = `${origin}/v1`;
});

afterAll(() => {
    servers.forEach((s) => s.close());
});

beforeEach(() => {
    mockYtDlp.mockReset();
    mockAxiosGet.mockReset();
    mockSleep.mockReset();
    mockSleep.mockResolvedValue(undefined);
    mockCreate.mockReset();
    mockFetch.mockReset();

    mockFetch.mockImplementation(async (url: unknown, init?: unknown) => {
        if (String(url).includes('/forms/chromium/convert/html')) {
            return {
                ok: true,
                status: 200,
                arrayBuffer: async () => new TextEncoder().encode('%PDF-1.4 fake pdf bytes').buffer,
            } as Response;
        }
        return realFetch(url as string, init as RequestInit);
    });
    vi.stubGlobal('fetch', mockFetch);
});

async function postRecipe(sourceUrl: string) {
    return fetch(`${baseUrl}/recipes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_url: sourceUrl }),
    });
}

async function pollJob(jobId: string, { timeoutMs = 5000, intervalMs = 20 } = {}) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const res = await fetch(`${baseUrl}/recipes/${jobId}`);
        const body = await res.json();
        if (body.status === 'completed' || body.status === 'failed') {
            return body;
        }
        if (Date.now() > deadline) {
            throw new Error(`pollJob timed out, last status: ${body.status}`);
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
}

describe('POST /v1/recipes — полный пайплайн (e2e, через HTTP-воркеры)', () => {
    it('happy path: metadata -> subtitles -> llm -> pdf -> completed, PDF скачивается', async () => {
        mockYtDlp.mockResolvedValue(
            buildRaw({ subtitles: { ru: [{ ext: 'vtt', url: 'https://cdn.example/ru.vtt' }] } })
        );
        mockAxiosGet.mockResolvedValue({ data: RU_VTT });
        mockCreate.mockResolvedValue(streamOf(VALID_RECIPE_JSON));

        const response = await postRecipe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        expect(response.status).toBe(202);
        const created = await response.json();
        expect(created.status).toBe('scanning');

        const body = await pollJob(created.job_id);
        expect(body.status).toBe('completed');
        expect(body.data.title).toBe('Паста Карбонара');
        expect(body.data.ingredients).toHaveLength(1);
        expect(body.pdf_url).toBe(`/v1/recipes/${body.job_id}/pdf`);

        // дедуп: metadata-воркер сходил в yt-dlp один раз, subtitles-воркер
        // взял дорожки из mediaProbe и повторно yt-dlp не дёргал
        expect(mockYtDlp).toHaveBeenCalledTimes(1);

        const pdfResponse = await fetch(`${origin}${body.pdf_url}`);
        expect(pdfResponse.status).toBe(200);
        expect(pdfResponse.headers.get('content-type')).toBe('application/pdf');
        const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());
        expect(pdfBytes.toString('utf-8')).toContain('%PDF-1.4');
    });

    it('INVALID_URL: битая ссылка отклоняется до обращения к внешним сервисам', async () => {
        const response = await postRecipe('не ссылка вообще');

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error.code).toBe('INVALID_URL');
        expect(mockYtDlp).not.toHaveBeenCalled();
    });

    it('VIDEO_TOO_LONG: видео длиннее 15 минут отклоняется на этапе метаданных', async () => {
        mockYtDlp.mockResolvedValue(buildRaw({ duration: 901 }));

        const response = await postRecipe('https://www.youtube.com/watch?v=aaaaaaaaaaa');
        expect(response.status).toBe(202);
        const created = await response.json();

        const body = await pollJob(created.job_id);
        expect(body.status).toBe('failed');
        expect(body.error.code).toBe('VIDEO_TOO_LONG');
        expect(mockAxiosGet).not.toHaveBeenCalled();
    });

    it('NO_SUBTITLES: видео без субтитров отклоняется на этапе субтитров', async () => {
        mockYtDlp.mockResolvedValue(buildRaw());

        const response = await postRecipe('https://www.youtube.com/watch?v=bbbbbbbbbbb');
        expect(response.status).toBe(202);
        const created = await response.json();

        const body = await pollJob(created.job_id);
        expect(body.status).toBe('failed');
        expect(body.error.code).toBe('NO_SUBTITLES');
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('AI_EXTRACTION_FAILED: пустой ответ LLM (транскрипт не про рецепт)', async () => {
        mockYtDlp.mockResolvedValue(
            buildRaw({ subtitles: { ru: [{ ext: 'vtt', url: 'https://cdn.example/ru.vtt' }] } })
        );
        mockAxiosGet.mockResolvedValue({ data: RU_VTT });
        mockCreate.mockResolvedValue(streamOf(''));

        const response = await postRecipe('https://www.youtube.com/watch?v=ccccccccccc');
        expect(response.status).toBe(202);
        const created = await response.json();

        const body = await pollJob(created.job_id);
        expect(body.status).toBe('failed');
        expect(body.error.code).toBe('AI_EXTRACTION_FAILED');
    });

    it('PDF_GENERATION_FAILED: Gotenberg недоступен на последнем шаге пайплайна', async () => {
        mockYtDlp.mockResolvedValue(
            buildRaw({ subtitles: { ru: [{ ext: 'vtt', url: 'https://cdn.example/ru.vtt' }] } })
        );
        mockAxiosGet.mockResolvedValue({ data: RU_VTT });
        mockCreate.mockResolvedValue(streamOf(VALID_RECIPE_JSON));
        mockFetch.mockImplementation(async (url: unknown, init?: unknown) => {
            if (String(url).includes('/forms/chromium/convert/html')) {
                return { ok: false, status: 500, text: async () => 'gotenberg down' } as Response;
            }
            return realFetch(url as string, init as RequestInit);
        });

        const response = await postRecipe('https://www.youtube.com/watch?v=ddddddddddd');
        expect(response.status).toBe(202);
        const created = await response.json();

        const body = await pollJob(created.job_id);
        expect(body.status).toBe('failed');
        expect(body.error.code).toBe('PDF_GENERATION_FAILED');
    });
});
