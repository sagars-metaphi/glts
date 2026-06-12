import type { DetailedFailureRecord } from './diagnostics.js';

export interface RootCausePattern {
  id: string;
  label: string;
  description: string;
  test: (failure: DetailedFailureRecord) => boolean;
}

export interface RankedRootCause {
  rank: number;
  id: string;
  label: string;
  description: string;
  impact: number;
  affectedFields: string[];
  exampleDocumentIds: string[];
}

export const ROOT_CAUSE_PATTERNS: RootCausePattern[] = [
  {
    id: 'punctuation_in_credit_code',
    label: 'Punctuation injected into credit code',
    description: 'OCR inserts · # ! : _ into 18-digit USCC breaking boundary regex',
    test: (f) =>
      f.field === 'creditCode'
      && (/[·#!_:]/.test(f.ocrText) || /统一社会[^信]用代码/.test(f.ocrText)),
  },
  {
    id: 'label_corruption',
    label: 'Label text corrupted',
    description: 'Known labels damaged (统一社会佰用代码, 注册责本, 经营·范围, 营业期很, 经范围)',
    test: (f) =>
      /统一社会[^信]用代码|注册责本|经营[·.\s]*范围|营业期很|经范围|成立日很/.test(f.ocrText)
      && ['creditCode', 'registeredCapital', 'businessScope', 'businessTerm', 'address'].includes(f.field),
  },
  {
    id: 'limited_company_ocr',
    label: '有限公司 → 有很公司 OCR confusion',
    description: '限/有/很 character confusion in company suffix',
    test: (f) =>
      (f.field === 'companyName' || f.field === 'companyType')
      && (f.actual?.includes('有很') || f.rawSegment?.includes('有很') || f.ocrText.includes('有很公司')),
  },
  {
    id: 'company_name_boundary',
    label: 'companyName boundary extraction',
    description: 'Name segment truncated or merged with 注册资本 due to suffix/label issues',
    test: (f) =>
      f.field === 'companyName'
      && Boolean(f.actual && f.expected && f.actual.length < f.expected.length - 2),
  },
  {
    id: 'credit_checksum_reject',
    label: 'Credit code checksum rejection',
    description: 'Valid expected code corrupted; no checksum-valid candidate selected',
    test: (f) =>
      f.field === 'creditCode'
      && f.expected != null
      && f.actual !== f.expected,
  },
  {
    id: 'business_scope_label_break',
    label: 'businessScope OCR degradation',
    description: '经营范围 label broken or segment empty',
    test: (f) =>
      f.field === 'businessScope'
      && (f.actual == null || /经营[·.\s]*范围|经范围/.test(f.ocrText)),
  },
  {
    id: 'address_over_capture',
    label: 'address boundary over-capture',
    description: '住所 segment bleeds into 营业期限/经营范围 when labels corrupted',
    test: (f) =>
      f.field === 'address'
      && Boolean(f.actual && f.expected && f.actual.length > f.expected.length + 10),
  },
  {
    id: 'address_ocr_noise',
    label: 'Address OCR noise characters',
    description: 'Underscores or punctuation inserted in address (_168号)',
    test: (f) =>
      f.field === 'address'
      && Boolean(f.actual?.includes('_') || f.actual?.includes('·')),
  },
  {
    id: 'legal_rep_confusion',
    label: 'Legal representative confusion correction',
    description: 'Name altered by char-level confusion resolver',
    test: (f) =>
      f.field === 'legalRepresentative'
      && f.actual != null
      && f.expected != null
      && f.levenshteinSimilarity > 0.5
      && f.levenshteinSimilarity < 1,
  },
  {
    id: 'high_confidence_wrong',
    label: 'High-confidence wrong extraction',
    description: 'Field wrong but confidence >= 0.85',
    test: (f) => f.confidence >= 0.85 && !f.exactMatch,
  },
  {
    id: 'date_ocr_noise',
    label: 'Date OCR noise',
    description: 'Punctuation/line-breaks inside dates (2!008, 20\\n35)',
    test: (f) =>
      (f.field === 'establishmentDate' || f.field === 'businessTerm')
      && /[!_\n]/.test(f.actual || f.rawSegment || ''),
  },
];

export function rankRootCauses(failures: DetailedFailureRecord[]): RankedRootCause[] {
  const scored = ROOT_CAUSE_PATTERNS.map((pattern) => {
    const matched = failures.filter((f) => pattern.test(f));
    const affectedFields = [...new Set(matched.map((m) => m.field))];
    const exampleDocumentIds = [...new Set(matched.map((m) => m.documentId))].slice(0, 5);
    return {
      id: pattern.id,
      label: pattern.label,
      description: pattern.description,
      impact: matched.length,
      affectedFields,
      exampleDocumentIds,
    };
  })
    .filter((r) => r.impact > 0)
    .sort((a, b) => b.impact - a.impact);

  return scored.map((r, i) => ({ rank: i + 1, ...r }));
}

export function buildRecommendations(causes: RankedRootCause[]): Array<{
  priority: number;
  rootCauseId: string;
  recommendation: string;
  impact: number;
}> {
  const recs: Record<string, string> = {
    punctuation_in_credit_code:
      'Strip punctuation from credit-code window before candidate search; retry O→0 / l→1 normalization per candidate.',
    label_corruption:
      'Add fuzzy label matching (Levenshtein ≤1) for 统一社会信用代码, 注册资本, 经营范围, 营业期限.',
    limited_company_ocr:
      'Do not auto-correct companyName; for companyType only, score 有很→有限 via confusion resolver.',
    company_name_boundary:
      'Improve 名称→注册资本 stop detection when 有限公司 appears inside merged OCR line.',
    credit_checksum_reject:
      'When expected region has punctuation, expand candidate search with punctuation-stripped sliding windows.',
    business_scope_label_break:
      'Fuzzy-match 经营范围 label; fallback to line after 住所 if scope label missing.',
    address_over_capture:
      'Strengthen 住所 stop labels when 营业期限/经营范围 labels are corrupted.',
    address_ocr_noise:
      'Strip isolated underscores/punctuation in address post-process without inventing text.',
    legal_rep_confusion:
      'Reduce confusion resolver aggression on legalRepresentative; require Chinese-name validator pass.',
    high_confidence_wrong:
      'Penalize confidence when rawSegment diverges from extracted value or label boundary missing.',
    date_ocr_noise:
      'Pre-clean dates: remove ! _ and rejoin split year tokens before normalizeChineseDate.',
  };

  return causes.map((c, i) => ({
    priority: i + 1,
    rootCauseId: c.id,
    recommendation: recs[c.id] || `Investigate pattern: ${c.label}`,
    impact: c.impact,
  }));
}
