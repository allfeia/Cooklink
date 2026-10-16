import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { runWithContext } from './context';

const TRACE_ID_PATTERN = /^[0-9a-zA-Z-]{8,64}$/;

export function traceIdFromRequest(req: Request): string {
    const incoming = req.header('x-request-id');
    if (incoming && TRACE_ID_PATTERN.test(incoming)) return incoming;
    return randomUUID().replace(/-/g, '');
}

export function requestContext(req: Request, _res: Response, next: NextFunction): void {
    const ip = req.header('x-real-ip') ?? req.ip;
    runWithContext({ traceId: traceIdFromRequest(req), ip }, next);
}
