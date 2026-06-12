export type BlurPassId = 'pass1' | 'pass2' | 'pass3' | 'pass4';

export interface OcrBlurMeta {
  passWinner: BlurPassId;
  ocrConfidence: number;
  passScores: Record<BlurPassId, number>;
  recoveredFieldSignals: number;
}

export interface VisaPageOcrResult {
  text: string;
  meta: OcrBlurMeta;
}
