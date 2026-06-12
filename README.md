# GreenCard Extraction API

Modular backend for passport/visa OCR, document extraction, and template management.

## Quick start

```bash
npm install
npm run dev
```

API: http://localhost:3001  
Swagger: http://localhost:3001/api/docs

## Docker

```bash
docker compose up -d
```

## Tests

```bash
npm run test:all
```

## Structure

```
src/           Application source (single source of truth)
src/templates/ Extraction & render templates
src/models/    OCR-B trained data
prisma/        Database schema
tests/         Unit & integration tests
```
