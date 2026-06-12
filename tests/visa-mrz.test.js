/**
 * Valid visa MRZ fixture tests (MRV-A 2×44).
 * Run: npm run test:visa
 */
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  VALID_VISA_SAMPLES,
  validateVisaMrz,
} from './fixtures/visa-mrz-generator.js';
import { extractVisaData } from '../src/modules/extraction/shared/lib/visa-extract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}: ${e.message}`);
    throw e;
  }
}

console.log('\n=== VALID VISA MRZ FIXTURES ===\n');

for (const sample of VALID_VISA_SAMPLES) {
  test(`ICAO check digits: ${sample.id}`, () => {
    const { valid, checks } = validateVisaMrz(sample.line1, sample.line2);
    assert(valid === true, `checks failed: ${JSON.stringify(checks)}`);
    assert(sample.line1.length === 44, `line1 length ${sample.line1.length}`);
    assert(sample.line2.length === 44, `line2 length ${sample.line2.length}`);
    assert(sample.line1.startsWith('V<'), 'line1 must start with V<');
  });

  test(`visa extractor fields: ${sample.id}`, () => {
    const { mrzData } = extractVisaData(sample.mrz, sample.mrz);
    assert(mrzData?.documentType === 'V', `documentType ${mrzData?.documentType}`);
    assert(mrzData?.fields?.surname === sample.surname, `surname ${mrzData?.fields?.surname}`);
    const given = sample.givenName.replace(/</g, ' ');
    assert(
      mrzData?.fields?.givenName?.replace(/</g, ' ').includes(given.split(' ')[0]),
      `givenName ${mrzData?.fields?.givenName}`,
    );
    assert(mrzData?.fields?.issuingCountry === sample.issuingCountry, 'issuingCountry');
  });
}

const jsonOut = VALID_VISA_SAMPLES.map(
  ({ id, description, line1, line2, mrz, issuingCountry, surname, givenName, documentNumber, nationality }) => ({
    id,
    description,
    line1,
    line2,
    mrz,
    meta: { issuingCountry, surname, givenName, documentNumber, nationality },
  }),
);
writeFileSync(
  join(__dirname, 'fixtures/valid-visa-mrz.json'),
  JSON.stringify(jsonOut, null, 2),
  'utf8',
);

console.log('\n--- Copy-paste MRZ for manual / API tests ---\n');
for (const s of VALID_VISA_SAMPLES) {
  console.log(`# ${s.id} — ${s.description}`);
  console.log(s.line1);
  console.log(s.line2);
  console.log('');
}

console.log(`Total valid visa samples: ${VALID_VISA_SAMPLES.length}`);
console.log('Wrote tests/fixtures/valid-visa-mrz.json\n');
