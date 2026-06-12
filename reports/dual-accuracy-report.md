# Dual Accuracy Report

Separates **OCR fidelity** (extraction vs OCR segment) from **business truth** (extraction vs ground truth).

## Summary

| Metric | Accuracy |
| --- | --- |
| OCR Extraction Accuracy | 96.0% |
| Business Accuracy | 83.5% |

## Accuracy Loss Attribution

| Source | Failures | Share of fields |
| --- | --- | --- |
| OCR corruption (extraction OK, business wrong) | 30 | 15.0% |
| Extraction logic (extraction ≠ OCR segment) | 8 | 4.0% |

Business accuracy is -12.5pp below extraction accuracy.
Negative gap means OCR corruption dominates failures even when segmentation is correct.

## Per-field

| Field | Extraction | Business | OCR-attributed fails | Extraction-attributed fails |
| --- | --- | --- | --- | --- |
| companyName | 100.0% | 45.0% | 11 | 0 |
| creditCode | 95.0% | 95.0% | 0 | 1 |
| legalRepresentative | 85.0% | 95.0% | 0 | 3 |
| companyType | 100.0% | 90.0% | 2 | 0 |
| registeredCapital | 95.0% | 95.0% | 0 | 1 |
| establishmentDate | 100.0% | 80.0% | 4 | 0 |
| businessTerm | 100.0% | 90.0% | 2 | 0 |
| address | 90.0% | 80.0% | 4 | 2 |
| businessScope | 95.0% | 75.0% | 5 | 1 |
| registrationAuthority | 100.0% | 90.0% | 2 | 0 |

_Generated 2026-06-11T11:00:22.166Z_