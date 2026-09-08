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

export async function generatePdf(recipe: RecipeData): Promise<Buffer> {
    const html = buildRecipeHtml(recipe);

    const form = new FormData();
    form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
    // печатать фоновые цвета/подложки (кремовая бумага, коралловые акценты)
    form.append('printBackground', 'true');
    // дать Chromium время подтянуть веб-шрифты
    form.append('waitDelay', '1s');

    let response: Response;
    try {
        response = await fetch(`${GOTENBERG_URL}/forms/chromium/convert/html`, {
            method: 'POST',
            body: form,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[pdf] request to Gotenberg failed', { message });
        throw new PdfGenerationError('PDF_GENERATION_FAILED', 'Не удалось сгенерировать PDF', {
            reason: message,
        });
    }

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        console.error('[pdf] Gotenberg returned an error', { status: response.status, body: body.slice(0, 500) });
        throw new PdfGenerationError('PDF_GENERATION_FAILED', 'Не удалось сгенерировать PDF', {
            reason: `Gotenberg responded with ${response.status}`,
        });
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
