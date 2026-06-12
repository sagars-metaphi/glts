# Chinese Business License Synthetic Testing Framework

Separate from production extraction code. Generates realistic synthetic 营业执照 documents, runs benchmarks, and produces accuracy reports.

## Quick Start

```bash
# Generate fixtures (default: 10 per style = 100 documents)
npm run generate:chinese-business-license

# Full scale (100 per style = 1000 documents)
CBL_GEN_PER_STYLE=100 npm run generate:chinese-business-license

# Run text-mode benchmark (fast, no OCR)
npm run benchmark:chinese-business-license

# Run image-mode benchmark (full OCR pipeline, slow)
CBL_BENCHMARK_MODE=image CBL_BENCHMARK_LIMIT=20 npm run benchmark:chinese-business-license

# Regression suite with pass/fail gates
npm run test:chinese-business-license-regression
```

## Output Layout

```
testing/chinese-business-license-fixtures/
  style-a/sample-001.png
  style-a/sample-001.pdf
  style-a/sample-001.truth.json
  manifest.json

reports/
  latest-report.md
  benchmark-results.json
  error-analysis.json
  confidence-calibration.json
```

## Document Styles

| Style | Description |
|-------|-------------|
| style-a | Clean modern scan |
| style-b | Low DPI |
| style-c | Watermark |
| style-d | Rotated 90° |
| style-e | Rotated 180° |
| style-f | Stamp overlap |
| style-g | Blurred |
| style-h | Noise |
| style-i | Mixed Chinese/English |
| style-j | Multi-page license + ID card |

## Pass / Fail Thresholds

- creditCode ≥ 99%
- companyName ≥ 95%
- legalRepresentative ≥ 95%
- overall ≥ 92%

Set `CBL_BENCHMARK_STRICT=1` to fail on threshold breach.

## Architecture

```
Ground Truth (truth.ts + pools.ts)
  → Renderer (PNG/PDF)
  → Style Transforms
  → OCR Corruptor (text mode)
  → Extraction Pipeline (production, unmodified)
  → Compare + Metrics + Reports
```
