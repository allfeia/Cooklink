import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { sql } from 'drizzle-orm';
import { db } from './db/client';
import recipesRouter from './routes/recipe/recipes';

const app = express();

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.get('/health', async (_req, res) => {
    try {
        await db.execute(sql`SELECT 1`);
        res.json({ status: 'ok' });
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