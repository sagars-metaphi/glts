const FULLWIDTH_ASCII_START = 0xff01;
const FULLWIDTH_ASCII_END = 0xff5e;
const FULLWIDTH_SPACE = 0x3000;

/** Normalize Chinese OCR text before field extraction. */
export function normalizeChineseOcrText(text) {
  if (!text) return '';

  let out = String(text)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t\u3000]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');

  out = toHalfWidthAscii(out);
  out = out
    .replace(/[：]/g, ':')
    .replace(/[，]/g, ',')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/[；]/g, ';')
    .replace(/[。]/g, '.')
    .replace(/[、]/g, ',')
    .replace(/[﹒·]/g, '.')
    .replace(/[﹣－—–]/g, '-')
    .replace(/[﹢＋]/g, '+');

  return out.trim();
}

function toHalfWidthAscii(text) {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code === FULLWIDTH_SPACE) {
      out += ' ';
    } else if (code >= FULLWIDTH_ASCII_START && code <= FULLWIDTH_ASCII_END) {
      out += String.fromCharCode(code - 0xfee0);
    } else {
      out += ch;
    }
  }
  return out;
}

/** Fix common OCR substitutions in alphanumeric codes (credit code, etc.). */
export function fixOcrCodeSubstitutions(value) {
  if (!value) return value;
  return String(value)
    .toUpperCase()
    .replace(/[OＯΟО]/g, '0')
    .replace(/[IＩΙ|]/g, '1')
    .replace(/[LＬ]/g, '1')
    .replace(/\s/g, '');
}
