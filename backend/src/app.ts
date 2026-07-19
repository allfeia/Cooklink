import express from 'express';
import cors from 'cors';
import recipesRouter from './routes/recipes';

const app = express();

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());
app.use('/v1', recipesRouter);

export default app;