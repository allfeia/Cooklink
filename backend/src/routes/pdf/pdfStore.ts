export interface PdfRepository {
    save(jobId: string, pdf: Buffer): Promise<void>;
    get(jobId: string): Promise<Buffer | undefined>;
}

export class InMemoryPdfRepository implements PdfRepository {
    private pdfByJobId = new Map<string, Buffer>();

    async save(jobId: string, pdf: Buffer): Promise<void> {
        this.pdfByJobId.set(jobId, pdf);
    }

    async get(jobId: string): Promise<Buffer | undefined> {
        return this.pdfByJobId.get(jobId);
    }
}

export const pdfStore: PdfRepository = new InMemoryPdfRepository();
