import type { Logger } from 'pino';
import { logger } from '../../logging/logger';
import { buildRecipeHtml } from './pdfTemplate';
import type { RecipeData } from '../recipe/recipeStore';

const GOTENBERG_URL = process.env.GOTENBERG_URL ?? 'http://localhost:3000';

export type PdfErrorCode = 'PDF_GENERATION_FAILED';

export class PdfGenerationError extends Error {
    constructor(
        public code: PdfErrorCode,
        message: string,
        public details?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'PdfGenerationError';
    }
}

export async function generatePdf(recipe: RecipeData, log: Logger = logger): Promise<Buffer> {
    const html = buildRecipeHtml(recipe);

    const form = new FormData();
    form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
    form.append('printBackground', 'true');
    form.append('waitDelay', '1s');

    let response: Response;
    try {
        response = await fetch(`${GOTENBERG_URL}/forms/chromium/convert/html`, {
            method: 'POST',
            body: form,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error({ stage: 'pdf', error_code: 'PDF_GENERATION_FAILED', reason: message }, 'request to Gotenberg failed');
        throw new PdfGenerationError('PDF_GENERATION_FAILED', 'Не удалось сгенерировать PDF', {
            reason: message,
        });
    }

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        log.error(
            { stage: 'pdf', error_code: 'PDF_GENERATION_FAILED', upstream_status: response.status, body: body.slice(0, 500) },
            'Gotenberg returned an error',
        );
        throw new PdfGenerationError('PDF_GENERATION_FAILED', 'Не удалось сгенерировать PDF', {
            reason: `Gotenberg responded with ${response.status}`,
        });
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
