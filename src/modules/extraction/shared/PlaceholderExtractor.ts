import type { Extractor, ExtractorContext } from './Extractor.js';

export class PlaceholderExtractor implements Extractor {
  constructor(public readonly type: string) {}

  async extract(_file: Buffer, _ctx?: ExtractorContext) {
    return { success: false, type: this.type, message: `Extractor "${this.type}" not implemented yet` };
  }
}

export const FUTURE_EXTRACTOR_TYPES = ['cdc', 'seamanbook', 'invoice', 'contract', 'invitation', 'loa'] as const;
