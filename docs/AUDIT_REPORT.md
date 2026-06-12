# Visa Extraction — Production Audit Report

**Scope:** `src/modules/extraction/visa/*` + legacy `visa-extract.js` + `ocr.js`  
**Date:** 2026-06-06  
**Status:** All unit tests pass (98.7% synthetic accuracy); audit identifies production gaps not covered by tests.

---

## Executive summary

The visa pipeline is a sound **MRZ-first + OCR-fallback** architecture with backward-compatible API output. It is production-ready for **clean, labelled, MRV-A visa scans** where MRZ checksums pass. Gaps concentrate in:

1. **Merge policy** — invalid MRZ fields override better OCR values.
2. **Confidence metrics** — can be inflated without reflecting field correctness or cross-validation.
3. **False-positive detection** — `detectedAsVisa` triggers on any `VISA` substring; legacy OCR assigns 10-digit numbers as control numbers.
4. **Regional field coverage** — schema is broad; extraction for Schengen `hostReference`, UK split names, Singapore, Japan, Hindi labels, and MRV-B is weak or absent.
5. **Image/OCR robustness** — preprocessing helps scale/contrast; no deskew, glare, stamp, or OCR-substitution recovery in the TypeScript OCR layer.
6. **Test blind spots** — no image regression, no non-visa false-positive suite, lenient accuracy gate (60% / 3-char prefix).

---

## Architecture review

```
Image/PDF → OCRService (mrzStrip + fullPage)
         → extractVisaData (legacy MRZ + legacy OCR)
         → extractVisaFromOcr (enhanced labels + heuristics)
         → mapMrzToVisaData / mapOcrToVisaData
         → mergeVisaData (MRZ always wins)
         → computeVisaConfidence / computeMetrics
         → validateVisaData (warnings discarded from API)
```

| Component | Strength | Weakness |
|-----------|----------|----------|
| `VisaExtractor.ts` | Clean orchestration, dual OCR pass, legacy compat | No gating on `detectedAsVisa`; validation warnings dropped |
| `visa-extract.js` | ICAO lib + manual MRV-A, check digits, OCR date token normalization | MRV-B not parsed; `\b(\d{10})\b` control-number heuristic |
| `VisaOcrExtractor.ts` | Multilingual labels, `(?!\w)` guard, country heuristics | No MRZ char correction; short labels (`STAY`, `HOST`) |
| `VisaFieldMapper.ts` | Stable merge + legacy field mapping | MRZ precedence even when `mrzValid=false`; `documentNumber` conflated with passport |
| `VisaValidators.ts` | Basic date/sex/nationality checks | Warnings only; no cross-field consistency |
| `VisaConfidence.ts` | Weighted field presence model | `mrzFieldCount`/`ocrFieldCount` unused; `scoreFieldSource` dead code |
| `ocr.js` | Auto-rotate, upscale, MRZ crop, OCR-B model | Fixed 28% bottom crop fails on cropped scans; no glare/stamp handling |

---

## Test coverage vs production reality

| Area | Tested | Not tested |
|------|--------|------------|
| Label OCR | 1 happy-path + synthetic clean text | Skewed/blurred images, stamps, low DPI |
| MRZ | 5 ICAO-valid MRV-A fixtures | MRV-B 36-char, partial line 1 only, damaged lines |
| Accuracy | 66 text fixtures, 5 fields, 60% threshold | Regional fields, visaNumber, dates, entries |
| Confidence | Populated-field smoke test | Inflation scenarios, MRZ/OCR disagreement |
| False positives | **None** | Passport, ID, permit, forms with "VISA" word |
| Integration | **None** | Full `VisaExtractor.extract(buffer)` E2E |
| Validators | 2 cases | Invalid dates accepted as warnings only |
| Security | **None** | rawText PII, large payload |

The reported **98.7% accuracy** measures prefix match on 5 identity fields over **ideal synthetic text**, not production scan quality.

---

## False-positive probe results (read-only, 2026-06-06)

| Document type | `detectedAsVisa` | Fields extracted | Risk |
|---------------|------------------|------------------|------|
| Passport TD3 (`P<`) | **false** ✓ | surname, givenNames, nationality via shared labels | Medium — wrong doc type on `/api/extraction/visa` still returns identity fields |
| National ID | false ✓ | nationality, dateOfBirth | Low |
| Work permit | false ✓ | nationality, employer, purposeOfTravel | Medium — plausible visa-like payload |
| Form with "valid **VISA** for transit" | **true** ✗ | none | High — `detectedAsVisa` false positive |
| Travel insurance | false ✓ | durationOfStay, purposeOfTravel | Medium — junk regional fields |
| Invoice with 10-digit number | false ✓ | legacy `controlNumber=1234567890` | **Critical** — legacy OCR heuristic |
| Employment letter | false ✓ | sponsor, visaCategory `A` | Medium — `CATEGORY` regex overlap |

---

## MRZ handling assessment

