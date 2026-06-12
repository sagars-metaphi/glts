import defaultConfig from './config/chinese-ocr-confusion.json' with { type: 'json' };

export interface OcrConfusionConfig {
  confusions: Record<string, string[]>;
  companyNameSuffixes?: string[];
  companyTypeTemplates?: string[];
  maxVariantsPerField?: number;
  maxSingleCharReplacements?: number;
}

export interface CharReplacement {
  index: number;
  from: string;
  to: string;
}

export interface ConfusionCandidate {
  raw: string;
  normalized: string;
  replacements: CharReplacement[];
  score: number;
}

function buildReverseMap(confusions: Record<string, string[]>): Map<string, string[]> {
  const reverse = new Map<string, string[]>();
  for (const [correct, mistakes] of Object.entries(confusions)) {
    for (const mistake of mistakes) {
      if (correct === mistake) continue;
      const existing = reverse.get(mistake) || [];
      if (!existing.includes(correct)) existing.push(correct);
      reverse.set(mistake, existing);
    }
  }
  return reverse;
}

export class ChineseOcrConfusionResolver {
  private readonly reverseMap: Map<string, string[]>;
  private readonly config: OcrConfusionConfig;

  constructor(config: OcrConfusionConfig = defaultConfig as OcrConfusionConfig) {
    this.config = config;
    this.reverseMap = buildReverseMap(config.confusions);
  }

  getConfig(): OcrConfusionConfig {
    return this.config;
  }

  /** Generate single-character substitution variants without auto-picking a winner. */
  generateCandidates(raw: string): ConfusionCandidate[] {
    if (!raw) return [];

    const maxVariants = this.config.maxVariantsPerField ?? 48;
    const maxDepth = this.config.maxSingleCharReplacements ?? 4;
    const seen = new Map<string, CharReplacement[]>();
    seen.set(raw, []);

    const queue: Array<{ text: string; replacements: CharReplacement[]; depth: number }> = [
      { text: raw, replacements: [], depth: 0 },
    ];

    while (queue.length > 0 && seen.size < maxVariants) {
      const current = queue.shift()!;
      if (current.depth >= maxDepth) continue;

      for (let i = 0; i < current.text.length; i += 1) {
        const ch = current.text[i];
        const corrections = this.reverseMap.get(ch);
        if (!corrections?.length) continue;

        for (const correct of corrections) {
          if (correct === ch) continue;
          const normalized =
            current.text.slice(0, i) + correct + current.text.slice(i + 1);
          if (seen.has(normalized)) continue;

          const replacements = [
            ...current.replacements,
            { index: i, from: ch, to: correct },
          ];
          seen.set(normalized, replacements);
          queue.push({ text: normalized, replacements, depth: current.depth + 1 });
        }
      }
    }

    return Array.from(seen.entries()).map(([normalized, replacements]) => ({
      raw,
      normalized,
      replacements,
      score: replacements.length === 0 ? 1 : 0,
    }));
  }

  /**
   * Score candidates with a field-specific scorer and return ranked results.
   * Original OCR value is always included as the first candidate.
   */
  resolveCandidates(
    raw: string,
    scorer: (candidate: string, replacements: CharReplacement[]) => number,
  ): ConfusionCandidate[] {
    const candidates = this.generateCandidates(raw);
    const scored = candidates.map((candidate) => ({
      ...candidate,
      score: scorer(candidate.normalized, candidate.replacements),
    }));

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.replacements.length !== b.replacements.length) {
        return a.replacements.length - b.replacements.length;
      }
      return a.normalized.localeCompare(b.normalized);
    });

    return scored;
  }

  resolveBest(
    raw: string,
    scorer: (candidate: string, replacements: CharReplacement[]) => number,
  ): ConfusionCandidate {
    const ranked = this.resolveCandidates(raw, scorer);
    return ranked[0] || { raw, normalized: raw, replacements: [], score: 0 };
  }
}

let defaultResolver: ChineseOcrConfusionResolver | null = null;

export function getDefaultConfusionResolver(): ChineseOcrConfusionResolver {
  if (!defaultResolver) defaultResolver = new ChineseOcrConfusionResolver();
  return defaultResolver;
}
