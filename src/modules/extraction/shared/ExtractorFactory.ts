import type { Extractor } from './Extractor.js';

export class ExtractorFactory {
  private readonly registry = new Map<string, Extractor>();

  register(type: string, extractor: Extractor): void {
    this.registry.set(type.toLowerCase(), extractor);
  }

  get(type: string): Extractor {
    const extractor = this.registry.get(type.toLowerCase());
    if (!extractor) throw new Error(`Unknown extractor type: ${type}`);
    return extractor;
  }

  has(type: string): boolean {
    return this.registry.has(type.toLowerCase());
  }

  types(): string[] {
    return [...this.registry.keys()];
  }
}
