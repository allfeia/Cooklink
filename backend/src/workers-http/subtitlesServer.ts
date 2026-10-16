import 'dotenv/config';
import { createWorkerApp, sendError, withCatchAll } from './httpServerUtils';
import { logger } from '../logging/logger';
import { runSubtitlesFetch, SubtitlesError } from '../workers/subtitlesWorker';
import type { MediaProbe } from '../media/mediaProbe';

export const app = createWorkerApp();

app.post('/fetch', async (req, res) => {
    const { jobId, sourceUrl, videoId, mediaProbe } = req.body as {
        jobId: string;
        sourceUrl: string;
        videoId: string;
        mediaProbe?: MediaProbe;
    };

    try {
        const transcript = await runSubtitlesFetch(jobId, sourceUrl, videoId, mediaProbe);
        res.status(200).json({ transcript });
    } catch (err) {
        if (err instanceof SubtitlesError) {
            sendError(res, 400, err);
            return;
        }
        logger.error({ err, error_code: 'INTERNAL_SERVER_ERROR' }, 'unexpected error');
        sendError(res, 500, { code: 'INTERNAL_SERVER_ERROR', message: 'Внутренняя ошибка сервера' });
    }
});

withCatchAll(app);

if (require.main === module) {
    const PORT = process.env.PORT || 4002;
    app.listen(PORT, () => logger.info({ port: Number(PORT) }, 'listening'));
}
