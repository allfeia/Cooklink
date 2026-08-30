import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Server } from 'http';

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

vi.mock('../../backend/src/db/client', async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    const schema = await import('../../backend/src/db/schema');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const client = new PGlite();
    const db = drizzle(client, { schema });

    const migrationsFolder = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../backend/drizzle'
    );
    await migrate(db, { migrationsFolder });

    return { db };
});

import { db } from '../../backend/src/db/client';
import { jobs, videoMetadata, transcripts, recipes } from '../../backend/src/db/schema';

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

async function findJobBySourceUrl(sourceUrl: string) {
    const [row] = await db.select().from(jobs).where(eq(jobs.sourceUrl, sourceUrl)).limit(1);
    return row;
}

async function pollJobRowById(jobId: string, { timeoutMs = 5000, intervalMs = 20 } = {}) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const [row] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
        if (row && (row.status === 'completed' || row.status === 'failed')) return row;
        if (Date.now() > deadline) throw new Error(`pollJobRowById timed out, last status: ${row?.status}`);
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
}

async function pollJobRow(sourceUrl: string, { timeoutMs = 5000, intervalMs = 20 } = {}) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const row = await findJobBySourceUrl(sourceUrl);
        if (row && (row.status === 'completed' || row.status === 'failed')) {
            return row;
        }
        if (Date.now() > deadline) {
            throw new Error(`pollJobRow timed out, last status: ${row?.status}`);
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
}

describe('GET /health/ready', () => {
    it('возвращает 200 и status: ok когда БД доступна', async () => {
        const res = await fetch(`${origin}/health/ready`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.status).toBe('ok');
    });
});

describe('POST /v1/recipes — кеш рецепта по canonical_key', () => {
    it('повторный запрос с тем же URL пропускает пайплайн и стартует с generating_pdf', async () => {
        const sourceUrl = 'https://www.youtube.com/watch?v=jjjjjjjjjjj';
        mockYtDlp.mockResolvedValue(
            buildRaw({ subtitles: { ru: [{ ext: 'vtt', url: 'https://cdn.example/ru.vtt' }] } })
        );
        mockAxiosGet.mockResolvedValue({ data: RU_VTT });
        mockCreate.mockResolvedValue(streamOf(VALID_RECIPE_JSON));

        // Первый запрос — полный пайплайн
        const first = await postRecipe(sourceUrl);
        const firstJob = await first.json();
        await pollJobRow(sourceUrl);

        // Сбрасываем моки — второй запрос не должен их трогать
        mockYtDlp.mockReset();
        mockAxiosGet.mockReset();
        mockCreate.mockReset();

        // Второй запрос с тем же URL
        const second = await postRecipe(sourceUrl);
        expect(second.status).toBe(202);
        const secondJob = await second.json();
        expect(secondJob.status).toBe('generating_pdf');
        expect(secondJob.canonical_key).toBe(firstJob.canonical_key);

        const secondRow = await pollJobRowById(secondJob.job_id);
        expect(secondRow?.status).toBe('completed');

        expect(mockYtDlp).not.toHaveBeenCalled();
        expect(mockAxiosGet).not.toHaveBeenCalled();
        expect(mockCreate).not.toHaveBeenCalled();
    });
});

describe('POST /v1/recipes — полный пайплайн пишет корректные данные в БД (e2e)', () => {
    it('happy path: в jobs/video_metadata/transcripts/recipes появляются согласованные строки', async () => {
        const sourceUrl = 'https://www.youtube.com/watch?v=eeeeeeeeeee';
        mockYtDlp.mockResolvedValue(
            buildRaw({ subtitles: { ru: [{ ext: 'vtt', url: 'https://cdn.example/ru.vtt' }] } })
        );
        mockAxiosGet.mockResolvedValue({ data: RU_VTT });
        mockCreate.mockResolvedValue(streamOf(VALID_RECIPE_JSON));

        const response = await postRecipe(sourceUrl);
        expect(response.status).toBe(202);
        const body = await response.json();

        const jobRow = await pollJobRow(sourceUrl);
        expect(jobRow.id).toBe(body.job_id);
        expect(jobRow.status).toBe('completed');
        expect(jobRow.errorCode).toBeNull();

        const videoId = 'eeeeeeeeeee';
        const canonicalKey = `youtube:${videoId}`;
        const [metadataRow] = await db.select().from(videoMetadata).where(eq(videoMetadata.videoId, videoId)).limit(1);
        expect(metadataRow?.title).toBe('Паста Карбонара');

        const [transcriptRow] = await db.select().from(transcripts).where(eq(transcripts.videoId, videoId)).limit(1);
        expect(transcriptRow?.language).toBe('ru');

        const [recipeRow] = await db.select().from(recipes).where(eq(recipes.canonicalKey, canonicalKey)).limit(1);
        expect((recipeRow?.recipe as { title: string }).title).toBe('Паста Карбонара');
    });

    it('падение на этапе метаданных (VIDEO_TOO_LONG) переводит job в failed с error_code', async () => {
        const sourceUrl = 'https://www.youtube.com/watch?v=fffffffffff';
        mockYtDlp.mockResolvedValue(buildRaw({ duration: 901 }));

        const response = await postRecipe(sourceUrl);
        expect(response.status).toBe(202);

        const jobRow = await pollJobRow(sourceUrl);
        expect(jobRow.status).toBe('failed');
        expect(jobRow.errorCode).toBe('VIDEO_TOO_LONG');
        expect(jobRow.errorMessage).toBeTruthy();
    });

    it('падение на этапе субтитров (NO_SUBTITLES) переводит job в failed с error_code', async () => {
        const sourceUrl = 'https://www.youtube.com/watch?v=ggggggggggg';
        mockYtDlp.mockResolvedValue(buildRaw());

        const response = await postRecipe(sourceUrl);
        expect(response.status).toBe(202);

        const jobRow = await pollJobRow(sourceUrl);
        expect(jobRow.status).toBe('failed');
        expect(jobRow.errorCode).toBe('NO_SUBTITLES');
    });

    it('падение на этапе LLM (AI_EXTRACTION_FAILED) переводит job в failed с error_code', async () => {
        const sourceUrl = 'https://www.youtube.com/watch?v=hhhhhhhhhhh';
        mockYtDlp.mockResolvedValue(
            buildRaw({ subtitles: { ru: [{ ext: 'vtt', url: 'https://cdn.example/ru.vtt' }] } })
        );
        mockAxiosGet.mockResolvedValue({ data: RU_VTT });
        mockCreate.mockResolvedValue(streamOf(''));

        const response = await postRecipe(sourceUrl);
        expect(response.status).toBe(202);

        const jobRow = await pollJobRow(sourceUrl);
        expect(jobRow.status).toBe('failed');
        expect(jobRow.errorCode).toBe('AI_EXTRACTION_FAILED');
    });

    it('падение на этапе PDF (PDF_GENERATION_FAILED) переводит job в failed с error_code', async () => {
        const sourceUrl = 'https://www.youtube.com/watch?v=iiiiiiiiiii';
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

        const response = await postRecipe(sourceUrl);
        expect(response.status).toBe(202);

        const jobRow = await pollJobRow(sourceUrl);
        expect(jobRow.status).toBe('failed');
        expect(jobRow.errorCode).toBe('PDF_GENERATION_FAILED');
    });
});
