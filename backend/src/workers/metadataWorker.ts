import type { Platform } from '../../../common/validation/domainDetection';
import { recipeJobStore } from '../routes/recipeJobStore';
import { checkVideoMetadata, MetadataError } from '../routes/metadata/videoMetadataService';
import type { VideoMetadata } from '../routes/metadata/videoMetadataStore';

export { MetadataError };
export type { MetadataErrorCode } from '../routes/metadata/videoMetadataService';

export async function runMetadataCheck(
    jobId: string,
    sourceUrl: string,
    videoId: string,
    platform: Platform
): Promise<VideoMetadata> {
    let metadata: VideoMetadata;
    try {
        metadata = await checkVideoMetadata(sourceUrl, videoId, platform);
    } catch (err) {
        console.error('checkVideoMetadata failed:', err);
        const code = err instanceof MetadataError ? err.code : 'INTERNAL_SERVER_ERROR';
        const message = err instanceof Error ? err.message : 'Внутренняя ошибка сервера';
        await recipeJobStore.markFailed(jobId, code, message);
        throw err;
    }
    console.log('checkVideoMetadata:', metadata);
    await recipeJobStore.updateStatus(jobId, 'transcribing');
    return metadata;
}
