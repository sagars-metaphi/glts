# Visa Extraction — Security Review

**Scope:** Visa extraction API path, data handling, and abuse resistance.  
**Threat model:** Untrusted document uploads via `POST /api/extraction/visa`.

---

## Data sensitivity

Visa images contain **high-sensitivity PII**: full name, DOB, sex, nationality, passport number, visa numbers, employer/sponsor, travel purpose.

| Data path | Exposure | Risk |
|-----------|----------|------|
| `visa` object in JSON response | Full structured PII | Expected for API consumers — ensure HTTPS + auth at deployment |
| `rawText` in response | **Complete OCR dump** including noise, third-party text | High — leaks more than structured fields |
| `machineReadableZone` | Stores **full `rawText`**, not MRZ-only | Misleading field name; same exposure as rawText |
| `visaOcrFields` | Legacy + enhanced OCR map | Duplicate PII surface |
| Server logs | Depends on middleware | Audit `logger` calls on extraction routes |

**Recommendation (High):** Gate `rawText` / full OCR behind a query flag (`?includeRaw=false` default) for production clients that only need structured fields.

---

## Input handling

| Vector | Current state | Risk |
|--------|---------------|------|
| File size limit | Not enforced in `VisaExtractor` | DoS via huge PDF/image — Tesseract + sharp memory |
| File type validation | Delegated to OCR layer | Malformed files may cause CPU spin |
| PDF bomb / many pages | `pdf-to-png-converter` usage in `ocr.js` | Resource exhaustion |
| Concurrent uploads | No visa-specific throttling | Worker pool exhaustion |

**Recommendation (Medium):** Enforce max file size (e.g. 10MB) and page count at extraction middleware before OCR.

---

## Injection and output safety

| Vector | Assessment |
|--------|------------|
| Regex DoS (ReDoS) | Label patterns use bounded `{1,64}` — **low risk** |
| JSON injection | Structured serialization — standard risk |
| XSS via extracted text | If UI renders `rawText` unsanitized — **consumer responsibility** |
| Path traversal | Buffer-based extract — no file path in visa module |

---

## False extraction as security issue

Incorrect extraction is a **business-logic / compliance** risk, not classic CVE:

| Scenario | Impact |
|----------|--------|
| Invoice → `controlNumber` | Wrong visa ID in downstream KYC |
| Form with "VISA" → `detectedAsVisa=true` | Automated approval of non-visa document |
| Insurance → `purposeOfTravel` | False travel intent record |
| Passport on visa endpoint → identity fields returned | Cross-document-type data without explicit error |

**Recommendation (Critical):** Fix legacy 10-digit control heuristic. Tighten `detectedAsVisa` before any automated decisioning.

---

## Confidence as trust signal

Downstream systems may treat `confidence` or `mrzConfidence` as authorization input.

| Issue | Abuse |
|-------|-------|
| Inflated `ocrConfidence` from junk fields | Auto-approve low-quality forgeries |
| `mrzConfidence=0.95` binary | Implies cryptographic trust — only checksum, not authenticity |
| No signature / tamper detection | Scanned forgery indistinguishable |

**Recommendation (High):** Document that confidence is **extraction quality**, not document authenticity. Never use as sole KYC gate.

---

## Validation visibility

`validateVisaData()` produces `warnings` and `errors` but `VisaExtractor` **does not return them**. Security reviewers cannot see failed checks in API responses.

**Recommendation (High):** Expose `validation: { valid, errors, warnings }` without breaking existing fields.

---

## Dependency surface

| Dependency | Role | Note |
|------------|------|------|
| `tesseract.js` | OCR | Native wasm; keep updated |
| `sharp` | Image preprocess | libvips; image bomb risk |
| `mrz` npm | MRZ parse | Supply chain — pin version |
| `pdf-parse` / `pdf-to-png-converter` | PDF | Complex PDFs = attack surface |

No secrets in visa module. `ocrb.traineddata` is local model — verify integrity on deploy.

---

## Privacy / retention

| Topic | Current | Recommendation |
|-------|---------|----------------|
| Uploaded file storage | Depends on route/storage module | Define retention policy |
| OCR text in DB | If persisted via document module | Encrypt at rest |
| GDPR right to erasure | Not visa-module concern | Document data flow |

---

## Authentication / authorization

Visa extraction inherits app-level middleware (`app.ts`). This review assumes:

- Endpoint should be **authenticated** in production.
- Rate limiting per API key / IP recommended.

Not verified in visa module — **deployment concern**.

---

## Summary risk register

| ID | Risk | Severity | Mitigation |
|----|------|----------|------------|
| SEC-01 | rawText PII over-exposure | High | Optional redaction flag |
| SEC-02 | Legacy 10-digit false control | **Critical** | Remove heuristic |
| SEC-03 | detectedAsVisa word match | High | Stricter detection |
| SEC-04 | Confidence misused as auth | High | Document + cap metrics |
| SEC-05 | No upload size limit | Medium | Middleware limit |
| SEC-06 | Validation hidden | Medium | Expose in API |
| SEC-07 | Forged scan acceptance | Inherent | Human review for high-risk |

---

## Safe defaults checklist (deployment)

- [ ] HTTPS only
- [ ] Authentication on `/api/extraction/*`
- [ ] Rate limiting
- [ ] Max upload size
- [ ] Do not log `rawText`
- [ ] Do not auto-approve on `confidence > 0.9` alone
- [ ] Treat `mrzValid` as checksum only, not document genuineness
