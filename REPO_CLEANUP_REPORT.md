# Repository Cleanup Report

**Date:** 2026-06-06  
**Scope:** Root cleanup after full migration to `src/` (portfolio untouched)

---

## SAFE TO DELETE (removed)

| Path | Reason |
|------|--------|
| `document-extraction/` | Legacy duplicate folder (empty shell) |
| `lib/` | Benchmark/dataset helpers only |
| `dataset/` | Generated benchmark images, not runtime |
| `samples/` | Dev sample docs, not runtime |
| `scripts/` | Moved to `tests/` |
| `templates/` (root) | Moved to `src/templates/` |
| `models/` (root) | Moved to `src/models/` |
| `test-mrz.js`, `test-visa-mrz.js` (root) | Moved to `tests/` |
| `generate_dataset_pro.cjs` | Benchmark generator, not production |
| `generate_dataset_pro.cjs.cjs` | Duplicate backup |
| `evaluate-classification.cjs` | Benchmark eval script |
| `generate-performance-report.cjs` | Report generator |
| `eng.traineddata`, `mrz.traineddata`, `ocrb.traineddata` (root) | Duplicates; OCR uses `src/models/` |
| `mrz_old.zip` | Unused archive |
| `evaluation_report.json/md` | Generated reports |
| `report.json/md`, `PERFORMANCE_REPORT.md` | Generated reports |
| `eval-run.log` | Log artifact |
| `CLEANUP_REPORT.md` | Superseded by this report |
| `output/document-extraction/*.json` | Generated extraction artifacts |

### Removed npm dependencies

| Package | Was used by |
|---------|-------------|
| `axios` | evaluate-classification.cjs |
| `form-data` | evaluate-classification.cjs |
| `canvas` | generate_dataset_pro.cjs |

### Removed npm scripts

| Script | Reason |
|--------|--------|
| `generate:dataset` | Benchmark tooling removed |
| `eval` | Benchmark tooling removed |
| `eval:report` | Benchmark tooling removed |
| `benchmark:*` | Already absent / obsolete |

---

## MOVED TO SRC / TESTS

| From | To |
|------|-----|
| `templates/` | `src/templates/` |
| `models/` | `src/models/` |
| `test-mrz.js` | `tests/mrz.test.js` |
| `test-visa-mrz.js` | `tests/visa-mrz.test.js` |
| `scripts/test-doc-extract.js` | `tests/doc-extract.test.js` |
| `src/test-fixtures/` | `tests/fixtures/` (already moved earlier) |

---

## REQUIRED TO KEEP

| Path | Purpose |
|------|---------|
| `src/` | Application source (single source of truth) |
| `src/templates/` | Runtime template JSON files |
| `src/models/` | OCR-B trained data for MRZ |
| `prisma/` | Database schema |
| `tests/` | Unit & integration tests |
| `uploads/` | Runtime upload directory (`.gitkeep`) |
| `output/` | Runtime extraction output (`.gitkeep`) |
| `package.json`, `package-lock.json` | Dependencies |
| `tsconfig.json` | TypeScript config |
| `.env.example` | Environment template |
| `.gitignore` | Git ignore rules |
| `Dockerfile`, `docker-compose.yml` | Container deployment |
| `.devcontainer/` | Dev container config |
| `README.md` | Project documentation |
| `portfolio/` | **Untouched** per instruction |

---

## BROKEN REFERENCES FOUND & FIXED

| Issue | Fix |
|-------|-----|
| `paths.templates` pointed to root `templates/` | Updated to `src/templates/` in `src/config/paths.ts` |
| `ocr.js` model path after move | Updated to `src/models/` |
| `tests/mrz.test.js` import paths | Fixed relative imports |
| `tests/visa-mrz.test.js` fixture imports | Fixed to `./fixtures/` |
| `tests/fixtures/visa-mrz-generator.js` | Import `mrz-parser.js` from `src/` |
| `tests/doc-extract.test.js` | Updated paths; skips if no sample DOCX |
| Dockerfile | Copies `src/templates` + `src/models` to `dist/` |
| docker-compose volumes | Removed obsolete `templates/` mount |

---

## VERIFICATION

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | Pass |
| `npm run test:all` | Pass (12 unit + MRZ + visa) |
| Docker build paths | Updated |
| Prisma | Unchanged, `prisma/` kept |
| portfolio/ | Not modified |

---

## Final root layout

```
server1/
├── .devcontainer/
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── README.md
├── package.json
├── package-lock.json
├── tsconfig.json
├── prisma/
├── src/              ← all application code + templates + models
├── tests/
├── uploads/          ← runtime (gitignored contents)
├── output/           ← runtime (gitignored contents)
└── portfolio/        ← untouched
```
