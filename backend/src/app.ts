import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import recipesRouter from './routes/recipe/recipes';

const app = express();

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());
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