export function validateRequired(template, fields) {
  const required = [
    ...(template.required || []),
    ...Object.entries(template.fields || {}).filter(([, def]) => def.required).map(([name]) => name),
  ];

  const unique = [...new Set(required)];
  const missing = [];
  const present = [];

  for (const name of unique) {
    const entry = fields[name];
    const value = entry?.value ?? entry;
    if (value == null || String(value).trim() === '') missing.push(name);
    else present.push(name);
  }

  return { valid: missing.length === 0, missing, present, required: unique };
}
