import test from 'node:test';
import assert from 'node:assert/strict';
import { ExtractorFactory } from '../src/modules/extraction/shared/ExtractorFactory.js';
import { TemplateRendererService } from '../src/modules/template/TemplateRendererService.js';
import type { Extractor } from '../src/modules/extraction/shared/Extractor.js';

class StubExtractor implements Extractor {
  constructor(public readonly type: string) {}
  async extract() {
    return { ok: true, type: this.type };
  }
}

test('ExtractorFactory registers and resolves extractors', () => {
  const factory = new ExtractorFactory();
  factory.register('passport', new StubExtractor('passport'));
  factory.register('visa', new StubExtractor('visa'));

  assert.equal(factory.has('passport'), true);
  assert.equal(factory.has('cdc'), false);
  assert.deepEqual(factory.types().sort(), ['passport', 'visa']);

  factory.register('cdc', new StubExtractor('cdc'));
  assert.equal(factory.get('cdc').type, 'cdc');
});

test('ExtractorFactory throws for unknown type', () => {
  const factory = new ExtractorFactory();
  assert.throws(() => factory.get('invoice'), /Unknown extractor type/);
});

test('TemplateRendererService replaces placeholders', () => {
  const renderer = new TemplateRendererService();
  const out = renderer.render(
    'Name: {{name}}, Passport: {{passport}}, Rank: {{rank}}, Nationality: {{nationality}}, Vessel: {{vessel}}, Joining: {{joiningDate}}',
    {
      name: 'John Doe',
      passport: 'P1234567',
      rank: 'Captain',
      nationality: 'Indian',
      vessel: 'MV Ocean',
      joiningDate: '2026-01-15',
    },
  );
  assert.equal(
    out,
    'Name: John Doe, Passport: P1234567, Rank: Captain, Nationality: Indian, Vessel: MV Ocean, Joining: 2026-01-15',
  );
});
