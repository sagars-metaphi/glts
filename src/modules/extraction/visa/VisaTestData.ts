/**
 * Synthetic visa test fixtures (text + MRZ).
 * 50+ samples across countries and visa types for unit/regression testing.
 */

export interface VisaSyntheticSample {
  id: string;
  country: string;
  visaType: string;
  category: string;
  mrzLine1: string;
  mrzLine2: string;
  ocrText: string;
  groundTruth: {
    surname: string;
    givenNames: string;
    nationality: string;
    passportNumber: string;
    issuingCountry: string;
    visaType?: string;
    entries?: string;
    purposeOfTravel?: string;
  };
  edgeCase?: string;
}

const COUNTRIES = [
  { code: 'USA', name: 'United States', types: ['B1/B2', 'F1', 'H1B', 'L1'] },
  { code: 'GBR', name: 'United Kingdom', types: ['VISITOR', 'WORK', 'STUDENT'] },
  { code: 'DEU', name: 'Germany', types: ['SCHENGEN-C', 'NATIONAL-D'] },
  { code: 'CAN', name: 'Canada', types: ['VISITOR', 'eTA', 'WORK'] },
  { code: 'AUS', name: 'Australia', types: ['600', '482', '500'] },
  { code: 'ARE', name: 'UAE', types: ['TOURIST', 'WORK', 'TRANSIT'] },
  { code: 'IND', name: 'India', types: ['TOURIST', 'BUSINESS', 'EMPLOYMENT'] },
  { code: 'CHN', name: 'China', types: ['L', 'M', 'Z'] },
  { code: 'FRA', name: 'France', types: ['SCHENGEN-C', 'LONG-SEJOUR'] },
  { code: 'JPN', name: 'Japan', types: ['TEMPORARY', 'WORK'] },
];

const SURNAMES = ['SMITH', 'PATEL', 'GARCIA', 'MÜLLER', 'WANG', 'IVANOV', 'HASSAN', 'KIM', 'SILVA', 'NGUYEN'];
const GIVEN = ['JOHN', 'MARIA', 'RAHUL', 'ANNA', 'WEI', 'DMITRI', 'FATIMA', 'MIN-JUN', 'CARLOS', 'LINH'];

function padMrz(line: string, len = 44): string {
  return line.toUpperCase().replace(/\s/g, '').padEnd(len, '<').slice(0, len);
}

function buildSample(
  idx: number,
  country: (typeof COUNTRIES)[0],
  visaType: string,
  surname: string,
  given: string,
  nat: string,
  edgeCase?: string,
): VisaSyntheticSample {
  const passport = `${String.fromCharCode(65 + (idx % 26))}${10000000 + idx}`.slice(0, 9);
  const line1 = padMrz(`V<${country.code}${surname}<<${given}`);
  const line2 = padMrz(`${passport}4${nat}900515${idx % 2 === 0 ? 'M' : 'F'}280630${visaType.replace(/[^A-Z0-9]/g, '').slice(0, 8)}`);

  const ocrText = [
    'VISA',
    `SURNAME: ${surname}`,
    `GIVEN NAMES: ${given}`,
    `NATIONALITY: ${nat}`,
    `PASSPORT NO: ${passport}`,
    `DATE OF BIRTH: 15/05/1990`,
    `ISSUE DATE: 01/01/2024`,
    `EXPIRY DATE: 30/06/2028`,
    `ENTRIES: ${idx % 3 === 0 ? 'M' : 'S'}`,
    `VISA TYPE: ${visaType}`,
    `PLACE OF ISSUE: ${country.name.toUpperCase()}`,
    `PURPOSE: ${visaType.includes('WORK') || visaType.includes('H1') ? 'WORK' : 'TOURISM'}`,
    line1,
    line2,
  ].join('\n');

  return {
    id: `visa-synth-${country.code.toLowerCase()}-${idx}`,
    country: country.code,
    visaType,
    category: visaType,
    mrzLine1: line1,
    mrzLine2: line2,
    ocrText,
    groundTruth: {
      surname,
      givenNames: given,
      nationality: nat,
      passportNumber: passport,
      issuingCountry: country.code,
      visaType,
      entries: idx % 3 === 0 ? 'M' : 'S',
      purposeOfTravel: visaType.includes('WORK') ? 'WORK' : 'TOURISM',
    },
    edgeCase,
  };
}

