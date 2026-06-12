# Chinese Business License Diagnostic Report

Overall accuracy: **83.5%**
Total field failures: **33**

## Why accuracy is below target

At 83.5% overall, the benchmark corpus mixes clean (style-a) and degraded OCR styles.
Failures cluster around OCR label corruption, credit-code punctuation, and boundary segmentation — not clean-document extraction.

### Per-field exact match

| Field | Accuracy | Failures |
|-------|----------|----------|
| companyName | 45.0% | 11 |
| creditCode | 95.0% | 1 |
| legalRepresentative | 95.0% | 1 |
| companyType | 90.0% | 2 |
| registeredCapital | 95.0% | 1 |
| establishmentDate | 80.0% | 4 |
| businessTerm | 90.0% | 2 |
| address | 80.0% | 4 |
| businessScope | 75.0% | 5 |
| registrationAuthority | 90.0% | 2 |

## Failure buckets

- **ocr_failure**: 20
- **segmentation_failure**: 1
- **validation_failure**: 1
- **confidence_failure**: 11

## Ranked root causes

### Root Cause #1: Label text corrupted
Impact: **13** failures
Fields: businessTerm, businessScope, address, creditCode, registeredCapital
Examples: style-b-sample-001, style-b-sample-002, style-d-sample-001, style-d-sample-002, style-e-sample-001

Known labels damaged (统一社会佰用代码, 注册责本, 经营·范围, 营业期很, 经范围)

### Root Cause #2: High-confidence wrong extraction
Impact: **11** failures
Fields: businessScope, address, businessTerm, companyName, legalRepresentative, registeredCapital
Examples: style-b-sample-002, style-d-sample-001, style-d-sample-002, style-e-sample-001, style-e-sample-002

Field wrong but confidence >= 0.85

### Root Cause #3: 有限公司 → 有很公司 OCR confusion
Impact: **7** failures
Fields: companyName, companyType
Examples: style-b-sample-002, style-c-sample-002, style-d-sample-002, style-e-sample-001, style-e-sample-002

限/有/很 character confusion in company suffix

### Root Cause #4: businessScope OCR degradation
Impact: **5** failures
Fields: businessScope
Examples: style-b-sample-002, style-e-sample-001, style-h-sample-001, style-i-sample-001, style-i-sample-002

经营范围 label broken or segment empty

### Root Cause #5: Address OCR noise characters
Impact: **2** failures
Fields: address
Examples: style-d-sample-001, style-d-sample-002

Underscores or punctuation inserted in address (_168号)

### Root Cause #6: Date OCR noise
Impact: **2** failures
Fields: businessTerm, establishmentDate
Examples: style-b-sample-001, style-j-sample-002

Punctuation/line-breaks inside dates (2!008, 20\n35)

### Root Cause #7: Punctuation injected into credit code
Impact: **1** failures
Fields: creditCode
Examples: style-d-sample-002

OCR inserts · # ! : _ into 18-digit USCC breaking boundary regex

### Root Cause #8: Credit code checksum rejection
Impact: **1** failures
Fields: creditCode
Examples: style-d-sample-002

Valid expected code corrupted; no checksum-valid candidate selected

## Prioritized recommendations

1. (13 failures) Add fuzzy label matching (Levenshtein ≤1) for 统一社会信用代码, 注册资本, 经营范围, 营业期限.
2. (11 failures) Penalize confidence when rawSegment diverges from extracted value or label boundary missing.
3. (7 failures) Do not auto-correct companyName; for companyType only, score 有很→有限 via confusion resolver.
4. (5 failures) Fuzzy-match 经营范围 label; fallback to line after 住所 if scope label missing.
5. (2 failures) Strip isolated underscores/punctuation in address post-process without inventing text.
6. (2 failures) Pre-clean dates: remove ! _ and rejoin split year tokens before normalizeChineseDate.
7. (1 failures) Strip punctuation from credit-code window before candidate search; retry O→0 / l→1 normalization per candidate.
8. (1 failures) When expected region has punctuation, expand candidate search with punctuation-stripped sliding windows.

## Output files
- `reports/detailed-failures.json`
- `reports/failure-categories.json`
- `reports/credit-code-candidates.json`
- `reports/company-name-boundaries.json`
- `reports/root-causes.json`
- `reports/diagnostic-recommendations.json`