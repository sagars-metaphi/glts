import { findBestLabelMatchInText } from './fuzzyLabelMatch.js';

export const KNOWN_LABELS = [
  '统一社会信用代码',
  '名称',
  '注册资本',
  '类型',
  '成立日期',
  '法定代表人',
  '营业期限',
  '住所',
  '经营范围',
  '登记机关',
] as const;

export const FIELD_LABEL_MAP: Record<string, string> = {
  creditCode: '统一社会信用代码',
  companyName: '名称',
  registeredCapital: '注册资本',
  companyType: '类型',
  establishmentDate: '成立日期',
  legalRepresentative: '法定代表人',
  businessTerm: '营业期限',
  address: '住所',
  businessScope: '经营范围',
  registrationAuthority: '登记机关',
};

/** Additional stop labels per field (must also stop at any other known label). */
const FIELD_STOP_LABELS: Record<string, string[]> = {
  legalRepresentative: ['住所', '注册资本', '成立日期'],
  companyType: ['成立日期'],
  address: ['经营范围'],
};

export interface LabelPosition {
  label: string;
  index: number;
  end: number;
  fuzzy?: boolean;
  matchedText?: string;
}

export interface SegmentExtractionEntry {
  field: string;
  startLabel: string;
  nextLabel: string | null;
  rawSegment: string;
  boundaryExtracted: boolean;
  labelFound: boolean;
  fuzzyLabelUsed?: boolean;
  matchedLabelText?: string | null;
  scopeFallbackUsed?: boolean;
}

export interface SegmentExtractionResult {
  segments: Record<string, SegmentExtractionEntry>;
  fullText: string;
}

function collapseText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
}

export function findLabelPositions(text: string, labels: readonly string[] = KNOWN_LABELS): LabelPosition[] {
  const positions: LabelPosition[] = [];

  for (const label of labels) {
    const match = findBestLabelMatchInText(text, label);
    if (!match) continue;
    positions.push({
      label,
      index: match.index,
      end: match.end,
      fuzzy: !match.exact,
      matchedText: match.matchedText,
    });
  }

  positions.sort((a, b) => a.index - b.index || b.label.length - a.label.length);

  const deduped: LabelPosition[] = [];
  for (const pos of positions) {
    const overlap = deduped.find(
      (d) => pos.index < d.end && pos.end > d.index,
    );
    if (!overlap) deduped.push(pos);
    else if (pos.label.length > overlap.label.length) {
      const idx = deduped.indexOf(overlap);
      deduped[idx] = pos;
    } else if (pos.label.length === overlap.label.length && !pos.fuzzy && overlap.fuzzy) {
      const idx = deduped.indexOf(overlap);
      deduped[idx] = pos;
    }
  }

  return deduped.sort((a, b) => a.index - b.index);
}

function getStopLabels(field: string): string[] {
  const own = FIELD_LABEL_MAP[field];
  const base = KNOWN_LABELS.filter((l) => l !== own);
  const extra = FIELD_STOP_LABELS[field] || [];
  return [...new Set([...base, ...extra])];
}

function findNextLabel(
  afterIndex: number,
  stopLabels: string[],
  allPositions: LabelPosition[],
): { label: string | null; index: number | null } {
  let best: { label: string; index: number } | null = null;

  for (const pos of allPositions) {
    if (pos.index < afterIndex) continue;
    if (!stopLabels.includes(pos.label)) continue;
    if (!best || pos.index < best.index) {
      best = { label: pos.label, index: pos.index };
    }
  }

  return { label: best?.label ?? null, index: best?.index ?? null };
}

function trimSegment(segment: string): string {
  return segment
    .replace(/^[\s:：,，.。;；|/\\\-–—]+/, '')
    .replace(/[\s:：,，.。;；|/\\\-–—]+$/, '')
    .trim();
}

const SCOPE_LABEL_RE = /经\s*营\s*[·.\s]*范\s*围/;

function extractBusinessScopeFallback(text: string, positions: LabelPosition[]): string {
  const regPos = positions.find((p) => p.label === '登记机关');
  if (!regPos) return '';

  const addrPos = positions.find((p) => p.label === '住所');
  const typePos = positions.find((p) => p.label === '类型');
  const start = Math.max(addrPos?.end ?? 0, typePos?.end ?? 0);

  let chunk = text.slice(start, regPos.index);
  const scopeMatch = chunk.match(SCOPE_LABEL_RE);
  if (scopeMatch?.index != null) {
    chunk = chunk.slice(scopeMatch.index).replace(SCOPE_LABEL_RE, '');
  } else {
    const businessTermPos = positions.find((p) => p.label === '营业期限');
    if (businessTermPos) {
      chunk = text.slice(businessTermPos.end, regPos.index).replace(SCOPE_LABEL_RE, '');
    }
  }

  return trimSegment(chunk);
}

/** Label-to-label segmentation only; field processing is delegated to ChineseFieldProcessor. */
export function extractByLabelSegments(rawText: string): SegmentExtractionResult {
  const text = collapseText(rawText);
  const positions = findLabelPositions(text);
  const segments: Record<string, SegmentExtractionEntry> = {};

  for (const [field, startLabel] of Object.entries(FIELD_LABEL_MAP)) {
    const startPos = positions.find((p) => p.label === startLabel);
    if (!startPos) {
      if (field === 'businessScope') {
        const fallback = extractBusinessScopeFallback(text, positions);
        segments[field] = {
          field,
          startLabel,
          nextLabel: fallback ? '登记机关' : null,
          rawSegment: fallback,
          boundaryExtracted: Boolean(fallback),
          labelFound: false,
          scopeFallbackUsed: Boolean(fallback),
        };
        continue;
      }

      segments[field] = {
        field,
        startLabel,
        nextLabel: null,
        rawSegment: '',
        boundaryExtracted: false,
        labelFound: false,
      };
      continue;
    }

    const stopLabels = getStopLabels(field);
    const next = findNextLabel(startPos.end, stopLabels, positions);
    const rawSegment = trimSegment(text.slice(startPos.end, next.index ?? text.length));

    segments[field] = {
      field,
      startLabel,
      nextLabel: next.label,
      rawSegment,
      boundaryExtracted: Boolean(next.label),
      labelFound: true,
      fuzzyLabelUsed: Boolean(startPos.fuzzy),
      matchedLabelText: startPos.matchedText ?? null,
    };
  }

  return { segments, fullText: text };
}
