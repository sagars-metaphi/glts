import type { Extractor, ExtractorContext } from '../shared/Extractor.js';
import { processPassportBuffer } from '../shared/lib/passport-pipeline.js';

export class PassportExtractor implements Extractor {
  readonly type = 'passport';

  async extract(file: Buffer, context?: ExtractorContext): Promise<unknown> {
    return processPassportBuffer(file, context?.filename || 'passport.jpg');
  }
}