| Scenario | Behavior | Gap |
|----------|----------|-----|
| Valid MRV-A (44×2) | `mrz` lib + manual check digits | Covered by 5 fixtures |
| Invalid checksums | `mrzValid=false`, reason string | Fields still merged from invalid parse |
| Partial MRZ (line 1 only) | Reason: "incomplete second line" | No recovery from visual OCR for line 2 |
| Damaged lines | Manual parser may still extract names | No line-repair (insert `<`, length pad) beyond legacy normalize |
| OCR substitutions O/0, I/1, etc. | `normalizeDateToken` in legacy line 2 only | Not applied to passport number or TS OCR layer |
| MRV-B (36×2) | **Not implemented** in `parseVisaMrzLine2` | `MRZ_LINE2_36` in `VisaRegex.ts` is unused |

---

## Confidence scoring audit

`computeVisaConfidence` inputs `mrzFieldCount` and `ocrFieldCount` but **does not use them**. Score = weighted fraction of populated core fields + 0.12 if `mrzValid`.

**Inflation paths:**

1. Any 3-letter token accepted as `nationality` in OCR (`val.length === 3`) inflates field count.
2. `ocrConfidence = min(0.95, 0.5 + ocrFieldCount * 0.05)` — 9+ OCR fields → 0.95 regardless of correctness.
3. `mrzConfidence` is binary: 0.95 if valid else 0.35 — no partial credit for line-1-only.
4. `scoreFieldSource()` exists but is never called — no MRZ/OCR agreement penalty.
5. Junk heuristics (e.g. `purposeOfTravel: TOURISM` from insurance text) increase `fieldExtractionRate`.

---

## Validator gaps

| Check | Present | Missing |
|-------|---------|---------|
| Date format DD/MM/YYYY | Warning only | Invalid calendar dates; US MM/DD ambiguity |
| Nationality ISO alpha-3 | Warning if not `[A-Z]{3}` | Not validated against `ISO_ALPHA3` set |
| Passport number | None | Length, charset, check digit vs MRZ |
| Visa/control number | None | US 8-digit vs 10-digit patterns |
| Cross-field | None | `issuingCountry` vs `V<XXX>`; nationality ≠ issuing country check |
| Expiry | `isExpired()` exists | Not exposed in API response or warnings |

---

## Regex / label audit

| Issue | Location | Severity |
|-------|----------|----------|
| `CATEGORY` label vs Schengen `\bCATEGORY\s*([A-Z])\b` | `VisaRegex` + `VisaOcrExtractor` | Medium — employment letters get `visaCategory: A` |
| `STAY` as duration label | `VISA_LABEL_RULES` | Medium — matches unrelated "STAY" text |
| `HOST` for sponsor | Overlaps potential `hostReference` semantics | Medium |
| `PURPOSE` keyword scan | `applyCountryHeuristics` | Medium — any document mentioning WORK/TOURISM |
| Legacy `\b(\d{10})\b` control number | `visa-extract.js:257` | **Critical** |
| Catastrophic backtracking | None observed — bounded `{1,64}` quantifiers | Low risk |
| `DATE_PATTERNS`, `MRZ_LINE*` in `VisaRegex.ts` | Exported, unused | Dead code / drift risk |

---

## Prioritized fixes

### Critical
1. **Remove or scope legacy `\b(\d{10})\b` control-number fallback** — false control/visa numbers on arbitrary documents (`visa-extract.js`).
2. **Merge policy when `mrzValid=false`** — prefer OCR over MRZ for line-2 fields, or flag low-confidence MRZ fields.

### High
3. **Tighten `detectedAsVisa`** — require `V<` MRZ prefix or ≥N visa-specific fields; do not rely on `/VISA/i` alone.
4. **Wire `validateVisaData` warnings into API** — `validation.warnings` / `validation.errors` on response.
5. **Use `scoreFieldSource` or MRZ/OCR agreement** in confidence; cap `ocrConfidence` when labels conflict.
6. **MRV-B parser path** — 36-char line 2 layout for stickers/e-visas.

### Medium
7. **Cross-field validators** — passport number check digit vs MRZ; `issuingCountry` consistency.
8. **Extract `hostReference`, `placeOfBirth`, `issuingAuthority`** — labels exist in schema, no OCR rules.
9. **Singapore + Japan + Hindi label variants**; UK given-name split handling.
10. **False-positive test suite** — passport, ID, permit, insurance, invoice fixtures.
11. **Image regression harness** — even 10 real scans beats 50 text fixtures for skew/blur.

### Low
12. **Remove or use dead exports** (`DATE_PATTERNS`, `MRZ_LINE*`, `scoreFieldSource` if not wired).
13. **Expose `isExpired()` on `visa` or `metrics`**.
14. **Document `machineReadableZone` stores full page text** — not isolated MRZ blob (mapper passes `rawText`).

---

## What is already solid (no change recommended)

- ICAO MRV-A parsing with `mrz` npm + manual fallback
- Backward-compatible `mrzData.fields` via `toLegacyMrzFields()`
- Label regex `(?!\w)` + longest-label-first for given names
- OCR-B trained model + MRZ whitelist in `ocr.js`
- Dual OCR pipeline (legacy + enhanced) with field merge
- 50+ synthetic fixtures and ICAO MRZ generator

---

## Related documents

- [COVERAGE_MATRIX.md](./COVERAGE_MATRIX.md) — field × country coverage
- [MISSING_EDGE_CASES.md](./MISSING_EDGE_CASES.md) — untested scenarios
- [SECURITY_REVIEW.md](./SECURITY_REVIEW.md) — PII and abuse considerations
