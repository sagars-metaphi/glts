const TEXT_FIELDS = new Set([
  'companyName',
  'legalRepresentative',
  'companyType',
  'address',
  'businessScope',
  'registrationAuthority',
  'businessTerm',
]);

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

export function levenshteinSimilarity(a: string | null, b: string | null): number {
  if (a == null && b == null) return 1;
  if (a == null || b == null) return 0;
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return Math.round((1 - levenshteinDistance(a, b) / maxLen) * 1000) / 1000;
}

export function normalizeForSimilarity(value: string | null | undefined): string | null {
  if (value == null) return null;
  const v = String(value).trim().replace(/\s+/g, '');
  return v || null;
}

export interface SimilarityMetrics {
  exactMatch: boolean;
  normalizedMatch: boolean;
  levenshteinSimilarity: number;
}

export function computeSimilarity(
  expected: string | null,
  actual: string | null,
): SimilarityMetrics {
  const exactMatch = expected === actual;
  const normExp = normalizeForSimilarity(expected);
  const normAct = normalizeForSimilarity(actual);
  const normalizedMatch = normExp === normAct && normExp != null;
  return {
    exactMatch,
    normalizedMatch,
    levenshteinSimilarity: levenshteinSimilarity(normExp, normAct),
  };
}

export function isTextField(field: string): boolean {
  return TEXT_FIELDS.has(field);
}
