import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const { lines } = vi.hoisted(() => ({ lines: [] as Record<string, any>[] }));

vi.mock('../../../backend/src/logging/logger', async () => {
    const actual = await vi.importActual<typeof import('../../../backend/src/logging/logger')>(
        '../../../backend/src/logging/logger',
    );
    const { Writable } = await import('node:stream');
    const stream = new Writable({
        write(chunk, _encoding, callback) {
            for (const line of chunk.toString().split('\n').filter(Boolean)) lines.push(JSON.parse(line));
            callback();
        },
    });
    return { ...actual, logger: actual.createLogger(stream) };
});

vi.mock('../../../backend/src/routes/recipeJobStore', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../backend/src/routes/recipeJobStore')>();
    return { ...actual, recipeJobStore: new actual.InMemoryRecipeJobRepository() };
});

vi.mock('../../../backend/src/routes/recipe/recipeStore', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../backend/src/routes/recipe/recipeStore')>();
    return { ...actual, recipeStore: new actual.InMemoryRecipeRepository() };
});

import app from '../../../backend/src/app';

const RECIPE = {
    title: 'Тест',
    type: 'Горячее',
    cooking_time_minutes: 10,
    nutrition_per_100g: { calories: 1, protein: 1, fat: 1, carbs: 1 },
    portions: 1,
    ingredients: [{ name: 'Мука', quantity: '1', unit: 'г' }],
    steps: [{ step_number: 1, description: 'Смешать' }],
};

let llmFails = false;
const realFetch = globalThis.fetch;
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const workerCalls: { url: string; traceId: string | null; body: any }[] = [];

function fakeWorkers(url: string, init?: any) {
    if (url.includes(':400')) {
        workerCalls.push({
            url,
            traceId: new Headers(init?.headers).get('x-request-id'),
            body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
    }
    if (url.includes(':4001/check')) return json({});
    if (url.includes(':4002/fetch')) return json({ transcript: { transcript_text: 'текст' } });
    if (url.includes(':4003/extract')) {
        return llmFails
            ? json({ error: { code: 'LLM_QUOTA_EXCEEDED', message: 'x' } }, 402)
            : json({ recipe: RECIPE });
    }
    if (url.includes(':4004/generate')) return new Response(Buffer.from('%PDF-1.4'), { status: 200 });
    return undefined;
}

let server: Server;
let base: string;

beforeAll(async () => {
    vi.stubGlobal('fetch', (input: any, init?: any) => fakeWorkers(String(input), init) ?? realFetch(input, init));
    server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
    server.close();
    vi.unstubAllGlobals();
});

async function createJob(traceId: string, url: string) {
    const response = await realFetch(`${base}/v1/recipes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': traceId, 'x-real-ip': '203.0.113.5' },
        body: JSON.stringify({ source_url: url }),
    });
    expect(response.status).toBe(202);
    return (await response.json()) as { job_id: string };
}

async function waitForStatus(jobId: string, status: string) {
    await vi.waitFor(async () => {
        const job = await (await realFetch(`${base}/v1/recipes/${jobId}`)).json();
        expect(job.status).toBe(status);
    });
}

describe('pipeline logging', () => {
    it('writes every pipeline line with the job_id and the trace_id of the request that created the job', async () => {
        llmFails = false;
        lines.length = 0;
        workerCalls.length = 0;
        const { job_id } = await createJob('trace-create-0001', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        await waitForStatus(job_id, 'completed');
        await realFetch(`${base}/v1/recipes/${job_id}/pdf`, { headers: { 'x-request-id': 'trace-pdf-000002' } });

        const created = lines.find((l) => l.msg === 'job created');
        expect(created).toMatchObject({
            trace_id: 'trace-create-0001',
            job_id,
            ip: '203.0.113.5',
            cache: 'miss',
            canonical_key: 'youtube:dQw4w9WgXcQ',
        });

        const pipeline = lines.filter((l) => l.job_id === job_id && l.msg !== 'pdf downloaded');
        expect(pipeline.every((l) => l.trace_id === 'trace-create-0001')).toBe(true);
        expect(pipeline.filter((l) => l.stage).map((l) => `${l.stage}:${l.msg}`)).toEqual([
            'metadata:stage start',
            'metadata:stage done',
            'subtitles:stage start',
            'subtitles:stage done',
            'llm:stage start',
            'llm:stage done',
            'pdf:stage start',
            'pdf:stage done',
        ]);
        expect(pipeline.at(-1)).toMatchObject({ msg: 'job completed' });
        expect(pipeline.at(-1)!.total_ms).toBeTypeOf('number');
        expect(pipeline.some((l) => 'ip' in l && l.msg !== 'job created')).toBe(false);

        const calls = workerCalls.filter((c) => c.url.includes(':400'));
        expect(calls.length).toBe(4);
        expect(calls.every((c) => c.traceId === 'trace-create-0001')).toBe(true);
        expect(calls.every((c) => c.body.jobId === job_id)).toBe(true);

        expect(lines.find((l) => l.msg === 'pdf downloaded')).toMatchObject({ job_id, trace_id: 'trace-pdf-000002' });
    });

    it('logs the failed stage with the error code', async () => {
        llmFails = true;
        lines.length = 0;
        const { job_id } = await createJob('trace-fail-000003', 'https://www.youtube.com/watch?v=aaaaaaaaaaa');
        // статус failed выставляет сам llm-worker (здесь он подменён), поэтому ждём строку лога
        await vi.waitFor(() => expect(lines.some((l) => l.msg === 'stage failed')).toBe(true));

        const failed = lines.find((l) => l.msg === 'stage failed');
        expect(failed).toMatchObject({
            level: 'error',
            stage: 'llm',
            error_code: 'LLM_QUOTA_EXCEEDED',
            job_id,
            trace_id: 'trace-fail-000003',
        });
        expect(lines.some((l) => l.msg === 'job completed')).toBe(false);
    });
});
