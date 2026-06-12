/**
 * Build ICAO 9303 MRV-A (2×44) visa MRZ lines with valid check digits.
 * Structure matches TD3 line layout (same as passport MRZ line 2).
 */
import { computeCheckDigit, verifyCheckDigit } from '../../src/modules/extraction/shared/lib/mrz-parser.js';

export function buildVisaLine1({ issuingCountry, surname, givenName }) {
  const head = `V<${String(issuingCountry).toUpperCase().slice(0, 3)}`;
  const names = `${String(surname).toUpperCase()}<<${String(givenName).toUpperCase().replace(/\s+/g, '<')}`;
  return (head + names).padEnd(44, '<').slice(0, 44);
}

export function buildVisaLine2({
  documentNumber,
  nationality,
  birthDate,
  sex,
  expiryDate,
  optional = '',
}) {
  const doc = String(documentNumber).toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(9, '<').slice(0, 9);
  const docCheck = computeCheckDigit(doc);
  const nat = String(nationality).toUpperCase().padEnd(3, '<').slice(0, 3);
  const birth = String(birthDate).replace(/\D/g, '').slice(0, 6);
  const birthCheck = computeCheckDigit(birth);
  const sexChar = String(sex).toUpperCase()[0] || '<';
  const exp = String(expiryDate).replace(/\D/g, '').slice(0, 6);
  const expCheck = computeCheckDigit(exp);
  const opt = String(optional).toUpperCase().replace(/[^A-Z0-9<]/g, '').padEnd(14, '<').slice(0, 14);
  const personalCheck = computeCheckDigit(opt);

  const body = doc + docCheck + nat + birth + birthCheck + sexChar + exp + expCheck + opt + personalCheck;
  if (body.length !== 43) {
    throw new Error(`Line 2 body must be 43 chars, got ${body.length}`);
  }
  const compositeData = body.slice(0, 10) + body.slice(13, 20) + body.slice(21, 43);
  const compositeCheck = computeCheckDigit(compositeData);
  return body + compositeCheck;
}

/** ICAO check-digit validation (mrz npm TD3 parser only accepts P< passports). */
export function validateVisaMrz(line1, line2) {
  if (line1.length !== 44 || line2.length !== 44) return { valid: false, checks: {} };
  if (!line1.startsWith('V<')) return { valid: false, checks: {} };
  const checks = {
    documentNumber: verifyCheckDigit(line2.slice(0, 9).replace(/</g, ''), line2[9]),
    birthDate: verifyCheckDigit(line2.slice(13, 19), line2[19]),
    expiryDate: verifyCheckDigit(line2.slice(21, 27), line2[27]),
    personalNumber: verifyCheckDigit(line2.slice(28, 42), line2[42]),
    composite: verifyCheckDigit(
      line2.slice(0, 10) + line2.slice(13, 20) + line2.slice(21, 43),
      line2[43],
    ),
  };
  return { valid: Object.values(checks).every(Boolean), checks };
}

export function buildValidVisaMrz(fields) {
  const line1 = buildVisaLine1(fields);
  const line2 = buildVisaLine2(fields);
  return { line1, line2, mrz: `${line1}\n${line2}`, ...fields };
}

/** Pre-built valid visa MRZ samples for tests and manual QA */
export const VALID_VISA_SAMPLES = [
  {
    id: 'us-b1b2-frankfurt-male',
    description: 'US visa (MRV-A), issued USA, German national, B-class style optional field',
    issuingCountry: 'USA',
    surname: 'SMITH',
    givenName: 'JOE',
    documentNumber: 'CZ6311T47',
    nationality: 'GER',
    birthDate: '960321',
    sex: 'M',
    expiryDate: '340212',
    optional: 'B1B2FRANKFUR',
    expected: {
      birthDate: '21/03/1996',
      expiryDate: '12/02/2034',
      issuingCountry: 'USA',
    },
  },
  {
    id: 'jp-temp-visitor-phl',
    description: 'Japan visa (MRV-A), PHL national',
    issuingCountry: 'JPN',
    surname: 'RIVERO',
    givenName: 'ROY<VAN',
    documentNumber: 'AB1234567',
    nationality: 'PHL',
    birthDate: '900515',
    sex: 'M',
    expiryDate: '251114',
    optional: '<<<<<<<<<<<<<<<',
    expected: {
      birthDate: '15/05/1990',
      expiryDate: '14/11/2025',
    },
  },
  {
    id: 'de-schengen-female',
    description: 'Germany visa (MRV-A), female holder',
    issuingCountry: 'DEU',
    surname: 'SCHMIDT',
    givenName: 'ANNA',
    documentNumber: 'C01X00T47',
    nationality: 'DEU',
    birthDate: '880712',
    sex: 'F',
    expiryDate: '280630',
    optional: '<<<<<<<<<<<<<<<',
    expected: {
      birthDate: '12/07/1988',
      expiryDate: '30/06/2028',
    },
  },
  {
    id: 'usa-michelle-style',
    description: 'US visa (MRV-A), female, long optional padding',
    issuingCountry: 'USA',
    surname: 'DOE',
    givenName: 'JANE',
    documentNumber: '910239248',
    nationality: 'USA',
    birthDate: '640117',
    sex: 'F',
    expiryDate: '181205',
    optional: '1234567890<<<<',
    expected: {
      birthDate: '17/01/1964',
      expiryDate: '05/12/2018',
    },
  },
  {
    id: 'gbr-visitor-ind',
    description: 'UK visa (MRV-A), Indian national',
    issuingCountry: 'GBR',
    surname: 'PATEL',
    givenName: 'RAHUL',
    documentNumber: 'Z12345678',
    nationality: 'IND',
    birthDate: '950803',
    sex: 'M',
    expiryDate: '270415',
    optional: 'VISITOR<CLASS',
    expected: {
      birthDate: '03/08/1995',
      expiryDate: '15/04/2027',
    },
  },
].map((sample) => {
  const built = buildValidVisaMrz(sample);
  return {
    ...sample,
    line1: built.line1,
    line2: built.line2,
    mrz: built.mrz,
  };
});
