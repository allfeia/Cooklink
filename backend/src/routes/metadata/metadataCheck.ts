import type { Platform } from '../../../../common/validation/domainDetection';
import { recipeJobStore } from '../recipeJobStore';
import { logger } from '../../logging/logger';
import { checkVideoMetadata, MetadataError, type MetadataCheckResult } from './videoMetadataService';

export { MetadataError };
export type { MetadataErrorCode } from './videoMetadataService';
export type { MetadataCheckResult } from './videoMetadataService';

export async function runMetadataCheck(
    jobId: string,
    sourceUrl: string,
    videoId: string,
    platform: Platform
): Promise<MetadataCheckResult> {
    const log = logger.child({ job_id: jobId });
    let result: MetadataCheckResult;
    try {
        result = await checkVideoMetadata(sourceUrl, videoId, platform);
    } catch (err) {
        log.error({ err, stage: 'metadata' }, 'checkVideoMetadata failed');
        const code = err instanceof MetadataError ? err.code : 'INTERNAL_SERVER_ERROR';
        const message = err instanceof Error ? err.message : 'Внутренняя ошибка сервера';
        await recipeJobStore.markFailed(jobId, code, message);
        throw err;
    }
    log.info({ stage: 'metadata', video_id: videoId, platform }, 'metadata checked');
    await recipeJobStore.updateStatus(jobId, 'transcribing');
    return result;
}
