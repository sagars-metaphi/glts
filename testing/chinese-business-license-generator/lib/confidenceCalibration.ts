import type { DocumentComparison } from './compare.js';

export interface ConfidenceBucket {
  min: number;
  max: number;
  label: string;
  predicted: number;
  correct: number;
  businessCorrect: number;
  extractionCorrect: number;
  actualAccuracy: number;
  businessAccuracy: number;
  extractionAccuracy: number;
}

export interface ConfidenceCalibrationReport {
  buckets: ConfidenceBucket[];
  wellCalibrated: boolean;
  highConfidenceBusinessAccuracy: number | null;
  highConfidenceExtractionAccuracy: number | null;
  notes: string[];
}

const BUCKET_BOUNDS: Array<[number, number]> = [
  [0.0, 0.5],
  [0.5, 0.7],
  [0.7, 0.8],
  [0.8, 0.9],
  [0.9, 1.01],
];

export function buildConfidenceCalibration(comparisons: DocumentComparison[]): ConfidenceCalibrationReport {
  const buckets: ConfidenceBucket[] = BUCKET_BOUNDS.map(([min, max]) => ({
    min,
    max,
    label: `${min.toFixed(1)}-${max >= 1 ? '1.0' : max.toFixed(1)}`,
    predicted: 0,
    correct: 0,
    businessCorrect: 0,
    extractionCorrect: 0,
    actualAccuracy: 0,
    businessAccuracy: 0,
    extractionAccuracy: 0,
  }));

  for (const doc of comparisons) {
    for (const f of doc.fields) {
      const bucket = buckets.find((b) => f.confidence >= b.min && f.confidence < b.max);
      if (!bucket) continue;
      bucket.predicted += 1;
      if (f.businessMatch) {
        bucket.correct += 1;
        bucket.businessCorrect += 1;
      }
      if (f.extractionMatch) bucket.extractionCorrect += 1;
    }
  }

  for (const b of buckets) {
    b.actualAccuracy = b.predicted > 0 ? b.businessCorrect / b.predicted : 0;
    b.businessAccuracy = b.actualAccuracy;
    b.extractionAccuracy = b.predicted > 0 ? b.extractionCorrect / b.predicted : 0;
  }

  const high = buckets.find((b) => b.min >= 0.9);
  const highConfidenceBusinessAccuracy = high && high.predicted > 0 ? high.businessAccuracy : null;
  const highConfidenceExtractionAccuracy = high && high.predicted > 0 ? high.extractionAccuracy : null;

  const wellCalibrated = !high
    || high.predicted < 5
    || (high.businessAccuracy >= 0.98);

  const notes: string[] = [];
  if (high && high.predicted >= 5 && high.businessAccuracy < 0.98) {
    notes.push(
      `confidence>=0.90 bucket business accuracy ${(high.businessAccuracy * 100).toFixed(1)}% is below 98% target`,
    );
  }
  if (high && high.predicted >= 5 && high.extractionAccuracy < 0.98) {
    notes.push(
      `confidence>=0.90 bucket extraction accuracy ${(high.extractionAccuracy * 100).toFixed(1)}% is below 98% target`,
    );
  }

  return {
    buckets,
    wellCalibrated,
    highConfidenceBusinessAccuracy,
    highConfidenceExtractionAccuracy,
    notes,
  };
}
