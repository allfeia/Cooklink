import { describe, expect, it } from 'vitest';
import express from '../../../backend/node_modules/express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Writable } from 'node:stream';
import { createLogger } from '../../../backend/src/logging/logger';
import { getContext, runWithContext } from '../../../backend/src/logging/context';
import { requestContext } from '../../../backend/src/logging/requestContext';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function captureLogger() {
    const lines: Record<string, unknown>[] = [];
    const stream = new Writable({
        write(chunk, _encoding, callback) {
            for (const line of chunk.toString().split('\n').filter(Boolean)) lines.push(JSON.parse(line));
            callback();
        },
    });
    return { lines, logger: createLogger(stream) };
}

describe('request context', () => {
    it('is visible after await and setTimeout', async () => {
        const { lines, logger } = captureLogger();
        await runWithContext({ traceId: 'trace-abc12345' }, async () => {
            await sleep(5);
            logger.info('after await');
            await new Promise<void>((resolve) => setTimeout(() => { logger.info('in timeout'); resolve(); }, 5));
        });
        expect(lines.map((l) => l.trace_id)).toEqual(['trace-abc12345', 'trace-abc12345']);
    });

    it('keeps contexts of parallel requests apart', async () => {
        const { lines, logger } = captureLogger();
        await Promise.all([
            runWithContext({ traceId: 'trace-aaaaaaaa' }, async () => {
                await sleep(10);
                logger.info('first');
            }),
            runWithContext({ traceId: 'trace-bbbbbbbb' }, async () => {
                await sleep(5);
                logger.info('second');
            }),
        ]);
        expect(lines.find((l) => l.msg === 'first')?.trace_id).toBe('trace-aaaaaaaa');
        expect(lines.find((l) => l.msg === 'second')?.trace_id).toBe('trace-bbbbbbbb');
    });

    it('writes a plain JSON line with service, level and ISO timestamp, and no ip by default', () => {
        const { lines, logger } = captureLogger();
        runWithContext({ traceId: 'trace-abc12345', ip: '203.0.113.5' }, () => logger.error({ error_code: 'X' }, 'boom'));
        expect(lines[0]).toMatchObject({ service: 'backend', level: 'error', msg: 'boom', error_code: 'X' });
        expect(lines[0].ip).toBeUndefined();
        expect(String(lines[0].ts)).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z$/);
    });

    it('survives JSON body parsing, awaits and a background task started from the handler', async () => {
        const { lines, logger } = captureLogger();
        const app = express();
        app.use(requestContext);
        app.use(express.json());
        app.post('/x', async (req, res) => {
            res.status(202).json({ ip: getContext()?.ip });
            await sleep(5);
            setTimeout(() => logger.info('background'), 5);
        });
        const server: Server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
        try {
            const { port } = server.address() as AddressInfo;
            const response = await fetch(`http://127.0.0.1:${port}/x`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-request-id': 'from-nginx-1234', 'x-real-ip': '203.0.113.5' },
                body: JSON.stringify({ a: 1 }),
            });
            expect(await response.json()).toEqual({ ip: '203.0.113.5' });
            await sleep(40);
        } finally {
            server.close();
        }
        expect(lines.find((l) => l.msg === 'background')?.trace_id).toBe('from-nginx-1234');
    });

    it('generates a trace id when X-Request-ID is missing or malformed', async () => {
        const app = express();
        app.use(requestContext);
        app.get('/x', (_req, res) => res.json({ traceId: getContext()?.traceId }));
        const server: Server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
        try {
            const { port } = server.address() as AddressInfo;
            const missing = await (await fetch(`http://127.0.0.1:${port}/x`)).json();
            const bad = await (await fetch(`http://127.0.0.1:${port}/x`, { headers: { 'x-request-id': 'bad id"; drop' } })).json();
            expect(missing.traceId).toMatch(/^[0-9a-f]{32}$/);
            expect(bad.traceId).toMatch(/^[0-9a-f]{32}$/);
        } finally {
            server.close();
        }
    });
});
