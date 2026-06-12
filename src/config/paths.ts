import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const srcRoot = path.resolve(__dirname, '..');

export const paths = {
  root,
  src: srcRoot,
  upload: path.join(root, 'uploads'),
  templates: path.join(srcRoot, 'templates'),
  models: path.join(srcRoot, 'models'),
  output: path.join(root, 'output', 'document-extraction'),
};
