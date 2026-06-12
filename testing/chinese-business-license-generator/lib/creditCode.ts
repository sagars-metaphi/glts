const CHARSET = '0123456789ABCDEFGHJKLMNPQRTUWXY';
const WEIGHTS = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28];

const REGION_CODES = ['110000', '310000', '440300', '440100', '330100', '510100', '420100', '320100'];

function checksumFor(body17: string): string {
  let sum = 0;
  for (let i = 0; i < 17; i += 1) {
    const idx = CHARSET.indexOf(body17[i]);
    if (idx < 0) throw new Error(`invalid char in credit code body: ${body17[i]}`);
    sum += idx * WEIGHTS[i];
  }
  const checkIdx = (31 - (sum % 31)) % 31;
  return CHARSET[checkIdx];
}

/** Generate a valid 18-character Unified Social Credit Code. */
export function generateCreditCode(rng: () => number = Math.random): string {
  const region = REGION_CODES[Math.floor(rng() * REGION_CODES.length)];
  let body = '91' + region;

  while (body.length < 17) {
    body += CHARSET[Math.floor(rng() * 10)];
  }
  body = body.slice(0, 17);

  return body + checksumFor(body);
}

export function isValidCreditCode(code: string): boolean {
  if (code.length !== 18) return false;
  return code[17] === checksumFor(code.slice(0, 17));
}
