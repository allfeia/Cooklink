import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { logger } from '../logging/logger';
import { requestContext } from '../logging/requestContext';

interface ErrorLike {
    code: string;
    message: string;
    details?: Record<string, unknown>;
}

export function createWorkerApp(): Express {
    const app = express();
    app.use(requestContext);
    app.use(express.json());
    return app;
}

export function sendError(res: Response, status: number, err: ErrorLike): void {
    res.status(status).json({
        error: {
            code: err.code,
            message: err.message,
            details: err.details,
        },
    });
}

export function withCatchAll(app: Express): void {
    app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
        logger.error({ err, method: req.method, path: req.path, error_code: 'INTERNAL_SERVER_ERROR' }, 'unhandled error');
        if (res.headersSent) {
            next(err);
            return;
        }
        sendError(res, 500, { code: 'INTERNAL_SERVER_ERROR', message: 'Внутренняя ошибка сервера' });
    });
}
