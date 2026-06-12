/**
 * Extract bounded document sections by start/end anchor patterns.
 * @param {string} text
 * @param {Record<string, { start: string, end?: string|null, flags?: string }>} sections
 */
export function extractSections(text, sections = {}) {
  const normalized = String(text || '');
  const out = {};

  for (const [name, def] of Object.entries(sections)) {
    const flags = def.flags || 'i';
    const startRe = new RegExp(def.start, flags);
    const startMatch = normalized.match(startRe);
    if (!startMatch || startMatch.index == null) {
      out[name] = { text: null, startIndex: null, endIndex: null };
      continue;
    }

    const contentStart = startMatch.index + startMatch[0].length;
    let contentEnd = normalized.length;

    if (def.end) {
      const endRe = new RegExp(def.end, flags);
      const slice = normalized.slice(contentStart);
      const endMatch = slice.match(endRe);
      if (endMatch && endMatch.index != null) {
        contentEnd = contentStart + endMatch.index;
      }
    }

    const sectionText = normalized.slice(contentStart, contentEnd).trim();
    out[name] = {
      text: sectionText || null,
      startIndex: contentStart,
      endIndex: contentEnd,
    };
  }

  return out;
}

/** Parse key:value lines common in agent / signatory blocks */
export function parseLabeledLines(sectionText) {
  const result = {};
  if (!sectionText) return result;

  const text = sectionText.replace(/\s+/g, ' ').trim();

  const inlinePatterns = [
    {
      key: 'chinaAgentName',
      re: /Name\s*[:：]\s*(.+?)(?=\s+Address\s*[:：]|$)/i,
    },
    {
      key: 'chinaAgentAddress',
      re: /Address\s*[:：]\s*(.+?)(?=\s+Contact\s*no|$)/i,
    },
    {
      key: 'chinaAgentContact',
      re: /Contact\s*no\.?\s*[:：]\s*(.+?)(?=\s+Authori[sz]e|$)/i,
    },
    {
      key: 'signatoryName',
      re: /\bMr\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)(?=Designation|Contact|$)/i,
    },
    {
      key: 'signatoryDesignation',
      re: /Designation\s*[:：]\s*(.+?)(?=\s+Contact\s*no|$)/i,
    },
    {
      key: 'signatoryContact',
      re: /Contact\s*no\.?\s*[:：]\s*(.+?)(?=\s+Company\s+stamp|$)/i,
    },
    {
      key: 'companyStamp',
      re: /Company\s+stamp\s*[:：]\s*(.+)$/i,
    },
  ];

  for (const { key, re } of inlinePatterns) {
    const m = text.match(re);
    if (m?.[1]) result[key] = m[1].trim();
  }

  return result;
}

