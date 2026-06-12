/**
 * Generates 200 PNG visa image fixtures (10 countries × 20 variants).
 * Run: node tests/fixtures/visa-image-generator.mjs
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { buildVisaLine1, buildVisaLine2 } from './visa-mrz-generator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const IMAGE_ROOT = path.join(ROOT, 'tests/fixtures/visa-images');
const GT_ROOT = path.join(ROOT, 'tests/fixtures/visa-groundtruth');

const WIDTH = 1000;
const HEIGHT = 1400;

export const VARIANTS = [
  { id: '01_clean', degradation: 'none', description: 'Clean high-resolution scan' },
  { id: '02_low_dpi', degradation: 'low_dpi', description: 'Downscaled to simulate ~96 DPI' },
  { id: '03_motion_blur', degradation: 'motion_blur', description: 'Directional motion blur' },
  { id: '04_gaussian_blur', degradation: 'gaussian_blur', description: 'Gaussian blur sigma=2' },
  { id: '05_skewed', degradation: 'skewed', description: 'Rotation ±4°' },
  { id: '06_perspective', degradation: 'perspective', description: 'Affine shear transform' },
  { id: '07_partial_crop', degradation: 'partial_crop', description: '15% cropped from edges' },
  { id: '08_dark', degradation: 'dark', description: 'Reduced brightness' },
  { id: '09_overexposed', degradation: 'overexposed', description: 'High brightness/contrast' },
  { id: '10_glare', degradation: 'glare', description: 'Specular glare overlay' },
  { id: '11_stamp', degradation: 'stamp', description: 'Ink stamp over name fields' },
  { id: '12_ocr_a_font', degradation: 'font_ocr_a', description: 'Monospace OCR-style font' },
  { id: '13_arial_font', degradation: 'font_arial', description: 'Arial sans-serif' },
  { id: '14_mixed_fonts', degradation: 'font_mixed', description: 'Mixed label/value fonts' },
  { id: '15_long_names', degradation: 'content_long_names', description: 'Given name >40 chars' },
  { id: '16_multiple_surnames', degradation: 'content_multi_surname', description: 'Compound surnames' },
  { id: '17_special_characters', degradation: 'content_special_chars', description: 'Accented Latin names' },
  { id: '18_invalid_mrz', degradation: 'content_invalid_mrz', description: 'MRZ with bad check digit' },
  { id: '19_missing_mrz', degradation: 'content_missing_mrz', description: 'No MRZ printed' },
  { id: '20_expired', degradation: 'content_expired', description: 'Expired visa dates' },
];

export const COUNTRY_PROFILES = {
  usa: {
    folder: 'usa',
    title: 'UNITED STATES VISA',
    issuingCountry: 'USA',
    surname: 'SMITH',
    givenNames: 'JOHN',
    nationality: 'GER',
    passportNumber: 'CZ6311T47',
    sex: 'M',
    dateOfBirth: '15/03/1996',
    issueDate: '01/06/2024',
    expiryDate: '12/02/2034',
    visaType: 'B1/B2',
    controlNumber: '9102392482',
    entries: 'M',
    placeOfIssue: 'FRANKFURT',
    purposeOfTravel: 'TOURISM',
    birthMrz: '960315',
    expiryMrz: '340212',
    optional: 'B1B2FRANKFUR',
  },
  schengen: {
    folder: 'schengen',
    title: 'SCHENGEN VISA',
    issuingCountry: 'DEU',
    surname: 'SCHMIDT',
    givenNames: 'ANNA',
    nationality: 'DEU',
    passportNumber: 'C01X00T47',
    sex: 'F',
    dateOfBirth: '12/07/1988',
    issueDate: '15/03/2024',
    expiryDate: '30/06/2028',
    visaType: 'C',
    visaCategory: 'C',
    entries: 'M',
    placeOfIssue: 'BERLIN',
    durationOfStay: '90 days',
    purposeOfTravel: 'TOURISM',
    birthMrz: '880712',
    expiryMrz: '280630',
    optional: 'SCHENGEN',
  },
  uk: {
    folder: 'uk',
    title: 'UK VISA VIGNETTE',
    issuingCountry: 'GBR',
    surname: 'PATEL',
    givenNames: 'RAHUL',
    nationality: 'IND',
    passportNumber: 'Z12345678',
    sex: 'M',
    dateOfBirth: '03/08/1995',
    issueDate: '10/01/2024',
    expiryDate: '15/04/2027',
    visaType: 'VISITOR',
    entries: 'M',
    placeOfIssue: 'LONDON',
    purposeOfTravel: 'TOURISM',
    birthMrz: '950803',
    expiryMrz: '270415',
    optional: 'VISITOR',
  },
  canada: {
    folder: 'canada',
    title: 'CANADA TEMPORARY RESIDENT VISA',
    issuingCountry: 'CAN',
    surname: 'TREMBLAY',
    givenNames: 'MARIE',
    nationality: 'FRA',
    passportNumber: 'AB1234567',
    sex: 'F',
    dateOfBirth: '20/11/1992',
    issueDate: '05/02/2024',
    expiryDate: '05/02/2029',
    visaType: 'VISITOR',
    entries: 'M',
    placeOfIssue: 'MONTREAL',
    purposeOfTravel: 'TOURISM',
    birthMrz: '921120',
    expiryMrz: '290205',
    optional: 'VISITOR',
  },
  australia: {
    folder: 'australia',
    title: 'AUSTRALIA VISA GRANT',
    issuingCountry: 'AUS',
    surname: 'NGUYEN',
    givenNames: 'LINH',
    nationality: 'VNM',
    passportNumber: 'PA1234567',
    sex: 'F',
    dateOfBirth: '08/05/1991',
    issueDate: '12/08/2024',
    expiryDate: '12/08/2027',
    visaType: '600',
    visaLabelNumber: 'GRANT99887766',
    entries: 'M',
    placeOfIssue: 'SYDNEY',
    purposeOfTravel: 'TOURISM',
    birthMrz: '910508',
    expiryMrz: '270812',
    optional: 'SUBCLASS600',
  },
  uae: {
    folder: 'uae',
    title: 'UAE RESIDENCE VISA',
    issuingCountry: 'ARE',
    surname: 'HASSAN',
    givenNames: 'OMAR',
    nationality: 'EGY',
    passportNumber: 'K12345678',
    sex: 'M',
    dateOfBirth: '14/09/1987',
    issueDate: '01/03/2024',
    expiryDate: '01/03/2026',
    visaType: 'WORK',
    sponsor: 'EMIRATES TECH LLC',
    employer: 'EMIRATES TECH LLC',
    entries: 'M',
    placeOfIssue: 'DUBAI',
    purposeOfTravel: 'WORK',
    birthMrz: '870914',
    expiryMrz: '260301',
    optional: 'WORKVISA',
  },
  india: {
    folder: 'india',
    title: 'INDIA e-VISA',
    issuingCountry: 'IND',
    surname: 'SHARMA',
    givenNames: 'PRIYA',
    nationality: 'USA',
    passportNumber: '512345678',
    sex: 'F',
    dateOfBirth: '22/04/1990',
    issueDate: '18/07/2024',
    expiryDate: '18/07/2025',
    visaType: 'TOURIST',
    entries: 'D',
    placeOfIssue: 'DELHI',
    purposeOfTravel: 'TOURISM',
    birthMrz: '900422',
    expiryMrz: '250718',
    optional: 'EVISA',
  },
  singapore: {
    folder: 'singapore',
    title: 'SINGAPORE VISA',
    issuingCountry: 'SGP',
    surname: 'TAN',
    givenNames: 'WEI MING',
    nationality: 'MYS',
    passportNumber: 'A12345678',
    sex: 'M',
    dateOfBirth: '30/01/1993',
    issueDate: '06/06/2024',
    expiryDate: '06/06/2026',
    visaType: 'SOCIAL',
    entries: 'S',
    placeOfIssue: 'SINGAPORE',
    purposeOfTravel: 'BUSINESS',
    birthMrz: '930130',
    expiryMrz: '260606',
    optional: 'SOCIALVIS',
  },
  japan: {
    folder: 'japan',
    title: 'JAPAN VISA',
    issuingCountry: 'JPN',
    surname: 'KIM',
    givenNames: 'MIN-JUN',
    nationality: 'KOR',
    passportNumber: 'M87654321',
    sex: 'M',
    dateOfBirth: '05/05/1989',
    issueDate: '20/09/2024',
    expiryDate: '20/09/2027',
    visaType: 'TEMPORARY',
    entries: 'S',
    placeOfIssue: 'TOKYO',
    purposeOfTravel: 'TOURISM',
    birthMrz: '890505',
    expiryMrz: '270920',
    optional: 'TEMPVISIT',
  },
  china: {
    folder: 'china',
    title: 'CHINA VISA',
    issuingCountry: 'CHN',
    surname: 'WANG',
    givenNames: 'XIAOMING',
    nationality: 'CHN',
    passportNumber: 'E12345678',
    sex: 'M',
    dateOfBirth: '10/10/1985',
    issueDate: '11/11/2024',
    expiryDate: '11/11/2029',
    visaType: 'L',
    entries: 'M',
    placeOfIssue: 'BEIJING',
    purposeOfTravel: 'TOURISM',
    birthMrz: '851010',
    expiryMrz: '291111',
    optional: 'TOURISTL',
  },
};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildMrz(profile, { invalid = false, missing = false } = {}) {
  if (missing) return { line1: null, line2: null, mrzValid: false };
  const line1 = buildVisaLine1({
    issuingCountry: profile.issuingCountry,
    surname: profile.surname.replace(/\s+/g, ''),
    givenName: profile.givenNames.split(/\s+/)[0],
  });
  let line2 = buildVisaLine2({
    documentNumber: profile.passportNumber,
    nationality: profile.nationality,
    birthDate: profile.birthMrz,
    sex: profile.sex,
    expiryDate: profile.expiryMrz,
    optional: profile.optional || '',
  });
  if (invalid) {
    const chars = line2.split('');
    chars[43] = chars[43] === '0' ? '1' : '0';
    line2 = chars.join('');
  }
  return { line1, line2, mrzValid: !invalid };
}

function applyContentVariant(profile, variantId) {
  const p = { ...profile };
  if (variantId === '15_long_names') {
    p.givenNames = 'ALEXANDER CHRISTOPHER MONTGOMERY FITZGERALD';
  }
  if (variantId === '16_multiple_surnames') {
    p.surname = 'GARCIA LOPEZ';
  }
  if (variantId === '17_special_characters') {
    p.surname = 'GARCÍA';
    p.givenNames = 'JOSÉ MARÍA';
  }
  if (variantId === '20_expired') {
    p.expiryDate = '01/01/2020';
    p.expiryMrz = '200101';
  }
  return p;
}

function fontConfig(variantId) {
  const mono = 'Courier New, Courier, monospace';
  const sans = 'Arial, Helvetica, sans-serif';
  if (variantId === '12_ocr_a_font') {
    return { label: mono, value: mono, mrz: mono };
  }
  if (variantId === '13_arial_font') {
    return { label: sans, value: sans, mrz: sans };
  }
  if (variantId === '14_mixed_fonts') {
    return { label: sans, value: mono, mrz: mono };
  }
  return { label: sans, value: sans, mrz: mono };
}

function renderSvg(profile, { includeMrz, line1, line2, fonts }) {
  const rows = [
    ['SURNAME', profile.surname],
    ['GIVEN NAMES', profile.givenNames],
    ['NATIONALITY', profile.nationality],
    ['PASSPORT NO', profile.passportNumber],
    ['DATE OF BIRTH', profile.dateOfBirth],
    ['SEX', profile.sex],
    ['ISSUE DATE', profile.issueDate],
    ['EXPIRY DATE', profile.expiryDate],
    ['ENTRIES', profile.entries],
    ['VISA TYPE', profile.visaType],
    ['PLACE OF ISSUE', profile.placeOfIssue],
  ];
  if (profile.controlNumber) rows.push(['CONTROL NO', profile.controlNumber]);
  if (profile.visaCategory) rows.push(['CATEGORY', profile.visaCategory]);
  if (profile.visaLabelNumber) rows.push(['GRANT NO', profile.visaLabelNumber]);
  if (profile.sponsor) rows.push(['SPONSOR', profile.sponsor]);
  if (profile.purposeOfTravel) rows.push(['PURPOSE', profile.purposeOfTravel]);

  let y = 120;
  const rowSvg = rows
    .map(([label, val]) => {
      const block = `
    <text x="60" y="${y}" font-family="${fonts.label}" font-size="22" fill="#333" font-weight="bold">${esc(label)}:</text>
    <text x="320" y="${y}" font-family="${fonts.value}" font-size="24" fill="#111">${esc(val)}</text>`;
      y += 52;
      return block;
    })
    .join('\n');

  const mrzSvg =
    includeMrz && line1 && line2
      ? `
    <rect x="40" y="1180" width="920" height="160" fill="#fff" stroke="#999"/>
    <text x="50" y="1225" font-family="${fonts.mrz}" font-size="28" fill="#000" letter-spacing="2">${esc(line1)}</text>
    <text x="50" y="1285" font-family="${fonts.mrz}" font-size="28" fill="#000" letter-spacing="2">${esc(line2)}</text>`
      : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#f5f2ea"/>
  <rect x="30" y="30" width="940" height="120" fill="#1a3c6e"/>
  <text x="500" y="105" text-anchor="middle" font-family="${fonts.label}" font-size="42" fill="#fff" font-weight="bold">${esc(profile.title)}</text>
  ${rowSvg}
  ${mrzSvg}
</svg>`;
}

async function renderBasePng(profile, variant) {
  const contentVariant = ['15_long_names', '16_multiple_surnames', '17_special_characters', '18_invalid_mrz', '19_missing_mrz', '20_expired'].includes(variant.id);
  const p = contentVariant ? applyContentVariant(profile, variant.id) : { ...profile };
  const missingMrz = variant.id === '19_missing_mrz';
  const invalidMrz = variant.id === '18_invalid_mrz';
  const mrz = buildMrz(p, { invalid: invalidMrz, missing: missingMrz });
  const fonts = fontConfig(variant.id);
  const svg = renderSvg(p, {
    includeMrz: !missingMrz,
    line1: mrz.line1,
    line2: mrz.line2,
    fonts,
  });
  const base = await sharp(Buffer.from(svg)).png().toBuffer();
  return { buffer: base, profile: p, mrz };
}

async function applyDegradation(buffer, variant, countryKey) {
  const deg = variant.degradation;
  const skewDir = countryKey.length % 2 === 0 ? 1 : -1;

  switch (deg) {
    case 'none':
    case 'font_ocr_a':
    case 'font_arial':
    case 'font_mixed':
    case 'content_long_names':
    case 'content_multi_surname':
    case 'content_special_chars':
    case 'content_invalid_mrz':
    case 'content_missing_mrz':
    case 'content_expired':
      return buffer;

    case 'low_dpi': {
      const meta = await sharp(buffer).metadata();
      const w = meta.width || WIDTH;
      const h = meta.height || HEIGHT;
      return sharp(buffer)
        .resize(Math.round(w * 0.42), Math.round(h * 0.42), { kernel: 'cubic' })
        .resize(w, h, { kernel: 'nearest' })
        .png()
        .toBuffer();
    }

    case 'motion_blur':
      return sharp(buffer).blur(2.5).png().toBuffer();

    case 'gaussian_blur':
      return sharp(buffer).blur(3.5).png().toBuffer();

    case 'skewed':
      return sharp(buffer).rotate(4 * skewDir, { background: '#f5f2ea' }).png().toBuffer();

    case 'perspective':
      return sharp(buffer)
        .affine([[1, 0.12 * skewDir], [0.02, 1]], { background: '#f5f2ea' })
        .png()
        .toBuffer();

    case 'partial_crop': {
      const meta = await sharp(buffer).metadata();
      const w = meta.width || WIDTH;
      const h = meta.height || HEIGHT;
      const left = Math.round(w * 0.08);
      const top = Math.round(h * 0.05);
      const cw = Math.round(w * 0.84);
      const ch = Math.round(h * 0.88);
      return sharp(buffer).extract({ left, top, width: cw, height: ch }).png().toBuffer();
    }

    case 'dark':
      return sharp(buffer).modulate({ brightness: 0.55 }).png().toBuffer();

    case 'overexposed':
      return sharp(buffer).modulate({ brightness: 1.45 }).linear(1.2, -30).png().toBuffer();

    case 'glare': {
      const glareSvg = Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}">
        <defs><radialGradient id="g" cx="70%" cy="25%" r="45%">
          <stop offset="0%" stop-color="white" stop-opacity="0.85"/>
          <stop offset="100%" stop-color="white" stop-opacity="0"/>
        </radialGradient></defs>
        <rect width="100%" height="100%" fill="url(#g)"/>
      </svg>`);
      const glare = await sharp(glareSvg).png().toBuffer();
      return sharp(buffer).composite([{ input: glare, blend: 'screen' }]).png().toBuffer();
    }

    case 'stamp': {
      const stampSvg = Buffer.from(`<svg width="260" height="260">
        <circle cx="130" cy="130" r="120" fill="none" stroke="#b22222" stroke-width="8" opacity="0.75"/>
        <text x="130" y="125" text-anchor="middle" font-family="Arial" font-size="28" fill="#b22222" font-weight="bold" opacity="0.8">APPROVED</text>
        <text x="130" y="160" text-anchor="middle" font-family="Arial" font-size="20" fill="#b22222" opacity="0.8">IMMIGRATION</text>
      </svg>`);
      const stamp = await sharp(stampSvg).png().toBuffer();
      return sharp(buffer)
        .composite([{ input: stamp, top: 280, left: 320, blend: 'over' }])
        .png()
        .toBuffer();
    }

    default:
      return buffer;
  }
}

function buildGroundTruth(countryKey, variant, profile, mrz) {
  const missingMrz = variant.id === '19_missing_mrz';
  const expired = variant.id === '20_expired';
  const expectedDetected = true;
  const gt = {
    visaNumber: profile.controlNumber || profile.visaLabelNumber || null,
    visaType: profile.visaType || null,
    visaCategory: profile.visaCategory || null,
    issuingCountry: profile.issuingCountry,
    surname: profile.surname.replace(/Í/g, 'I').replace(/É/g, 'E').replace(/í/g, 'i').replace(/é/g, 'e').toUpperCase(),
    givenNames: profile.givenNames.replace(/Í/g, 'I').replace(/É/g, 'E').replace(/í/g, 'i').replace(/é/g, 'e').toUpperCase(),
    nationality: profile.nationality,
    passportNumber: profile.passportNumber,
    sex: profile.sex,
    dateOfBirth: profile.dateOfBirth,
    issueDate: profile.issueDate,
    expiryDate: profile.expiryDate,
    entries: profile.entries,
    controlNumber: profile.controlNumber || null,
    visaLabelNumber: profile.visaLabelNumber || null,
    placeOfIssue: profile.placeOfIssue,
    purposeOfTravel: profile.purposeOfTravel || null,
    sponsor: profile.sponsor || null,
    employer: profile.employer || null,
    mrzValid: missingMrz ? false : mrz.mrzValid,
    expectedDetectedAsVisa: expectedDetected,
    isExpired: expired,
  };
  if (missingMrz) {
    gt.machineReadableZone = null;
  } else if (mrz.line1 && mrz.line2) {
    gt.machineReadableZone = `${mrz.line1}\n${mrz.line2}`;
  }
  return gt;
}

export async function generateVisaImageFixtures({ countries = Object.keys(COUNTRY_PROFILES) } = {}) {
  const manifest = [];
  let count = 0;

  for (const countryKey of countries) {
    const profile = COUNTRY_PROFILES[countryKey];
    const imgDir = path.join(IMAGE_ROOT, profile.folder);
    const gtDir = path.join(GT_ROOT, profile.folder);
    await fs.mkdir(imgDir, { recursive: true });
    await fs.mkdir(gtDir, { recursive: true });

    for (const variant of VARIANTS) {
      const id = `${profile.folder}_${variant.id}`;
      const imageName = `${variant.id}.png`;
      const imagePath = path.join(imgDir, imageName);
      const relImagePath = `tests/fixtures/visa-images/${profile.folder}/${imageName}`;

      const { buffer: base, profile: effectiveProfile, mrz } = await renderBasePng(profile, variant);
      const final = await applyDegradation(base, variant, countryKey);
      await sharp(final).png().toFile(imagePath);

      const groundTruth = buildGroundTruth(countryKey, variant, effectiveProfile, mrz);
      const expected = { ...groundTruth };

      const record = {
        id,
        country: countryKey,
        folder: profile.folder,
        variant: variant.id,
        variantDescription: variant.description,
        degradation: variant.degradation,
        imagePath: relImagePath,
        groundTruth,
        expected,
      };

      await fs.writeFile(path.join(gtDir, `${variant.id}.json`), JSON.stringify(record, null, 2));
      manifest.push(record);
      count++;
      if (count % 20 === 0) console.log(`Generated ${count} images...`);
    }
  }

  await fs.writeFile(path.join(GT_ROOT, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), total: count, fixtures: manifest }, null, 2));
  console.log(`Done: ${count} visa image fixtures.`);
  return { count, manifest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateVisaImageFixtures().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
