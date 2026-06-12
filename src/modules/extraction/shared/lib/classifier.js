export function classifyDocumentFromMRZ(mrzData, rawText = '') {
  if (mrzData?.documentType === 'P') return { type: 'PASSPORT', confidence: 0.98, method: 'mrz' };
  if (mrzData?.documentType === 'I') return { type: 'ID_CARD', confidence: 0.95, method: 'mrz' };
  if (mrzData?.documentType === 'V') return { type: 'VISA', confidence: 0.95, method: 'mrz' };
  if (rawText?.toUpperCase().includes('PASSPORT')) return { type: 'PASSPORT', confidence: 0.75, method: 'keyword' };
  return { type: 'UNKNOWN', confidence: 0.30, method: 'none' };
}
