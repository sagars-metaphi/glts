export interface ExtractorContext {
  templateId?: string;
  mimeType?: string;
  filename?: string;
  saveOutput?: boolean;
}

export interface Extractor {
  readonly type: string;
  extract(file: Buffer, context?: ExtractorContext): Promise<unknown>;
}
