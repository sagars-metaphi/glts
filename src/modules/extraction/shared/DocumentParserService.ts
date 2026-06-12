import { extractTextFromBuffer, normalizeText } from '../document/lib/document-parser.js';

export class DocumentParserService {
  async parse(buffer: Buffer, filename: string, mimeType?: string) {
    const result = await extractTextFromBuffer(buffer, filename, mimeType);
    return { ...result, text: normalizeText(result.text) };
  }
}
