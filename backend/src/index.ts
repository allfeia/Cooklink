import 'dotenv/config';
import app from './app';
import { logger } from './logging/logger';

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
    logger.info({ port: Number(PORT) }, 'server listening');
});