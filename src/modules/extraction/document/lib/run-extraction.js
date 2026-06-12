import path from 'path';
import { extractTextFromBuffer, normalizeText } from './document-parser.js';
import { extractFields } from './rule-engine.js';
import {
  extractSections,
  parseLabeledLines,
  parseCandidateTable,
  parseAuthorizedPerson,
  parseBodyNarrative,
  parseFromSection,
} from './section-extractor.js';
import { validateRequired } from './validator.js';
import { saveExtractionJson } from './output-writer.js';

export async function runDocumentExtraction({ buffer, filename, mimeType, template, outputDir, saveOutput = true }) {
  const { text, source, ocrUsed } = await extractTextFromBuffer(buffer, filename, mimeType);
  const normalizedText = normalizeText(text);
  const sectionTexts = template.sections
    ? extractSections(normalizedText, template.sections)
    : null;
  const fieldDetails = extractFields(normalizedText, template, sectionTexts);
  const isSectionTemplate = Boolean(template.sections);

  const sections = isSectionTemplate
    ? buildSectionPayload(sectionTexts, fieldDetails, template)
    : undefined;

  const authorizedPersonName = parseAuthorizedPerson(normalizedText);
  if (authorizedPersonName) {
    fieldDetails.authorizedPersonName = {
      field: 'authorizedPersonName',
      value: authorizedPersonName,
      confidence: 0.88,
      matchedLabel: 'Authorise person name',
      method: 'section_parse',
    };
    if (sections?.agentDetails) {
      sections.agentDetails.fields.authorizedPersonName = authorizedPersonName;
      if (sections.agentDetails.parsed) {
        sections.agentDetails.parsed.authorizedPersonName = authorizedPersonName;
      }
    }
  }

  const validation = validateRequired(template, fieldDetails);
  const payload = {
    success: true,
    templateId: template.id,
    extractedAt: new Date().toISOString(),
    textSource: source,
    ocrUsed,
    validation,
    ...(isSectionTemplate ? { sections } : { fields: buildFlatFields(fieldDetails, template) }),
    rawTextLength: normalizedText.length,
  };

  if (saveOutput && outputDir) {
    const base = path.basename(filename, path.extname(filename));
    payload.outputPath = await saveExtractionJson(outputDir, `${base}-${template.id}`, payload);
  }

  return payload;
}

function buildFlatFields(fieldDetails, template) {
  const fields = {};
  for (const key of Object.keys(template.fields || {})) {
    fields[key] = fieldDetails[key]?.value ?? null;
  }
  if (fieldDetails.authorizedPersonName?.value && fields.authorizedPersonName == null) {
    fields.authorizedPersonName = fieldDetails.authorizedPersonName.value;
  }
  return fields;
}

function buildSectionPayload(sectionTexts, fieldDetails, template) {
  const out = {};

  for (const [name, bounds] of Object.entries(sectionTexts)) {
    const sectionFieldNames = Object.entries(template.fields || {})
      .filter(([, def]) => def.section === name)
      .map(([key]) => key);

    const sectionFields = {};
    for (const key of sectionFieldNames) {
      sectionFields[key] = fieldDetails[key]?.value ?? null;
    }

    const parsed =
      name === 'candidateDetails'
        ? parseCandidateTable(bounds.text)
        : name === 'body'
          ? parseBodyNarrative(bounds.text)
          : name === 'agentDetails'
            ? parseLabeledLines(bounds.text)
            : name === 'from'
              ? parseFromSection(bounds.text)
              : null;

    if (parsed) {
      for (const [key, val] of Object.entries(parsed)) {
        if (val == null || val === '') continue;
        sectionFields[key] = val;
        fieldDetails[key] = {
          field: key,
          value: val,
          confidence: 0.85,
          matchedLabel: name,
          method: 'section_parse',
        };
      }
    }

    out[name] = {
      text: bounds.text,
      fields: sectionFields,
      ...(parsed ? { parsed } : {}),
    };
  }

  return out;
}
