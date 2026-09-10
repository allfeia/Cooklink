import 'dotenv/config';
import { createWorkerApp, sendError, withCatchAll } from './httpServerUtils';
import { runMetadataCheck, MetadataError } from '../routes/metadata/metadataCheck';
import type { Platform } from '../../../common/validation/domainDetection';

export const app = createWorkerApp();

app.post('/check', async (req, res) => {
    const { jobId, sourceUrl, videoId, platform } = req.body as {
        jobId: string;
        sourceUrl: string;
        videoId: string;
        platform: Platform;
    };

    try {
        const { metadata, mediaProbe } = await runMetadataCheck(jobId, sourceUrl, videoId, platform);
        res.status(200).json({ metadata, mediaProbe });
    } catch (err) {
        if (err instanceof MetadataError) {
            sendError(res, 400, err);
            return;
        }
        console.error('[metadata-worker] unexpected error', err);
        sendError(res, 500, { code: 'INTERNAL_SERVER_ERROR', message: 'Внутренняя ошибка сервера' });
    }
});

withCatchAll(app);

if (require.main === module) {
    const PORT = process.env.PORT || 4001;
    app.listen(PORT, () => console.log(`metadata-worker listening on port ${PORT}`));
}
