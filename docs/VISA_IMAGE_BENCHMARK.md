# Visa Image OCR Benchmark

Generated: 2026-06-09T06:41:46.678Z

## Summary

| Metric | Value |
|--------|-------|
| Samples | 200 |
| Field accuracy | 75.3% |
| OCR character accuracy | 89.9% |
| MRZ accuracy | 77.5% |
| False positive rate | 0.0% |
| False negative rate | 5.0% |
| Total runtime | 7638.8s |
| Avg per image | 38174ms |
| Blur pass winners (non-pass1) | 6 |
| Recovered field signals | 0 |
| Avg OCR confidence | 63.4 |

## By country

| Country | Samples | Field accuracy |
|---------|---------|----------------|
| australia | 20 | 86.4% |
| canada | 20 | 89.5% |
| china | 20 | 66.8% |
| india | 20 | 69.1% |
| japan | 20 | 70.9% |
| schengen | 20 | 70.0% |
| singapore | 20 | 75.5% |
| uae | 20 | 85.0% |
| uk | 20 | 65.0% |
| usa | 20 | 75.0% |

## By degradation

| Degradation | Samples | Field accuracy |
|-------------|---------|----------------|
| content_expired | 10 | 83.8% |
| content_invalid_mrz | 10 | 83.8% |
| content_long_names | 10 | 78.3% |
| content_missing_mrz | 10 | 28.0% |
| content_multi_surname | 10 | 83.8% |
| content_special_chars | 10 | 83.8% |
| dark | 10 | 83.8% |
| font_arial | 10 | 83.8% |
| font_mixed | 10 | 94.7% |
| font_ocr_a | 10 | 76.5% |
| gaussian_blur | 10 | 0.0% |
| glare | 10 | 83.8% |
| low_dpi | 10 | 85.5% |
| motion_blur | 10 | 74.7% |
| none | 10 | 85.5% |
| overexposed | 10 | 83.8% |
| partial_crop | 10 | 68.9% |
| perspective | 10 | 100.0% |
| skewed | 10 | 64.8% |
| stamp | 10 | 79.2% |

## OCR pass winners

| Pass | Samples |
|------|---------|
| pass1 | 194 |
| pass2 | 3 |
| pass4 | 3 |

## Lowest field accuracy (top 10)

| ID | Field acc | OCR acc | MRZ ok |
|----|-----------|---------|--------|
| usa_04_gaussian_blur | 0% | 0% | no |
| schengen_04_gaussian_blur | 0% | 0% | no |
| schengen_19_missing_mrz | 0% | 67% | yes |
| uk_04_gaussian_blur | 0% | 67% | no |
| uk_19_missing_mrz | 0% | 50% | yes |
| canada_04_gaussian_blur | 0% | 17% | no |
| australia_04_gaussian_blur | 0% | 33% | no |
| uae_04_gaussian_blur | 0% | 50% | no |
| india_04_gaussian_blur | 0% | 17% | no |
| india_19_missing_mrz | 0% | 83% | yes |

## Notes

- Images: `tests/fixtures/visa-images/{country}/{variant}.png`
- Ground truth: `tests/fixtures/visa-groundtruth/`
- Pipeline: real `OCRService` + `evaluateVisaFromImage` (no mocked OCR)
- Regenerate: `node tests/fixtures/visa-image-generator.mjs`
- Re-benchmark: `npm run benchmark:visa-images`
