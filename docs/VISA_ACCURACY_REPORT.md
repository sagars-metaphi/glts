# Visa Extraction Accuracy Report

Generated from automated test suite (`npm run test:visa-extract`).

## Summary

| Metric | Value | Target |
|--------|-------|--------|
| Total samples | 66 | 50+ |
| ICAO MRZ fixtures | 5 | — |
| Synthetic text fixtures | 61 | 50+ |
| Average field accuracy | **98.7%** | >95% |
| Per-sample pass rate | **100%** | >90% |
| MRZ-valid sample rate | 7.6% | — |

> Field accuracy compares merged `VisaData` against ground truth for: surname, givenNames, nationality, passportNumber, issuingCountry (prefix match, case-insensitive).

## Dataset coverage

### Countries (10)

USA, GBR, DEU, CAN, AUS, ARE, IND, CHN, FRA, JPN

### Visa types (3+ per region)

- **US:** B1/B2, F1, H1B, L1
- **UK:** VISITOR, WORK, STUDENT
- **Schengen (DEU/FRA):** SCHENGEN-C, NATIONAL-D, LONG-SEJOUR
- **Canada:** VISITOR, eTA, WORK
- **Australia:** 600, 482, 500
- **UAE/India:** TOURIST, BUSINESS, WORK, EMPLOYMENT, TRANSIT
- **China/Japan:** L, M, Z, TEMPORARY, WORK

### Edge cases in synthetic set

- Long names (>100 chars)
- Special characters (é, ñ, 阿拉伯)
- Multiple surnames
- No MRZ (OCR-only)
- Invalid MRZ (checksum failure)
- Expired visas
- OCR noise (5–10% character substitution)
- Blurred/rotated text simulation (whitespace corruption)

## Test results

```
npm run test:visa-extract   → 7/7 pass
npm run test:visa           → 5/5 ICAO MRZ fixtures pass
npm run test:all            → all suites pass
```

### Assertions

| Test | Status |
|------|--------|
| 50+ synthetic samples generated | Pass |
| OCR label extraction (surname, givenNames, nationality) | Pass |
| ICAO MRV-A MRZ validation | Pass |
| Confidence scoring (0–1) | Pass |
| VisaData validation + expiry check | Pass |
| Synthetic per-sample accuracy ≥60% | Pass |
| Aggregate accuracy report | Pass |

## Metrics API

Each extraction response includes:

```json
{
  "metrics": {
    "fieldExtractionRate": 0.85,
    "ocrConfidence": 0.78,
    "mrzConfidence": 0.95,
    "populatedFields": ["surname", "givenNames", "..."],
    "missingFields": ["employer", "..."]
  }
}
```

- **fieldExtractionRate** — ratio of non-empty `VisaData` fields
- **ocrConfidence** — derived from OCR field count + label match quality
- **mrzConfidence** — 0.95 when MRZ checksums valid, lower otherwise
- **missingFields** — fields empty after MRZ + OCR merge

## Limitations

1. **Synthetic dataset is text-based** — fonts, rotation, and image noise are simulated via string corruption, not rendered JPEG/PNG fixtures. Image-based regression would require re-adding `canvas` or external golden images.
2. **MRZ-valid rate in synthetic set is low** — most samples use programmatic MRZ without ICAO check-digit validation; ICAO accuracy is covered by the 5 dedicated fixtures in `tests/fixtures/visa-mrz-generator.js`.
3. **Field accuracy metric** uses prefix matching on 5 core identity fields; regional fields (sponsor, employer, visaCategory) are extracted but not scored in the automated pass/fail gate.

## Reproduce

```bash
npm run test:visa-extract
```

The accuracy summary JSON is printed at the end of the test run.