/** Parse vessel / visa request paragraph */
export function parseBodyNarrative(sectionText) {
  const text = String(sectionText || '').replace(/\s+/g, ' ').trim();
  const result = {};
  if (!text) return result;

  const port = text.match(/join\s+(?:the\s+)?vessel\s+at\s+(.+?)\s+on\s+/i);
  if (port?.[1]) result.joinPortChina = port[1].trim();

  const joinDate = text.match(/\bon\s+(\d{1,2}\s+[A-Z]+\s+\d{4})\b/i);
  if (joinDate?.[1]) result.joiningDate = joinDate[1].trim();

  const vessel = text.match(/\bM\.V\.\s+([^,]+)/i);
  if (vessel?.[1]) result.vesselName = vessel[1].trim();

  const flag = text.match(/,\s*([A-Za-z\s]+)\s+Flag/i);
  if (flag?.[1]) result.vesselFlag = `${flag[1].trim()} Flag`;

  const imo = text.match(/IMO\s*No\.?\s*(\d{7})/i);
  if (imo?.[1]) result.imoNumber = imo[1];

  const principal = text.match(/Principal,\s*(.+?)(?:\.|We\s+request)/i);
  if (principal?.[1]) result.principalCompany = principal[1].trim();

  const validity = text.match(/(\d+\s+Months?\s+validity)/i);
  if (validity?.[1]) result.visaValidityMonths = validity[1].trim();

  const entries = text.match(/\b(Single\s+Entry)\b/i);
  if (entries?.[1]) result.entriesRequested = entries[1].trim();

  const stay = text.match(/stay\s+of\s+(\d+\s+days?)/i);
  if (stay?.[1]) result.stayDays = stay[1].trim();

  if (/G["\u201c]?\s*Type\s+visa/i.test(text)) result.visaType = 'G Type Visa';

  return result;
}

/** Parse signatory block after Yours sincerely */
export function parseFromSection(sectionText) {
  const text = String(sectionText || '').replace(/\s+/g, ' ').trim();
  const result = {};
  if (!text) return result;

  const signatory = text.match(/Mr\.?\s+([A-Z][a-z]+)(?:\s+([A-Z][a-z]+))?\s*Designation/i);
  if (signatory?.[1]) {
    result.signatoryName = [signatory[1], signatory[2]].filter(Boolean).join(' ').trim();
  }

  const designation = text.match(/Designation\s*[:：]\s*(.+?)Contact\s*no/i);
  if (designation?.[1]) result.signatoryDesignation = designation[1].trim();

  const contact = text.match(/Contact\s*no\.?\s*[:：]\s*([+\d\s]+?)(?=Company\s+stamp)/i);
  if (contact?.[1]) result.signatoryContact = contact[1].trim();

  const stamp = text.match(/Company\s+stamp\s*[:：]\s*(.+)$/i);
  if (stamp?.[1]) result.companyStamp = stamp[1].trim();

  return result;
}

/** Text between Authorise person and Yours sincerely / repatriation clause */
export function parseAuthorizedPerson(fullText) {
  const text = String(fullText || '').replace(/\s+/g, ' ').trim();
  const m = text.match(
    /Authori[sz]e\s+person\s+name\s*[–\-:]\s*Designation\s*[:：]?\s*(.+?)(?=\s+If\s+the\s+visa\s+is\s+being\s+granted|Thanking\s+you|Yours\s+sincerely)/i,
  );
  return m?.[1]?.trim() || null;
}

const CANDIDATE_TABLE_MARKERS = [
  { field: 'surnameName', re: /SURNAME\s*\/\s*NAME\s*/i, next: /DESIGNATION/i },
  { field: 'designation', re: /DESIGNATION\s*/i, next: /NATIONALITY/i },
  { field: 'nationality', re: /NATIONALITY\s*[:：]?\s*/i, next: /BIRTHDATE/i },
  { field: 'birthPlace', re: /BIRTHDATE\s*\/\s*PLACE\s*[:：]?\s*/i, next: /PASSPORT\s*NO/i },
  { field: 'passportNumber', re: /PASSPORT\s*NO\s*[:：]?\s*/i, next: /PASSPORT\s*ISS/i },
  {
    field: 'passportIssueDate',
    re: /PASSPORT\s*ISS\s*\/\s*EXP\s*[:：]?\s*/i,
    next: /Please\s+be\s+advised/i,
  },
];

/**
 * Parse candidate table when labels and values are concatenated on one line (common in docx).
 * @param {string} sectionText
 */
export function parseCandidateTable(sectionText) {
  const text = String(sectionText || '').replace(/\s+/g, ' ').trim();
  const result = {};
  if (!text) return result;

  for (let i = 0; i < CANDIDATE_TABLE_MARKERS.length; i += 1) {
    const { field, re, next } = CANDIDATE_TABLE_MARKERS[i];
    const start = text.match(re);
    if (!start || start.index == null) continue;

    const valueStart = start.index + start[0].length;
    const rest = text.slice(valueStart);
    const endMatch = rest.match(next);
    const raw = (endMatch ? rest.slice(0, endMatch.index) : rest).trim();
    if (!raw) continue;

    if (field === 'passportIssueDate') {
      const dates = raw.match(/(\d{1,2}\s+[A-Z]+\s+\d{4}|\d{4}[\/\-]\d{2}[\/\-]\d{2})/gi);
      if (dates?.[0]) result.passportIssueDate = dates[0].trim();
      if (dates?.[1]) result.passportExpiryDate = dates[1].trim();
      if (!dates && raw.includes('/')) {
        const parts = raw.split(/\s*\/\s*/);
        if (parts[0]) result.passportIssueDate = parts[0].trim();
        if (parts[1]) result.passportExpiryDate = parts[1].trim();
      }
    } else if (field === 'birthPlace') {
      result.birthPlace = raw;
      const dob = raw.match(/(\d{1,2}\s+[A-Z]+\s+\d{4})/i);
      if (dob?.[1]) result.birthDate = dob[1].trim();
    } else {
      result[field] = raw;
    }
  }

  return result;
}
