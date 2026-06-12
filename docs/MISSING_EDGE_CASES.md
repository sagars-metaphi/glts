# Missing Edge Cases — Visa Extraction

Scenarios **not covered** by `tests/visa-extraction.test.ts`, `tests/visa-mrz.test.js`, or `VisaTestData.ts`. Each item includes expected behavior and current risk.

---

## 1. MRZ edge cases

| ID | Scenario | Expected | Current behavior | Tested |
|----|----------|----------|------------------|--------|
| MRZ-01 | MRV-B 36×2 lines | Parse line 2 at 36 chars | Only 44-char MRV-A in `parseVisaMrzLine2` | No |
| MRZ-02 | Line 1 only (damaged line 2) | OCR fallback, `mrzValid=false` | Reason string set; line-1 names may still merge | Partial (`edge-invalid-mrz`) |
| MRZ-03 | Line 2 only (cropped top) | OCR labels only | May miss issuing country from line 1 | No |
| MRZ-04 | Checksum fail but OCR correct | Prefer OCR for conflicting fields | **MRZ wins merge** even when invalid | No |
| MRZ-05 | O→0 in passport number | Repair + revalidate checksum | `normalizeDateToken` dates only | No |
| MRZ-06 | I→1, B→8 in document number | Repair before check digit | Not applied to alphanumeric field | No |
| MRZ-07 | Missing `<<` separator (single `<`) | Parse single surname | `parseVisaMrzLine1` has `<` fallback | No |
| MRZ-08 | Country bleed `V<USASMITH` → USA | Correct issuing country | Legacy handles some bleed | No |
| MRZ-09 | Two MRZ pairs in image | Pick best checksum score | `tryParseVisaMrzLib` scores candidates | No test |
| MRZ-10 | MRZ glued to OCR line noise | Normalize before parse | `normalizeMrzLine` strips non-MRZ chars | No |

---

## 2. OCR / image edge cases

| ID | Scenario | Expected | Current behavior | Tested |
|----|----------|----------|------------------|--------|
| IMG-01 | ±15° skew | Deskew or robust OCR | `sharp().rotate()` EXIF only, no deskew | No |
| IMG-02 | Motion blur | Lower confidence, partial fields | Sharpen may help; no confidence penalty | No |
| IMG-03 | Glare on foil | MRZ strip threshold recovery | Fixed threshold 145; may fail | No |
| IMG-04 | <150 DPI scan | Upscale + extract | `computeOcrScale` upscales | No image test |
| IMG-05 | MRZ cropped off bottom | Full-page OCR fallback | 28% crop may miss MRZ entirely | No |
| IMG-06 | Stamp over name | Partial surname | No inpainting / region OCR | No |
| IMG-07 | Stamp over MRZ | Checksum fail + OCR | Invalid MRZ path | No |
| IMG-08 | Photo page only (no MRZ) | OCR labels | `edge-no-mrz` text only | Partial |
| IMG-09 | PDF multi-page | Page selection | `ocr.js` PDF path exists; visa not page-aware | No |
| IMG-10 | Binary / fax artifact | Binarized MRZ pass | `preprocessMrzStripBinarized` exists | No |

---

## 3. Label / multilingual edge cases

| ID | Scenario | Expected | Current behavior | Tested |
|----|----------|----------|------------------|--------|
| LBL-01 | Label without colon `SURNAME DOE` | Extract or skip | Requires colon-ish separator | No |
| LBL-02 | RTL Arabic layout | Correct field order | No RTL handling | No |
| LBL-03 | Hindi labels | Extract names | No Hindi labels | No |
| LBL-04 | Japanese 氏名 | Extract | No Japanese labels | No |
| LBL-05 | `NOM / PRENOM` combined line | Split | Separate rules | No |
| LBL-06 | UK split given names line 1/2 | Merge given names | Single `givenNames` field | No |
| LBL-07 | `SURNAME/GIVEN NAME` slash format | Both names | Legacy has combined regex; TS layer no | Partial (legacy) |
| LBL-08 | Label value on next line | Extract | `[^\n]` same-line only | No |
| LBL-09 | `GIVEN NAMES` partial match | Full value | Fixed with `(?!\w)` | **Yes** |
| LBL-10 | `CATEGORY: WORK` vs Schengen `CATEGORY C` | Correct field | Ambiguous with `visaType` label | No |

---

## 4. Date edge cases

