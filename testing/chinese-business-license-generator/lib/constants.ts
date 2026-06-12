export const FIELD_KEYS = [
  'companyName',
  'creditCode',
  'legalRepresentative',
  'companyType',
  'registeredCapital',
  'establishmentDate',
  'businessTerm',
  'address',
  'businessScope',
  'registrationAuthority',
] as const;

export type FieldKey = (typeof FIELD_KEYS)[number];

export const DOCUMENT_STYLES = [
  { id: 'style-a', name: 'clean_modern_scan', degradation: 'none', corruptionLevel: 'none' as const },
  { id: 'style-b', name: 'low_dpi', degradation: 'low_dpi', corruptionLevel: 'low' as const },
  { id: 'style-c', name: 'watermark', degradation: 'watermark', corruptionLevel: 'low' as const },
  { id: 'style-d', name: 'rotated_90', degradation: 'rotate_90', corruptionLevel: 'medium' as const },
  { id: 'style-e', name: 'rotated_180', degradation: 'rotate_180', corruptionLevel: 'medium' as const },
  { id: 'style-f', name: 'stamp_overlap', degradation: 'stamp', corruptionLevel: 'medium' as const },
  { id: 'style-g', name: 'blurred', degradation: 'blur', corruptionLevel: 'high' as const },
  { id: 'style-h', name: 'noise', degradation: 'noise', corruptionLevel: 'high' as const },
  { id: 'style-i', name: 'mixed_chinese_english', degradation: 'mixed_lang', corruptionLevel: 'medium' as const },
  { id: 'style-j', name: 'multi_page_id_card', degradation: 'multi_page', corruptionLevel: 'low' as const },
] as const;

export type CorruptionLevel = 'none' | 'low' | 'medium' | 'high' | 'extreme';

export const PASS_THRESHOLDS = {
  creditCode: 0.99,
  companyName: 0.95,
  legalRepresentative: 0.95,
  overall: 0.92,
} as const;

export const DEFAULT_PER_STYLE = Number(process.env.CBL_GEN_PER_STYLE || 10);
export const FULL_PER_STYLE = 100;
