import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryPdfRepository } from '../../../backend/src/routes/pdf/pdfStore';

describe('InMemoryPdfRepository', () => {
    let repo: InMemoryPdfRepository;

    beforeEach(() => {
        repo = new InMemoryPdfRepository();
    });

    it('returns undefined for a job that has no saved pdf', async () => {
        await expect(repo.get('missing-job')).resolves.toBeUndefined();
    });

    it('saves and reads back a pdf buffer for a job id', async () => {
        const buffer = Buffer.from('%PDF-1.4 fake');
        await repo.save('job-1', buffer);

        await expect(repo.get('job-1')).resolves.toEqual(buffer);
    });

    it('keeps pdfs for distinct job ids independent', async () => {
        await repo.save('job-a', Buffer.from('a'));
        await repo.save('job-b', Buffer.from('b'));

        await expect(repo.get('job-a')).resolves.toEqual(Buffer.from('a'));
        await expect(repo.get('job-b')).resolves.toEqual(Buffer.from('b'));
    });

    it('overwrites an existing pdf for the same job id', async () => {
        await repo.save('job-1', Buffer.from('old'));
        await repo.save('job-1', Buffer.from('new'));

        await expect(repo.get('job-1')).resolves.toEqual(Buffer.from('new'));
    });
});