| ID | Scenario | Expected | Current behavior | Tested |
|----|----------|----------|------------------|--------|
| DAT-01 | US MM/DD/YYYY visual | Correct DOB | Parsed as DD/MM (EU assumption) | No |
| DAT-02 | `01 JAN 90` two-digit year | 1990 vs 2090 | 50-year pivot | No |
| DAT-03 | `29/02/2023` invalid | Reject or warn | Accepted if regex passes | No |
| DAT-04 | `YYYY-MM-DD` ISO | Normalize to DD/MM/YYYY | `DATE_PATTERNS` unused | No |
| DAT-05 | Hijri / Buddhist dates | Null or warn | Not supported | No |
| DAT-06 | Schengen valid-from / valid-until | Two dates mapped | Single issue/expiry only | No |
| DAT-07 | OCR `O1/O1/2O2O` | Repair digits | No OCR digit repair in TS dates | No |

---

## 5. Cross-field consistency

| ID | Scenario | Expected | Current behavior | Tested |
|----|----------|----------|------------------|--------|
| XFL-01 | MRZ nationality ≠ label nationality | Lower confidence + warning | MRZ wins silently | No |
| XFL-02 | MRZ sex ≠ label sex | Warning | MRZ wins silently | No |
| XFL-03 | `issuingCountry` vs `V<XXX>` mismatch | Warning | Both may populate inconsistently | No |
| XFL-04 | `visaNumber` = passport number | Reject duplicate semantics | `documentNumber` mapped from passport | No |
| XFL-05 | Expired visa | `isExpired` in response | Function exists; not in API | No |

---

## 6. False-positive / wrong-document edge cases

| ID | Scenario | Expected | Current behavior | Tested |
|----|----------|----------|------------------|--------|
| FP-01 | Passport uploaded to visa endpoint | `detectedAsVisa=false`, minimal fields | **Labels still extract** passport-like fields | No |
| FP-02 | Text contains word "VISA" | `detectedAsVisa=false` | **`detectedAsVisa=true`** | **Probed** |
| FP-03 | Invoice 10-digit number | No control number | **Legacy sets controlNumber** | **Probed** |
| FP-04 | Travel insurance | No visa fields | duration + purpose extracted | **Probed** |
| FP-05 | Employment letter CATEGORY A | No visaCategory | **visaCategory=A** | **Probed** |
| FP-06 | Residence permit with MRZ `I<` | Not visa | Visa path not taken in classification | No |
| FP-07 | Empty / blank image | Graceful empty result | Depends on OCR errors | No |
| FP-08 | Lorem ipsum random text | Empty visa object | May extract keyword PURPOSE | No |

---

## 7. Confidence edge cases

| ID | Scenario | Expected | Current behavior | Tested |
|----|----------|----------|------------------|--------|
| CONF-01 | 9 junk OCR fields | Low confidence | `ocrConfidence` → 0.95 | No |
| CONF-02 | Valid MRZ + empty OCR | High MRZ confidence | Works (~0.95 mrzConfidence) | Partial |
| CONF-03 | Invalid MRZ + good OCR | Medium confidence | MRZ fields may pollute + mrzBoost=0 | No |
| CONF-04 | All fields from single noisy line | Low confidence | Field count inflates score | No |
| CONF-05 | `mrzValid=true` with 2 fields | Not >0.9 overall | mrzBoost still applies | No |

---

## 8. API / backward-compatibility edge cases

| ID | Scenario | Expected | Current behavior | Tested |
|----|----------|----------|------------------|--------|
| API-01 | Client reads `mrzData.fields` only | Same shape as before | `toLegacyMrzFields` maps | Implicit |
| API-02 | Client reads new `visa` object | All fields | Populated per merge | No |
| API-03 | `validateVisaData` warnings | Visible to client | **Discarded** in `VisaExtractor` | No |
| API-04 | `machineReadableZone` semantics | MRZ lines only | **Entire rawText stored** | No |
| API-05 | Large PDF (50MB) | Reject or timeout | No visa-specific limit | No |

---

## 9. Synthetic dataset gaps (claimed but not implemented)

`VisaTestData.ts` comments reference fonts, rotation, blur, OCR mistakes — **only plain text** is generated. No programmatic noise injection in fixtures.

| Claimed in docs | Actual |
|-----------------|--------|
| Arial / Times / OCR-A fonts | Text only |
| ±15° rotation | Not simulated |
| 5–10% char errors | Not in generator |
| Blurred / damaged edges | Not in generator |

---

## Suggested test additions (priority order)

1. **FP-02, FP-03, FP-04, FP-05** — false-positive regression (text fixtures, no images).
2. **MRZ-04, MRZ-05, MRZ-01** — merge policy + MRV-B + char repair.
3. **CONF-01, CONF-03** — confidence ceiling tests.
4. **XFL-01..05** — validator cross-field tests.
5. **IMG-01..10** — golden image directory (10–20 files).

Each new test should assert **measurable** outcomes (field value, confidence range, `detectedAsVisa`, warning count).
