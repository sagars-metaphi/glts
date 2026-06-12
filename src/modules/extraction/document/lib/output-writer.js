import fs from 'fs/promises';
import path from 'path';

export async function saveExtractionJson(outputDir, baseName, payload) {
  await fs.mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `${baseName}.json`);
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return filePath;
}
