       # Visa Image Benchmark — Failure Analysis

       **Source:** `tests/fixtures/visa-groundtruth/benchmark-results.json` (200 samples, 2026-06-08)  
       **Pipeline:** `OCRService.mrzStrip` + `OCRService.fullPage` → `evaluateVisaFromImage`  
       **Current metrics:** Field 79.0% · OCR char 89.4% · MRZ 77.5% · FN 10.0% · FP 0.0%

       ---

       ## 1. Executive summary

       **466 of 2,220 scored field slots are missed** (79.0% hit rate). Loss is highly concentrated:

       | Rank | Degradation | Lost hits | Share of total loss | Field acc |
       |------|-------------|-----------|---------------------|-----------|
       | 1 | `gaussian_blur` | 111 | **23.8%** | 0.0% |
       | 1 | `partial_crop` | 111 | **23.8%** | 0.0% |
       | 3 | `content_missing_mrz` | 96 | **20.6%** | 13.5% |
       | 4 | `motion_blur` | 30 | 6.4% | 73.0% |
       | 4 | `skewed` | 30 | 6.4% | 73.0% |
       | 6+ | All others | 88 | 18.9% | 91–100% |

       **Top 3 categories account for 68.2% of all lost accuracy.**  
       Fixing them is the highest-leverage path from 79% → ~88–93% field accuracy.

       Two distinct failure modes dominate:

       1. **OCR collapse** — Gaussian blur destroys readable text (16.7% avg OCR char accuracy).
       2. **Extraction gated off despite good OCR** — Partial crop averages **95% OCR char accuracy** but **0% field accuracy** because `isVisaLikeContext()` returns false and label extraction never runs.

       ---

       ## 2. Failure ranking by contribution

       ### 2.1 By degradation type

       ```
       Total scored: 1754 / 2220 hits (466 lost)

       gaussian_blur     ████████████████████████ 111 lost (23.8%)
       partial_crop      ████████████████████████ 111 lost (23.8%)
       content_missing   ████████████████████     96 lost (20.6%)
       motion_blur       ██████                   30 lost (6.4%)
       skewed            ██████                   30 lost (6.4%)
       all other (14)    ████████████████         88 lost (18.9%)
       ```

       ### 2.2 By failure mechanism

       | Mechanism | Samples affected | Field loss | MRZ miss | False negative |
       |-----------|------------------|------------|----------|----------------|
       | OCR unreadable (blur) | 10 gaussian | 111 | 10 | 10 |
       | Detection gate (`isVisaLikeContext` false) | 10 partial_crop + some missing_mrz | ~111+ | 10 | 10 |
       | No MRZ + weak label-only path | 10 missing_mrz | 96 | 0* | 0 |
       | MRZ checksum fail (labels OK) | 10 skewed + 10 invalid_mrz | 30+6 | 20 | 0 |
       | Minor label/date misses | ~60 samples | 88 | 5 | 0 |

       \*`mrzValid: false` is expected for `missing_mrz`; MRZ metric counts as “match.”

       ### 2.3 By country (lowest field accuracy)

       | Country | Field acc | Primary drag |
       |---------|-----------|--------------|
       | Australia | 64.1% | missing_mrz (0/11), gaussian, partial_crop |
       | USA | 75.8% | gaussian, partial_crop, missing_mrz (2/12) |
       | UK | 75.5% | Same top-3 variants |
       | UAE | 79.5% | Same |
       | Canada | 85.0% | missing_mrz strong (9/11); less MRZ-dependent |

       ---

       ## 3. Per-category failure analysis

       ### 3.1 `gaussian_blur` (10 samples, 0% field acc)

       | Sample | OCR char | Detected | Fields | MRZ |
       |--------|----------|----------|--------|-----|
       | usa_04_gaussian_blur | **0%** | false | 0/12 | fail |
       | uk_04_gaussian_blur | 50% | false | 0/11 | fail |
       | All 10 | 16.7% avg | **10 FN** | 0/11–12 | 10 miss |

       **OCR output:** Empty or unrecognizable text (`rawText` ≈ 0 useful tokens). `sharp.blur(3.5)` smears label and MRZ strokes beyond Tesseract recovery.

       **Expected fields:** Full visa label set + valid MRZ (e.g. USA: SMITH, JOHN, GER, CZ6311T47, CONTROL 9102392482, …).

       **Failure reason:**
       1. Preprocessing (`normalize` + `sharpen σ=1.2`) insufficient for σ=3.5 blur.
       2. `detectAsVisa` false (no `V<`, no readable `^VISA` / `CONTROL NO` + `SURNAME`).
       3. `isVisaLikeContext` false → **zero label extraction**.
       4. MRZ strip OCR finds no `V<` lines.

       ---

       ### 3.2 `partial_crop` (10 samples, 0% field acc)

       | Sample | OCR char | Detected | Fields | MRZ |
       |--------|----------|----------|--------|-----|
       | usa_07_partial_crop | **100%** | false | 0/12 | fail |
       | schengen_07_partial_crop | 83% | false | 0/11 | fail |
       | All 10 | **95% avg** | **10 FN** | 0 | 10 miss |

       **OCR output:** Text tokens present (SURNAME, NATIONALITY, passport number fragments at 83–100% char accuracy). OCR **succeeds**; extraction **never runs**.

       **Expected fields:** Same as clean scan for each country.

       **Failure reason:**
       1. Crop removes **bottom ~12%** → MRZ band (`y≈1180–1340`) cut off → no `V<`, `mrzValid=false`.
       2. Title is `"UNITED STATES VISA"` / `"SCHENGEN VISA"` — does **not** match `^VISA\b` (line-start rule).
       3. `detectAsVisa` falls through unless `CONTROL NO` + `SURNAME` both OCR-clean (fragile on cropped images).
       4. `isVisaLikeContext` false → **gates off** `extractVisaFromOcr` and legacy OCR merge.
       5. **Critical:** High OCR accuracy but 0 fields = **logic failure, not OCR failure**.

       ---

       ### 3.3 `content_missing_mrz` (10 samples, 13.5% field acc)

       | Sample | OCR char | Detected | Fields |
       |--------|----------|----------|--------|
       | canada_19_missing_mrz | 83% | true | **9/11** |
       | usa_19_missing_mrz | 71% | true | 2/12 |
       | australia_19_missing_mrz | 83% | true | **0/11** |
       | uk/uae/india_19 | 50–83% | true | **0/11** |

       **OCR output:** Moderate–good (67–83%). Labels often readable.

       **Expected fields:** Full visual label set; `mrzValid: false`; no `machineReadableZone`.

       **Failure reason:**
       1. **No MRZ backup** — `mrzValid` never true; all identity fields must come from labels.
       2. **Detection is country-specific:** USA partial success via `CONTROL NO` + `SURNAME` (2/12). Canada 9/11 (strong label layout). Australia/UK/UAE/India **0/11** despite 83% OCR.
       3. Australia uses **`GRANT NO`** not `CONTROL NO` — not in `detectAsVisa` signals.
       4. Titles like `"AUSTRALIA VISA GRANT"` / `"UK VISA VIGNETTE"` — `VISA` not at line start; identity block requires `^VISA` header **and** labels (fails).
       5. `issuingCountry` often only from `V<XXX>` MRZ — always null without MRZ.
       6. Benchmark ground truth still has `expectedDetectedAsVisa: false` in JSON (stale); runtime detection is true but extraction remains poor.

       ---

       ### 3.4 `skewed` (10 samples, 73% field acc, 0% MRZ acc)

       | Sample | OCR char | Detected | Fields | MRZ |
       |--------|----------|----------|--------|-----|
       | usa_05_skewed | 71% | true | 9/12 | fail |
       | All 10 | 63.8% avg | true | 73% | **10 miss** |

       **Failure reason:** ±4° rotation breaks MRZ strip crop alignment and check digits; **labels still mostly extract**. Deskew + MRZ char repair would recover MRZ without hurting labels.

       ---

       ### 3.5 `motion_blur` (10 samples, 73% field acc)

       **Failure reason:** Mild blur (σ=2.5); MRZ 1/10 miss; typically loses `sex`, `issueDate`, or `entries` (2 fields/sample avg). Deblur + dual PSM pass recovers most.

       ---

       ### 3.6 `content_invalid_mrz` (94.6% field acc, 0% MRZ acc)

       **Failure reason:** Checksum intentionally wrong; labels carry extraction. MRZ metric correctly fails. **Not a field-accuracy problem** — fix is MRZ repair after OCR (O/0, I/1 substitution), not label logic.

       ---

       ## 4. Root cause map

       ```
                     ┌─────────────────────────────────────┐
                     │         Image degradation           │
                     └─────────────────┬───────────────────┘
                                          │
              ┌───────────────────────────┼───────────────────────────┐
              ▼                           ▼                           ▼
       OCR unreadable              OCR readable                 MRZ damaged
       (gaussian_blur)             (partial_crop)               (skewed, crop)
              │                           │                           │
              ▼                           ▼                           ▼
       detectAsVisa=false          detectAsVisa=false            mrzValid=false
              │                           │                           │
              ▼                           ▼                           ▼
       isVisaLikeContext=false     isVisaLikeContext=false       labels still work
              │                           │                     (73% field acc)
              ▼                           ▼
       ZERO extraction             ZERO extraction
       (0% fields)                 (0% fields despite 95% OCR)
       ```

       **Secondary path (missing_mrz):** OCR OK → detection partial → labels run for some countries → 13.5% avg because MRZ-only fields (`issuingCountry`, sometimes `passportNumber`) empty and country-specific signals missing.

       ---

       ## 5. Top 10 recommended fixes (prioritized by gain ÷ effort)

       | # | Fix | Est. field Δ | Est. MRZ Δ | Est. FN Δ | Effort | Risk | Gain/Effort |
       |---|-----|--------------|------------|-----------|--------|------|-------------|
       | **1** | **Label-triggered extraction:** run OCR label pass when ≥3 visa labels found in `rawText`, even if `detectAsVisa` false | **+8–12%** | +2% | **−5 to −8%** | S | Medium FP | ★★★★★ |
       | **2** | **Relax `detectAsVisa`:** accept titles containing `\bVISA\b` (not only `^VISA`); add `GRANT NO`, `VIGNETTE`, `e-VISA` signals | **+6–10%** | +1% | **−5%** | S | Low–Med | ★★★★★ |
       | **3** | **Blur recovery preprocessing:** unsharp mask + adaptive threshold pass before OCR; try 2–3 sharpen variants on gaussian/motion | **+5–9%** | +3–5% | **−5%** | M | Low | ★★★★☆ |
       | **4** | **Multi-region OCR:** crop top 45% (labels) + bottom 30% (MRZ) separately, merge text | **+6–10%** | +4–6% | **−3–5%** | M | Low | ★★★★☆ |
       | **5** | **Visa endpoint: skip `isVisaLikeContext` gate** when `type=visa` (always extract labels) | **+5–8%** | +2% | **−5%** | S | Med FP | ★★★★☆ |
       | **6** | **Deskew / auto-rotate** before MRZ strip (estimate angle from Hough / projection) | +3–4% | **+5–8%** | 0% | M | Low | ★★★☆☆ |
       | **7** | **MRZ OCR repair loop:** on checksum fail, retry with O/0 I/1 B/8 S/5 Z/2 substitutions | +1–2% | **+8–12%** | 0% | M | Low | ★★★☆☆ |
       | **8** | **Expand MRZ search on cropped images:** run `V<` regex on full-page OCR, not only bottom strip | +2–3% | +4–5% | −2% | S | Low | ★★★☆☆ |
       | **9** | **Country label aliases:** `GRANT NO`, `IPA`, bilingual FR labels for Schengen/Canada | +2–4% | 0% | 0% | S | Low | ★★★☆☆ |
       | **10** | **Dual PSM full-page pass** (PSM 3 + 6) merge for dates/sex on degraded scans | +2–3% | +1% | −1% | S | Low | ★★☆☆☆ |

       **Effort key:** S = 1–2 days · M = 3–5 days · L = 1+ weeks  
       **Risk:** FP = false-positive risk on non-visa uploads to `/api/extraction/visa`

       ---

       ## 6. Estimated cumulative improvement

       | Scenario | Fixes applied | Field acc | MRZ acc | FN rate |
       |----------|---------------|-----------|---------|---------|
       | **Current** | — | 79.0% | 77.5% | 10.0% |
       | **Quick wins** | #1 + #2 + #5 | **86–88%** | 79–81% | **2–4%** |
       | **+ Blur/crop** | + #3 + #4 | **90–92%** | 84–88% | **0–2%** |
       | **+ MRZ hardening** | + #6 + #7 + #8 | **91–93%** | **92–95%** | **0–1%** |
       | **Optimistic ceiling** | All 10 | **93–95%** | **95–97%** | **0%** |

       **Conservative single-release target (fixes #1–#4):** **+9–11% field accuracy** → **~88–90%** overall.

       ---

       ## 7. Risk assessment

       | Fix | Regression risk | False-positive risk | Backward-compat |
       |-----|-----------------|---------------------|-----------------|
       | Label-triggered extraction (#1) | Low | Medium — may extract from insurance/forms | API shape unchanged |
       | Relaxed detection (#2) | Low | Low–Med — `"travel VISA"` phrases | `detectedAsVisa` semantics change |
       | Blur preprocessing (#3) | Low | None | None |
       | Multi-region OCR (#4) | Low | None | Slower OCR (+20–40%) |
       | Skip visa gate (#5) | Low | **High** on wrong-doc uploads | Confidence may rise on non-visas |
       | Deskew (#6) | Med — may over-rotate | None | None |
       | MRZ repair (#7) | Med — wrong repair | None | `mrzValid` may flip true more often |
       | Full-page MRZ search (#8) | Low | Low | None |

       **Recommended order:** #2 → #1 → #4 → #3 → #7 → #6. Defer #5 unless endpoint is visa-only by contract.

       ---

       ## 8. Samples requiring no code change

       | Item | Action |
       |------|--------|
       | `expectedDetectedAsVisa: false` in missing_mrz ground truth | Fix generator JSON (metric skew only) |
       | `content_invalid_mrz` MRZ misses | Expected; exclude from MRZ regression or score separately |
       | Australia low country score | Primarily #2 + #9 (GRANT NO) |

       ---

       ## 9. Validation plan (post-implementation)

       1. Re-run `npm run benchmark:visa-images` on all 200 images.
       2. Assert per-category floors: `partial_crop` ≥ 70% field · `gaussian_blur` ≥ 50% · `missing_mrz` ≥ 75%.
       3. Assert `falseNegativeRate` ≤ 2%.
       4. Re-run `npm run test:visa-fp` — no FP regression.
       5. Track wall-clock (shared worker); budget &lt; 15 min for 200 images.

       ---

       ## 10. Key takeaway

       > **~48% of lost accuracy comes from two cases where extraction is intentionally disabled (`isVisaLikeContext`) despite OCR often succeeding.**  
       > Fixing the detection gate and label-triggered extraction (#1, #2) delivers more field accuracy per engineering day than further Tesseract tuning on clean scans (already 96%+).

       ---

       *Analysis derived from `benchmark-results.json` aggregate stats and per-sample fields (`fieldHits`, `ocrCharAccuracy`, `falseNegative`, `mrzMatch`). Representative OCR traces: `usa_04_gaussian_blur` (0% OCR), `usa_07_partial_crop` (100% OCR, 0 fields), `canada_19_missing_mrz` (9/11), `australia_19_missing_mrz` (0/11).*
