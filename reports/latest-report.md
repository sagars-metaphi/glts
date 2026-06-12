# Chinese Business License Benchmark Report

Generated: 2026-06-11T11:00:22.097Z
Mode: text
Duration: 0.5s
Documents: 20

## Dual Accuracy

| Metric | Accuracy |
| --- | --- |
| OCR Extraction Accuracy | 96.0% |
| Business Accuracy | 83.5% |

OCR-attributed failures: 30 (15.0% of fields)
Extraction-attributed failures: 8 (4.0% of fields)

### Pass / Fail
**FAILED** — creditCode business accuracy 95.0% < 99%

### Field Accuracy

| Field | Extraction | Business | Precision | Recall | F1 |
|-------|------------|----------|-----------|--------|-----|
| companyName | 100.0% | 45.0% | 47.4% | 45.0% | 46.2% |
| creditCode | 95.0% | 95.0% | 100.0% | 95.0% | 97.4% |
| legalRepresentative | 85.0% | 95.0% | 95.0% | 95.0% | 95.0% |
| companyType | 100.0% | 90.0% | 90.0% | 90.0% | 90.0% |
| registeredCapital | 95.0% | 95.0% | 95.0% | 95.0% | 95.0% |
| establishmentDate | 100.0% | 80.0% | 80.0% | 80.0% | 80.0% |
| businessTerm | 100.0% | 90.0% | 90.0% | 90.0% | 90.0% |
| address | 90.0% | 80.0% | 84.2% | 80.0% | 82.1% |
| businessScope | 95.0% | 75.0% | 75.0% | 75.0% | 75.0% |
| registrationAuthority | 100.0% | 90.0% | 90.0% | 90.0% | 90.0% |

### Per-Style Extraction Accuracy

- **style-a**: 100.0% extraction / 100.0% business (2 docs)
- **style-b**: 100.0% extraction / 85.0% business (2 docs)
- **style-c**: 100.0% extraction / 95.0% business (2 docs)
- **style-d**: 95.0% extraction / 80.0% business (2 docs)
- **style-e**: 100.0% extraction / 75.0% business (2 docs)
- **style-f**: 95.0% extraction / 95.0% business (2 docs)
- **style-g**: 90.0% extraction / 60.0% business (2 docs)
- **style-h**: 100.0% extraction / 80.0% business (2 docs)
- **style-i**: 80.0% extraction / 70.0% business (2 docs)
- **style-j**: 100.0% extraction / 95.0% business (2 docs)

### Top Failure Types

- ocr_issue: 19
- unknown: 8
- confusion_resolver_issue: 4
- segmentation_issue: 2

### Review & Confidence
- Review trigger rate: 10.5%
- Average confidence: 90.2%
- Avg extraction time: 8ms
- Avg OCR time: 0ms

### Confidence Calibration (business accuracy)

| Bucket | Count | Business | Extraction |
|--------|-------|----------|------------|
| 0.0-0.5 | 2 | 0.0% | 100.0% |
| 0.5-0.7 | 7 | 0.0% | 85.7% |
| 0.7-0.8 | 34 | 67.6% | 100.0% |
| 0.8-0.9 | 9 | 44.4% | 88.9% |
| 0.9-1.0 | 148 | 94.6% | 95.9% |

High-confidence (>=0.90) business accuracy: 94.6%
High-confidence (>=0.90) extraction accuracy: 95.9%

Notes:
- confidence>=0.90 bucket business accuracy 94.6% is below 98% target
- confidence>=0.90 bucket extraction accuracy 95.9% is below 98% target