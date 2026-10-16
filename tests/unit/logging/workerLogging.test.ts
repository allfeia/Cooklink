import { afterAll, beforeAll, expect, it, vi } from 'vitest';
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

import { createWorkerApp, withCatchAll } from '../../../backend/src/workers-http/httpServerUtils';
import { logger } from '../../../backend/src/logging/logger';

let server: Server;
let base: string;

beforeAll(async () => {
    const app = createWorkerApp();
    app.post('/work', async (req, res) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        logger.child({ job_id: req.body.jobId }).info({ stage: 'llm' }, 'working');
        res.json({ ok: true });
    });
    app.get('/boom', () => {
        throw new Error('boom');
    });
    withCatchAll(app);
    server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

it('a worker logs with the trace_id it received in X-Request-ID and the job_id from the body', async () => {
    lines.length = 0;
    await fetch(`${base}/work`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': 'trace-from-backend1' },
        body: JSON.stringify({ jobId: 'job-42' }),
    });
    expect(lines.find((l) => l.msg === 'working')).toMatchObject({
        trace_id: 'trace-from-backend1',
        job_id: 'job-42',
        stage: 'llm',
    });
});

it('the worker error handler logs the error with the same trace_id', async () => {
    lines.length = 0;
    const response = await fetch(`${base}/boom`, { headers: { 'x-request-id': 'trace-from-backend2' } });
    expect(response.status).toBe(500);
    expect(lines.find((l) => l.msg === 'unhandled error')).toMatchObject({
        level: 'error',
        trace_id: 'trace-from-backend2',
        error_code: 'INTERNAL_SERVER_ERROR',
    });
});
