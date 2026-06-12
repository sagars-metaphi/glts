import type { CorruptionLevel } from './constants.js';

/** OCR confusion pairs (mistake -> possible correct). Used to simulate OCR errors. */
export const OCR_CONFUSION_PAIRS: Array<[string, string]> = [
  ['资', '责'],
  ['责', '资'],
  ['当', '雪'],
  ['雪', '当'],
  ['述', '金'],
  ['金', '述'],
  ['信', '佰'],
  ['佰', '信'],
  ['很', '限'],
  ['限', '很'],
  ['贡', '任'],
  ['任', '贡'],
  ['有限', '有很'],
  ['有限公司', '有很公司'],
  ['有限责任公司', '有限资任公司'],
];

const LEVEL_CONFIG: Record<CorruptionLevel, { substitutions: number; dropChars: number; insertNoise: number; lineBreaks: number }> = {
  none: { substitutions: 0, dropChars: 0, insertNoise: 0, lineBreaks: 0 },
  low: { substitutions: 2, dropChars: 0, insertNoise: 1, lineBreaks: 0 },
  medium: { substitutions: 4, dropChars: 1, insertNoise: 2, lineBreaks: 1 },
  high: { substitutions: 8, dropChars: 2, insertNoise: 4, lineBreaks: 2 },
  extreme: { substitutions: 14, dropChars: 4, insertNoise: 8, lineBreaks: 4 },
};

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function applySubstitution(text: string, from: string, to: string, rng: () => number): string {
  if (!text.includes(from)) return text;
  const indices: number[] = [];
  let pos = 0;
  while ((pos = text.indexOf(from, pos)) !== -1) {
    indices.push(pos);
    pos += from.length;
  }
  if (!indices.length) return text;
  const idx = indices[Math.floor(rng() * indices.length)];
  return text.slice(0, idx) + to + text.slice(idx + from.length);
}

function randomSubstitution(text: string, rng: () => number): string {
  const pair = OCR_CONFUSION_PAIRS[Math.floor(rng() * OCR_CONFUSION_PAIRS.length)];
  const forward = rng() > 0.5;
  return applySubstitution(text, forward ? pair[0] : pair[1], forward ? pair[1] : pair[0], rng);
}

function dropRandomChar(text: string, rng: () => number): string {
  if (text.length < 8) return text;
  const i = 4 + Math.floor(rng() * (text.length - 8));
  return text.slice(0, i) + text.slice(i + 1);
}

function insertNoise(text: string, rng: () => number): string {
  const noise = ['#', '!', ':', ' ', '·', '|', '_'][Math.floor(rng() * 7)];
  const i = 2 + Math.floor(rng() * Math.max(1, text.length - 4));
  return text.slice(0, i) + noise + text.slice(i);
}

function insertLineBreak(text: string, rng: () => number): string {
  const lines = text.split('\n');
  const li = Math.floor(rng() * lines.length);
  const line = lines[li];
  if (line.length < 10) return text;
  const splitAt = 4 + Math.floor(rng() * (line.length - 8));
  lines[li] = line.slice(0, splitAt) + '\n' + line.slice(splitAt);
  return lines.join('\n');
}

export interface CorruptionResult {
  text: string;
  operations: string[];
}

export function corruptOcrText(
  text: string,
  level: CorruptionLevel,
  seed = Math.floor(Math.random() * 1e9),
): CorruptionResult {
  const cfg = LEVEL_CONFIG[level];
  const rng = mulberry32(seed);
  let out = text;
  const operations: string[] = [];

  for (let i = 0; i < cfg.substitutions; i += 1) {
    const before = out;
    out = randomSubstitution(out, rng);
    if (out !== before) operations.push('substitution');
  }
  for (let i = 0; i < cfg.dropChars; i += 1) {
    const before = out;
    out = dropRandomChar(out, rng);
    if (out !== before) operations.push('drop_char');
  }
  for (let i = 0; i < cfg.insertNoise; i += 1) {
    out = insertNoise(out, rng);
    operations.push('insert_noise');
  }
  for (let i = 0; i < cfg.lineBreaks; i += 1) {
    out = insertLineBreak(out, rng);
    operations.push('line_break');
  }

  return { text: out, operations };
}
