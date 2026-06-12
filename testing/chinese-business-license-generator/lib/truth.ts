import { generateCreditCode } from './creditCode.js';
import {
  randomAddress,
  randomBusinessScope,
  randomBusinessTerm,
  randomCompanyName,
  randomCompanyType,
  randomEstablishmentDate,
  randomLegalRepresentative,
  randomRegisteredCapital,
  randomRegistrationAuthority,
} from './pools.js';
import { formatIdCardText, formatLicenseText, type GroundTruthFields } from './licenseText.js';

export interface TruthDocument {
  documentId: string;
  style: string;
  styleName: string;
  corruptionLevel: string;
  seed: number;
  fields: GroundTruthFields;
  licenseText: string;
  idCardText: string | null;
  generatedAt: string;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateTruthDocument(
  documentId: string,
  style: string,
  styleName: string,
  corruptionLevel: string,
  seed: number,
  options: { mixedLanguage?: boolean; includeIdCard?: boolean } = {},
): TruthDocument {
  const rng = mulberry32(seed);
  const pools = { rng };
  const est = randomEstablishmentDate(pools);

  const fields: GroundTruthFields = {
    companyName: randomCompanyName(pools),
    creditCode: generateCreditCode(rng),
    legalRepresentative: randomLegalRepresentative(pools),
    companyType: randomCompanyType(pools),
    registeredCapital: randomRegisteredCapital(pools),
    establishmentDate: est.iso,
    businessTerm: randomBusinessTerm(est, pools),
    address: randomAddress(pools),
    businessScope: randomBusinessScope(pools),
    registrationAuthority: randomRegistrationAuthority(pools),
  };

  const licenseText = formatLicenseText(fields, { mixedLanguage: options.mixedLanguage });
  const idCardText = options.includeIdCard ? formatIdCardText(fields.legalRepresentative) : null;

  return {
    documentId,
    style,
    styleName,
    corruptionLevel,
    seed,
    fields,
    licenseText,
    idCardText,
    generatedAt: new Date().toISOString(),
  };
}
