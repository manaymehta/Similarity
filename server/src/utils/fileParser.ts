import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

type SupportedExtension = 'txt' | 'pdf' | 'docx' | 'unknown';

function getExtension(filename: string): SupportedExtension {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (ext === 'docx') return 'docx';
    if (ext === 'txt') return 'txt';
    return 'unknown';
}

export async function extractText(buffer: Buffer, filename: string): Promise<string> {
    const ext = getExtension(filename);

    if (ext === 'pdf') {
        const data = await pdfParse(buffer);
        return data.text.trim();
    }

    if (ext === 'docx') {
        const result = await mammoth.extractRawText({ buffer });
        return result.value.trim();
    }

    // txt and anything else: treat as UTF-8 plain text
    return buffer.toString('utf-8');
}
