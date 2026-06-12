export interface FuzzyLabelMatch {
  canonical: string;
  matchedText: string;
  index: number;
  end: number;
  levenshteinDistance: number;
  overlapScore: number;
  score: number;
  exact: boolean;
}

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

export function characterOverlapScore(a: string, b: string): number {
  if (!a.length || !b.length) return 0;
  const freq = new Map<string, number>();
  for (const ch of a) freq.set(ch, (freq.get(ch) || 0) + 1);
  let overlap = 0;
  for (const ch of b) {
    const count = freq.get(ch) || 0;
    if (count > 0) {
      overlap += 1;
      freq.set(ch, count - 1);
    }
  }
  return overlap / Math.max(a.length, b.length);
}

export function scoreLabelMatch(ocrText: string, canonical: string): FuzzyLabelMatch | null {
  if (!ocrText || !canonical) return null;

  if (ocrText === canonical) {
    return {
      canonical,
      matchedText: ocrText,
      index: 0,
      end: ocrText.length,
      levenshteinDistance: 0,
      overlapScore: 1,
      score: 1,
      exact: true,
    };
  }

  const distance = levenshteinDistance(ocrText, canonical);
  if (distance > 2) return null;

  const overlapScore = characterOverlapScore(ocrText, canonical);
  const score = (1 - distance / Math.max(canonical.length, 1)) * 0.6 + overlapScore * 0.4;

  return {
    canonical,
    matchedText: ocrText,
    index: 0,
    end: ocrText.length,
    levenshteinDistance: distance,
    overlapScore,
    score,
    exact: false,
  };
}

export function findBestLabelMatchInText(
  text: string,
  canonical: string,
  afterIndex = 0,
): FuzzyLabelMatch | null {
  const exactPattern = canonical.split('').map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
  const exactRe = new RegExp(exactPattern, 'g');
  let exact: RegExpExecArray | null;
  let bestExact: FuzzyLabelMatch | null = null;
  while ((exact = exactRe.exec(text)) !== null) {
    if (exact.index < afterIndex) continue;
    const candidate: FuzzyLabelMatch = {
      canonical,
      matchedText: exact[0],
      index: exact.index,
      end: exact.index + exact[0].length,
      levenshteinDistance: 0,
      overlapScore: 1,
      score: 1,
      exact: true,
    };
    if (!bestExact || candidate.index < bestExact.index) bestExact = candidate;
  }
  if (bestExact) return bestExact;
  if (canonical.length < 4) return null;

  let bestFuzzy: FuzzyLabelMatch | null = null;
  const minLen = Math.max(2, canonical.length - 2);
  const maxLen = canonical.length + 2;

  for (let i = Math.max(0, afterIndex); i < text.length; i += 1) {
    for (let len = minLen; len <= maxLen; len += 1) {
      if (i + len > text.length) continue;
      const window = text.slice(i, i + len);
      const scored = scoreLabelMatch(window, canonical);
      if (!scored || scored.exact) continue;
      const positioned = { ...scored, index: i, end: i + len, matchedText: window };
      if (!bestFuzzy) {
        bestFuzzy = positioned;
        continue;
      }
      const betterScore = positioned.score > bestFuzzy.score + 0.001;
      const sameScoreEarlier = Math.abs(positioned.score - bestFuzzy.score) <= 0.001
        && positioned.index < bestFuzzy.index;
      const sameScoreSameIndex = Math.abs(positioned.score - bestFuzzy.score) <= 0.001
        && positioned.index === bestFuzzy.index
        && Math.abs(positioned.matchedText.length - canonical.length)
          < Math.abs(bestFuzzy.matchedText.length - canonical.length);
      if (betterScore || sameScoreEarlier || sameScoreSameIndex) {
        bestFuzzy = positioned;
      }
    }
  }

  return bestFuzzy;
}