function buildEdgeCases(): VisaSyntheticSample[] {
  const longName = 'A'.repeat(40);
  return [
    {
      ...buildSample(900, COUNTRIES[0], 'B1/B2', 'DOE', 'JANE', 'IND', 'long-name'),
      id: 'edge-long-given',
      groundTruth: { ...buildSample(900, COUNTRIES[0], 'B1/B2', 'DOE', 'JANE', 'IND').groundTruth, givenNames: longName },
      ocrText: `SURNAME: DOE\nGIVEN NAMES: ${longName}\nNATIONALITY: IND\nV<USADOE<<${longName}`,
    },
    {
      id: 'edge-no-mrz',
      country: 'USA',
      visaType: 'B1/B2',
      category: 'B1/B2',
      mrzLine1: '',
      mrzLine2: '',
      ocrText: 'VISA\nSURNAME: BROWN\nGIVEN NAMES: JAMES\nNATIONALITY: USA\nPASSPORT NO: X12345678',
      groundTruth: {
        surname: 'BROWN',
        givenNames: 'JAMES',
        nationality: 'USA',
        passportNumber: 'X12345678',
        issuingCountry: 'USA',
      },
      edgeCase: 'no-mrz',
    },
    {
      id: 'edge-invalid-mrz',
      country: 'USA',
      visaType: 'B1/B2',
      category: 'B1/B2',
      mrzLine1: 'V<USASMITH<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<',
      mrzLine2: 'INVALIDLINE2WITHBADCHECKDIGITSXXXXXXXXXXXXXX',
      ocrText: 'VISA\nSURNAME: SMITH\nGIVEN NAMES: JOHN\nV<USASMITH<<JOHN\nINVALIDLINE2WITHBADCHECKDIGITSXXXXXXXXXXXXXX',
      groundTruth: {
        surname: 'SMITH',
        givenNames: 'JOHN',
        nationality: 'USA',
        passportNumber: '',
        issuingCountry: 'USA',
      },
      edgeCase: 'invalid-mrz',
    },
    {
      id: 'edge-special-chars',
      country: 'FRA',
      visaType: 'SCHENGEN-C',
      category: 'C',
      mrzLine1: padMrz('V<FRAGARCIA<<JOSE'),
      mrzLine2: padMrz('YA1234567ESP850101M300101'),
      ocrText: 'SURNAME: GARCÍA\nGIVEN NAMES: JOSÉ\nNATIONALITY: ESP',
      groundTruth: {
        surname: 'GARCIA',
        givenNames: 'JOSE',
        nationality: 'ESP',
        passportNumber: 'YA1234567',
        issuingCountry: 'FRA',
      },
      edgeCase: 'special-chars',
    },
    {
      id: 'edge-expired',
      country: 'GBR',
      visaType: 'VISITOR',
      category: 'VISITOR',
      mrzLine1: padMrz('V<GBRLEE<<ANN'),
      mrzLine2: padMrz('123456789GBR800101F200101'),
      ocrText: 'SURNAME: LEE\nEXPIRY DATE: 01/01/2020',
      groundTruth: {
        surname: 'LEE',
        givenNames: 'ANN',
        nationality: 'GBR',
        passportNumber: '123456789',
        issuingCountry: 'GBR',
      },
      edgeCase: 'expired',
    },
  ];
}

export function generateVisaTestSamples(): VisaSyntheticSample[] {
  const samples: VisaSyntheticSample[] = [];
  let idx = 0;

  for (const country of COUNTRIES) {
    for (const visaType of country.types) {
      for (let v = 0; v < 2; v++) {
        const surname = SURNAMES[(idx + v) % SURNAMES.length];
        const given = GIVEN[(idx + v) % GIVEN.length];
        const nat = ['IND', 'USA', 'GBR', 'DEU', 'PHL', 'CHN'][idx % 6];
        samples.push(buildSample(idx, country, visaType, surname, given, nat));
        idx++;
      }
    }
  }

  samples.push(...buildEdgeCases());
  return samples;
}

export const VISA_TEST_SAMPLES = generateVisaTestSamples();
