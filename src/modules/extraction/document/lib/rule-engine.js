import { labelRegex } from './label-match.js';

const DEFAULT_WINDOW = 120;
const SEPARATORS = /[:：\-–—|]\s*/;

export function extractFields(text, template, sectionTexts = null) {
  const windowSize = template.windowSize ?? DEFAULT_WINDOW;
  const results = {};

  for (const [fieldName, fieldDef] of Object.entries(template.fields || {})) {
    const scopeKey = fieldDef.section;
    const scopeText =
      scopeKey && sectionTexts?.[scopeKey]?.text != null
        ? sectionTexts[scopeKey].text
        : text;
    const lines = scopeText.split('\n');
    results[fieldName] = extractOneField(scopeText, lines, fieldName, fieldDef, windowSize);
  }

  return results;
}

function extractOneField(fullText, lines, fieldName, fieldDef, windowSize) {
  const labels = [fieldDef.label, ...(fieldDef.aliases || [])].filter(Boolean);
  if (!labels.length) return nullResult(fieldName);

  const labelRe = labelRegex(labels);
  const valuePattern = fieldDef.valuePattern ? new RegExp(fieldDef.valuePattern, fieldDef.flags || 'i') : null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.match(labelRe);
    if (!match) continue;

    const matchedLabel = match[1];
    const afterLabel = line.slice(match.index + match[0].length);
    const sameLine = pickValue(afterLabel.replace(SEPARATORS, ' ').trim(), valuePattern);
    if (sameLine) return { field: fieldName, value: sameLine.value, confidence: sameLine.confidence, matchedLabel, method: 'same_line' };

    if (i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      const nextVal = pickValue(nextLine, valuePattern);
      if (nextVal && !looksLikeLabel(nextLine, labels)) {
        return { field: fieldName, value: nextVal.value, confidence: Math.min(0.9, nextVal.confidence), matchedLabel, method: 'next_line' };
      }
    }

    const labelPos = fullText.indexOf(line);
    if (labelPos >= 0) {
      const windowStart = labelPos + match.index + match[0].length;
      const windowText = fullText.slice(windowStart, windowStart + windowSize);
      const windowVal = pickValueFromWindow(windowText, valuePattern);
      if (windowVal) {
        return { field: fieldName, value: windowVal.value, confidence: Math.min(0.82, windowVal.confidence), matchedLabel, method: 'window' };
      }
    }
  }

  if (valuePattern) {
    const global = fullText.match(valuePattern);
    if (global?.[0]) {
      return { field: fieldName, value: global[0].trim(), confidence: 0.45, matchedLabel: labels[0], method: 'pattern_fallback' };
    }
  }

  return nullResult(fieldName);
}

function nullResult(field) {
  return { field, value: null, confidence: 0, matchedLabel: null, method: null };
}

function pickValue(candidate, valuePattern) {
  if (!candidate) return null;
  let value = candidate;
  if (valuePattern) {
    const m = candidate.match(valuePattern);
    if (!m) return null;
    value = m[0];
  }
  value = value.split(/\s{2,}/)[0].trim();
  if (!value || value.length > 500) return null;
  return { value, confidence: valuePattern ? 0.92 : 0.88 };
}

function pickValueFromWindow(windowText, valuePattern) {
  const cleaned = windowText.replace(SEPARATORS, ' ').replace(/\n/g, ' ').trim();
  if (!cleaned) return null;
  if (valuePattern) {
    const m = cleaned.match(valuePattern);
    if (!m) return null;
    return { value: m[0].trim(), confidence: 0.78 };
  }
  const chunk = cleaned.split(/\s{2,}|,\s*(?=[A-Z])/)[0]?.trim();
  if (!chunk) return null;
  return { value: chunk.slice(0, 200), confidence: 0.65 };
}

function looksLikeLabel(line, labels) {
  const lower = line.toLowerCase();
  return labels.some((l) => lower.startsWith(l.toLowerCase()));
}
