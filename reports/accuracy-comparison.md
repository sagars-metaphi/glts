# Accuracy Comparison

## Overall

| Metric | Before (business) | After extraction | After business | Delta |
| --- | --- | --- | --- | --- |
| Overall | 75.5% | 96.0% | 83.5% | +8.0% |

OCR-attributed loss: 15.0% of fields
Extraction-attributed loss: 4.0% of fields



## Per-field (business baseline vs dual after)

| Field | Before business | After extraction | After business | Delta |
| --- | --- | --- | --- | --- |
| companyName | 55.0% | 100.0% | 45.0% | -10.0% |
| creditCode | 60.0% | 95.0% | 95.0% | +35.0% |
| legalRepresentative | 85.0% | 85.0% | 95.0% | +10.0% |
| companyType | 85.0% | 100.0% | 90.0% | +5.0% |
| registeredCapital | 80.0% | 95.0% | 95.0% | +15.0% |
| establishmentDate | 80.0% | 100.0% | 80.0% | +0.0% |
| businessTerm | 80.0% | 100.0% | 90.0% | +10.0% |
| address | 75.0% | 90.0% | 80.0% | +5.0% |
| businessScope | 65.0% | 95.0% | 75.0% | +10.0% |
| registrationAuthority | 90.0% | 100.0% | 90.0% | +0.0% |

_Generated 2026-06-11T11:00:22.182Z_