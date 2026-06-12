# Visa Field Coverage Matrix

Legend: **Y** = extracted in typical case · **P** = partial/heuristic · **N** = not extracted · **M** = MRZ only · **O** = OCR only

Sources: `VisaOcrExtractor.ts`, `VisaFieldMapper.ts`, `visa-extract.js`, `VisaTestData.ts`

---

## Core fields (all visa types)

| Field | US | Schengen | UK | Canada | Australia | UAE | India | Japan | China | Singapore | MRZ | OCR labels | Tests |
|-------|----|---------|----|--------|-----------|-----|-------|-------|-------|-----------|-----|------------|-------|
| visaNumber | P | N | N | N | N | N | N | N | N | N | M | P (control) | N |
| surname | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | M | Y | Y |
| givenNames | Y | Y | P | Y | Y | Y | Y | Y | Y | Y | M | Y | Y |
| nationality | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | M | Y | Y |
| passportNumber | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | M | Y | Y |
| sex | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | M | P | N |
| dateOfBirth | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | M | Y | N |
| issueDate | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | P | Y | N |
| expiryDate | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | M | Y | P (expired edge) |
| entries | Y | Y | Y | Y | P | Y | Y | Y | Y | Y | P | Y | N |
| issuingCountry | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | M | P (`V<`) | Y |

---

## MRZ-specific fields

| Field | US | Schengen | UK | Canada | AU | UAE | India | JP | CN | SG | Implementation | Tests |
|-------|----|---------|----|--------|----|-----|-------|----|----|----|----------------|-------|
| controlNumber | Y | N | N | N | N | N | N | N | N | N | Legacy US line-2 + OCR label | N |
| personalNumber | N | P | N | N | N | P | P | N | N | N | Label only | N |
| documentNumber | P | P | P | P | P | P | P | P | P | P | **Mapped to passportNumber** — semantic loss | N |
| mrzValid | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Legacy checksums | Y (5 ICAO) |
| machineReadableZone | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | **Full rawText**, not MRZ-only | N |

---

## Regional / visa-type fields

| Field | US | Schengen | UK | Canada | Australia | UAE | India | Japan | China | Singapore |
|-------|----|---------|----|--------|-----------|-----|-------|-------|-------|-----------|
| visaType | P (B1/B2) | P | P (VIGNETTE) | P (eTA) | N | N | N | N | N | N |
| visaCategory | P | P (regex) | N | N | N | N | N | N | N | N |
| visaLabelNumber | P (=control) | N | N | N | P (grant) | N | N | N | N | N |
| durationOfStay | N | P (regex) | N | N | N | N | N | N | N | N |
| hostReference | N | **N** | N | P | N | N | N | N | N | N |
| sponsor | N | N | N | N | N | P | P | N | N | N |
| employer | N | N | N | N | N | P | P | N | N | N |
| purposeOfTravel | P (keyword) | P | P | P | P | P | P | N | N | N |
| placeOfIssue | P | Y | Y | Y | Y | P | P | Y | Y | Y |
| remarks | N | N | N | N | N | N | N | N | N | N |
| issuingAuthority | N | N | N | N | N | N | N | N | N | N |
| placeOfBirth | N | N | N | N | N | N | N | N | N | N |

---

## Real-format gaps by country

### United States
- **Present:** B1/B2 class, control number, MRV-A MRZ, entries M/S.
- **Missing:** Annotation line parsing, petition number, visa foil vs IV distinction, `visaLabelNumber` separate from control number, MM/DD/YYYY visual dates.

### Schengen (DEU/FRA/…)
- **Present:** Category letter regex, duration regex, Schengen labels (French).
- **Missing:** `hostReference` / invitation number, number of entries encoding (MULT vs 1/2), valid-from/valid-until dual dates, sticker vs vignette.

### United Kingdom
- **Present:** VIGNETTE keyword, place of issue.
- **Missing:** Split given names (no `<<` in visual), BRP vs visa vignette, GWF reference, TLS/VFS centre as `issuingAuthority`.

### Canada
- **Present:** eTA keyword.
- **Missing:** eTA number pattern → `documentNumber`, UCI, LMIA reference as `hostReference`, bilingual FR labels beyond DELIVRANCE.

### Australia
- **Present:** Grant number regex.
- **Missing:** Visa subclass (600/482) → `visaCategory`, TRN, IMMI account reference, condition codes in `remarks`.

### UAE
- **Present:** Sponsor/host labels.
- **Missing:** UID, Emirates ID cross-ref, Arabic label coverage limited, employer vs sponsor disambiguation.

### India
- **Present:** Sponsor/employer labels, basic Arabic/Hindi not in rules.
- **Missing:** Hindi labels (नाम, राष्ट्रीयता), e-Visa application ID, FRRO reference, place of issue on e-visa.

### Japan
- **Present:** In test data only; MRV-A MRZ.
- **Missing:** Japanese labels (氏名, 国籍), status of residence vs temporary visitor, Certificate of Eligibility number.

### China
- **Present:** Chinese chars in label rules (姓, 名, 国籍).
- **Missing:** 签证种类, entry count Chinese, invitation letter (PU) number as `hostReference`.

### Singapore
- **Present:** **Not in test data or `ISO_ALPHA3` priority set.**
- **Missing:** FIN, IPA number, SG-arrival-card style fields, localized labels.

---

## OCR label language coverage

| Language | Labels in `VISA_LABEL_RULES` | Gap |
|----------|------------------------------|-----|
| English | Full core set | — |
| French | NOM, PRENOM, NATIONALITE, … | Missing DELIVRANCE accents variants |
| Spanish | APELLIDOS, NACIONALIDAD | Missing FECHA DE |
| Arabic | 4 labels | Incomplete UAE/SA product set |
| Chinese | 姓, 名, 国籍 | Missing 护照号码, 签发 |
| Hindi | **None** | Required for India e-visa |
| Japanese | **None** | Required for JP visas |

---

## Test fixture coverage vs matrix

| Dimension | Fixtures | Gap |
|-----------|----------|-----|
| Countries | 10 (no SGP) | Singapore absent |
| Visa types | 3+ per country in text | Not asserted in accuracy tests |
| Fields scored | 5 identity fields | 20+ schema fields unscored |
| MRZ valid | 5 ICAO + 1 invalid edge | MRV-B, partial, damaged |
| Images | 0 | All text-based |
| False positives | 0 | See `AUDIT_REPORT.md` probes |

---

## Recommended coverage targets (measurable)

| Metric | Current | Target |
|--------|---------|--------|
| Fields with extraction rule | ~18 / 24 | 22 / 24 |
| Countries with dedicated heuristics | 6 | 10 (+ SG, JP, IN e-visa) |
| False-positive test cases | 0 | ≥12 document types |
| Image golden files | 0 | ≥20 scans |
| Accuracy gate | 60% prefix on 5 fields | 90% exact on 10 fields for ICAO set |
