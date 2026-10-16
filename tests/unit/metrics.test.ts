import { describe, expect, it } from 'vitest';
import { register } from '../../backend/node_modules/prom-client';
import '../../backend/src/metrics';

describe('metrics are visible before the first event', () => {
    it('exposes every pipeline stage with zero failures', async () => {
        const text = await register.metrics();
        for (const stage of ['metadata', 'subtitles', 'llm', 'pdf']) {
            expect(text).toContain(`recipe_pipeline_failures_total{stage="${stage}"} 0`);
        }
    });

    it('exposes cache hit/miss and final statuses with zero values', async () => {
        const text = await register.metrics();
        expect(text).toContain('recipe_jobs_created_total{cache="hit"} 0');
        expect(text).toContain('recipe_jobs_created_total{cache="miss"} 0');
        for (const status of ['completed', 'failed', 'cancelled']) {
            expect(text).toContain(`recipe_jobs_completed_total{status="${status}"} 0`);
        }
    });
});
