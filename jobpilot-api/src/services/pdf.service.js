import { PDFParse } from 'pdf-parse';

export class PdfExtractionError extends Error {
  constructor(message) {
    super(message);
    this.status = 422;
  }
}

// Every real PDF starts with this signature; the client-sent MIME type alone can't be trusted
export const isPdf = (buffer) => buffer.subarray(0, 5).toString('latin1') === '%PDF-';

export async function extractPdfText(buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });

  try {
    const { text } = await parser.getText({ pageJoiner: '' });
    const cleaned = text
      .replace(/\u0000/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!cleaned) {
      throw new PdfExtractionError(
        'No text could be extracted. Scanned or image-only PDFs are not supported.'
      );
    }
    return cleaned;
  } catch (err) {
    if (err instanceof PdfExtractionError) throw err;
    if (err?.name === 'PasswordException') {
      throw new PdfExtractionError('Password-protected PDFs are not supported.');
    }
    throw new PdfExtractionError('The file could not be read as a PDF.');
  } finally {
    await parser.destroy();
  }
}
