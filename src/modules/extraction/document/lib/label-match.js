/**
 * Build case-insensitive regex for a label and its aliases.
 */
export function labelRegex(labels) {
  const escaped = labels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(${escaped.join('|')})`, 'i');
}
