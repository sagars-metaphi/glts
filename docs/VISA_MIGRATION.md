# Visa Extractor Upgrade — Migration Notes

## What changed

`VisaExtractor` upgraded from **MRZ-only** to **OCR + MRZ** production pipeline.

### New module layout

```
src/modules/extraction/visa/
├── VisaData.ts          # VisaData interface + result types
├── VisaRegex.ts         # Labels, dates, ISO country codes
├── VisaOcrExtractor.ts  # OCR label/pattern extraction
├── VisaFieldMapper.ts   # MRZ + OCR → VisaData merge
├── VisaValidators.ts    # Validation helpers
├── VisaConfidence.ts    # Confidence + metrics
├── VisaExtractor.ts     # Main orchestrator (DI: OCRService)
└── VisaTestData.ts      # 50+ synthetic test fixtures
```

## API response (backward compatible)

### Before
```json
{
  "success": true,
  "type": "visa",
  "mrzValid": true,
  "mrzData": { "fields": { ... } },
  "rawText": "..."
}
```

### After (wrapped in `data` by route)
```json
{
  "success": true,
  "data": {
    "type": "visa",
    "mrzValid": true,
    "mrzInvalidReason": null,
    "detectedAsVisa": true,
    "visa": {
      "visaNumber": "...",
      "surname": "...",
      "givenNames": "...",
      "nationality": "IND",
      "passportNumber": "...",
      "confidence": 0.87,
      ...
    },
    "metrics": {
      "fieldExtractionRate": 0.85,
      "ocrConfidence": 0.78,
      "mrzConfidence": 0.95,
      "populatedFields": ["surname", "..."],
      "missingFields": ["employer", "..."]
    },
    "mrzData": { "fields": { ... } },
    "visaParsed": { ... },
    "visaOcrFields": { ... },
    "rawText": "..."
  }
}
```

Legacy fields `mrzData`, `visaParsed`, `visaOcrFields`, `mrzValid`, `rawText` are **preserved**.

## DI change

```ts
// container.ts
this.extractorFactory.register('visa', new VisaExtractor(this.ocr));
```

## Tests

```bash
npm run test:visa          # ICAO MRZ fixtures
npm run test:visa-extract  # OCR + synthetic dataset (50+)
npm run test:all
```

## Field coverage

| Region | Extra fields |
|--------|----------------|
| All | visaNumber, surname, givenNames, nationality, passportNumber, dates, entries, MRZ |
| Schengen | visaCategory, durationOfStay, hostReference, purposeOfTravel |
| US | visaLabelNumber, controlNumber, employer, remarks |
| UK | visaType vignette, placeOfIssue |
| Canada | eTA documentNumber |
| Australia | grantNumber as visaLabelNumber |
| UAE/India | sponsor, employer, personalNumber |

## Breaking changes

None for existing clients using `mrzData.fields` — same shape via `toLegacyMrzFields()`.

New clients should use `data.visa` and `data.metrics`.
