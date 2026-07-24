import type { Platform } from '../../../common/validation/domainDetection';
import { recipeJobStore } from '../routes/recipeJobStore';
import { checkVideoMetadata, MetadataError } from '../routes/videoMetadataService';
import type { VideoMetadata } from '../routes/videoMetadataStore';

export { MetadataError };
export type { MetadataErrorCode } from '../routes/videoMetadataService';

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
        throw err;
    }
    console.log('checkVideoMetadata:', metadata);
    await recipeJobStore.updateStatus(jobId, 'transcribing');
    return metadata;
}
