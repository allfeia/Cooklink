import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { register } from 'prom-client';
import { sql } from 'drizzle-orm';
import { db } from './db/client';
import './metrics';
import recipesRouter from './routes/recipe/recipes';

const app = express();

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});

app.get('/health/live', (_req, res) => {
    res.json({ status: 'ok' });
});

app.get('/health/ready', async (_req, res) => {
    try {
        await db.execute(sql`SELECT 1`);
        res.json({ status: 'ok', services: { db: 'up' } });
    } catch {
        res.status(503).json({ status: 'error', services: { db: 'down' } });
    }
});

app.use('/v1', recipesRouter);

app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    console.error('[error]', req.method, req.originalUrl, err);
    if (res.headersSent) {
        next(err);
        return;
    }
    res.status(500).json({
        error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Внутренняя ошибка сервера',
        },
    });
});

export default app;