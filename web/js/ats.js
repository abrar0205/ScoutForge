/**
 * ATS export data-quality check. Runs entirely in the browser.
 *
 * Finds: duplicate candidates, missing required fields, non-standard stage and
 * source values (with a suggested mapping), invalid emails, mixed date formats
 * and stale active records. Produces a cleaned export: values are normalised and
 * duplicates are flagged, never deleted, so a human makes the final call.
 */

export const STAGES = ['Identified', 'Contacted', 'Replied', 'Screen', 'Submitted', 'Interview', 'Offer', 'Hired', 'Declined', 'Withdrawn'];
const ACTIVE = new Set(['Identified', 'Contacted', 'Replied', 'Screen', 'Submitted', 'Interview', 'Offer']);
export const SOURCES = ['LinkedIn Recruiter', 'Google X-ray', 'XING', 'Referral', 'Job board', 'Career site', 'Event', 'Agency', 'Other'];

const STAGE_MAP = [
  [/^(identified|sourced|new|lead|neu|prospect)$/i, 'Identified'],
  [/^(contacted|reached out|inmail sent|messaged|angeschrieben|kontaktiert)$/i, 'Contacted'],
  [/^(replied|responded|answered|interested|geantwortet|antwort)$/i, 'Replied'],
  [/^(screen|screening|phone screen|phone screening|recruiter screen|telefoninterview|vorauswahl)$/i, 'Screen'],
  [/^(submitted|presented|sent to hm|shortlisted|vorgeschlagen)$/i, 'Submitted'],
  [/^(interview|interviewing|onsite|hm interview|vorstellungsgespräch)$/i, 'Interview'],
  [/^(offer|offer extended|angebot)$/i, 'Offer'],
  [/^(hired|accepted|started|eingestellt)$/i, 'Hired'],
  [/^(declined|rejected|not suitable|abgesagt|absage)$/i, 'Declined'],
  [/^(withdrawn|withdrew|zurückgezogen)$/i, 'Withdrawn'],
];
const SOURCE_MAP = [
  [/^(linkedin|linked in|li|linkedin recruiter|lir|inmail)$/i, 'LinkedIn Recruiter'],
  [/^(x-?ray|google|google x-?ray)$/i, 'Google X-ray'],
  [/^(xing|xing talentmanager)$/i, 'XING'],
  [/^(referral|employee referral|empfehlung)$/i, 'Referral'],
  [/^(indeed|stepstone|job ?board|jobbörse|arbeitsagentur|ba)$/i, 'Job board'],
  [/^(career ?site|careers page|website|karriereseite)$/i, 'Career site'],
  [/^(event|job fair|messe|career fair)$/i, 'Event'],
  [/^(agency|agentur|headhunter)$/i, 'Agency'],
];
export const normStage = (v) => STAGES.find((s) => s.toLowerCase() === String(v).trim().toLowerCase()) || (STAGE_MAP.find(([re]) => re.test(String(v).trim())) || [])[1] || null;
export const normSource = (v) => SOURCES.find((s) => s.toLowerCase() === String(v).trim().toLowerCase()) || (SOURCE_MAP.find(([re]) => re.test(String(v).trim())) || [])[1] || null;

/** Accepts YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY; returns ISO date or null. */
export function normDate(v) {
  const t = String(v ?? '').trim();
  let m;
  if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return iso(+m[1], +m[2], +m[3]);
  if ((m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/))) return iso(+m[3], +m[2], +m[1]);
  return null;
}
function iso(y, mo, d) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const key = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9@.]/g, '');

/** Map arbitrary header names onto the fields we check. */
const FIELD_ALIASES = {
  id: ['candidate_id', 'id', 'candidate id', 'kandidaten-id'],
  name: ['name', 'full name', 'candidate', 'candidate name'],
  email: ['email', 'e-mail', 'mail'],
  phone: ['phone', 'telefon', 'mobile'],
  role: ['role', 'requisition', 'job', 'position', 'req'],
  source: ['source', 'channel', 'quelle'],
  stage: ['stage', 'status', 'step'],
  owner: ['owner', 'recruiter', 'sourcer'],
  lastActivity: ['last_activity', 'last activity', 'updated', 'last contact', 'letzte aktivität'],
};
export function mapFields(headers) {
  const m = {};
  for (const [field, names] of Object.entries(FIELD_ALIASES)) {
    m[field] = headers.find((h) => names.includes(h.trim().toLowerCase())) || null;
  }
  return m;
}

export function checkAts(records, headers, { today = new Date().toISOString().slice(0, 10), staleDays = 21 } = {}) {
  const f = mapFields(headers);
  const issues = [];
  const add = (row, field, problem, fix = '') => issues.push({ row: row + 2, field, problem, fix });
  const cleaned = records.map((r) => ({ ...r }));
  const seenEmail = new Map(), seenName = new Map();
  const dateFormats = new Set();

  records.forEach((r, i) => {
    const c = cleaned[i];
    for (const req of ['role', 'stage', 'source', 'owner']) {
      if (!f[req]) continue;
      if (!String(r[f[req]] || '').trim()) add(i, f[req], 'Missing value', 'Fill in before the weekly report');
    }
    if (f.stage && r[f.stage]) {
      const n = normStage(r[f.stage]);
      if (!n) add(i, f.stage, `Unknown stage "${r[f.stage]}"`, `Use one of: ${STAGES.join(', ')}`);
      else if (n !== r[f.stage]) { add(i, f.stage, `Non-standard stage "${r[f.stage]}"`, `→ ${n}`); c[f.stage] = n; }
    }
    if (f.source && r[f.source]) {
      const n = normSource(r[f.source]);
      if (!n) add(i, f.source, `Unknown source "${r[f.source]}"`, 'Map to a standard channel');
      else if (n !== r[f.source]) { add(i, f.source, `Inconsistent source "${r[f.source]}"`, `→ ${n}`); c[f.source] = n; }
    }
    if (f.email && r[f.email]) {
      const e = r[f.email].trim();
      if (!EMAIL.test(e)) add(i, f.email, 'Invalid email format', 'Check the address');
      else if (e !== e.toLowerCase()) c[f.email] = e.toLowerCase();
      const k = key(e);
      if (seenEmail.has(k)) add(i, f.email, `Duplicate of row ${seenEmail.get(k) + 2} (same email)`, 'Merge records');
      else seenEmail.set(k, i);
    }
    if (f.name && r[f.name]) {
      const k = key(r[f.name]) + '|' + (f.phone ? key(r[f.phone]).replace(/\D/g, '').slice(-8) : '');
      if (k.split('|')[1] && seenName.has(k)) add(i, f.name, `Possible duplicate of row ${seenName.get(k) + 2} (same name and phone)`, 'Check and merge');
      else seenName.set(k, i);
    }
    if (f.lastActivity && r[f.lastActivity]) {
      const raw = r[f.lastActivity];
      const d = normDate(raw);
      dateFormats.add(/^\d{4}-/.test(raw) ? 'ISO' : /\./.test(raw) ? 'DE' : /\//.test(raw) ? 'slash' : 'other');
      if (!d) add(i, f.lastActivity, `Unreadable date "${raw}"`, 'Use YYYY-MM-DD');
      else {
        if (d !== raw) c[f.lastActivity] = d;
        const stage = normStage(r[f.stage] || '');
        const age = Math.round((Date.parse(today) - Date.parse(d)) / 86400000);
        if (stage && ACTIVE.has(stage) && age > staleDays) add(i, f.lastActivity, `No activity for ${age} days while "${stage}"`, 'Follow up or close the record');
      }
    }
  });
  if (dateFormats.size > 1) issues.push({ row: '—', field: f.lastActivity, problem: `Mixed date formats (${[...dateFormats].join(', ')})`, fix: 'Converted to YYYY-MM-DD in the cleaned file' });

  const rowsWithIssues = new Set(issues.filter((x) => typeof x.row === 'number').map((x) => x.row)).size;
  const byType = {};
  for (const it of issues) {
    const t = it.problem.replace(/".*"/, '…').replace(/row \d+/, 'row …').replace(/\d+ days/, 'N days');
    byType[t] = (byType[t] || 0) + 1;
  }
  const dupRows = new Set(issues.filter((x) => /Duplicate|duplicate/.test(x.problem)).map((x) => x.row));
  const outHeaders = [...headers, 'dq_flag'];
  cleaned.forEach((c, i) => { c.dq_flag = dupRows.has(i + 2) ? 'possible duplicate' : ''; });
  return {
    fields: f, issues, byType,
    health: records.length ? Math.round(100 * (1 - rowsWithIssues / records.length)) : 100,
    rows: records.length, rowsWithIssues, cleaned, outHeaders,
  };
}

/** Clearly fictional sample with deliberate problems, for the demo button. */
export const SAMPLE_ATS_CSV = `candidate_id,name,email,phone,role,source,stage,owner,last_activity
C-001,Test Kandidat A,kandidat.a@example.com,+49 151 0000001,Maintenance Technician,LinkedIn,Contacted,AM,2026-11-02
C-011,Test Kandidat J,kandidat.j@example.com,+49 151 0000011,Maintenance Technician,LinkedIn Recruiter,Screen,AM,2026-11-18
C-012,Test Kandidat K,kandidat.k@example.com,+49 151 0000012,PLC Engineer,XING,Replied,JS,2026-11-17
C-013,Test Kandidat L,kandidat.l@example.com,+49 151 0000013,Quality Engineer,Referral,Interview,JS,2026-11-16
C-014,Test Kandidat M,kandidat.m@example.com,+49 151 0000014,Logistics Associate,Job board,Hired,AM,2026-11-12
C-002,Test Kandidat B,kandidat.b@example.com,+49 151 0000002,Maintenance Technician,linkedin recruiter,phone screen,AM,14.11.2026
C-003,Test Kandidat C,KANDIDAT.C@EXAMPLE.COM,+49 151 0000003,PLC Engineer,xray,Replied,,2026-11-18
C-004,Test Kandidat A,kandidat.a@example.com,+49 151 0000001,Maintenance Technician,Referral,Identified,AM,2026-11-19
C-005,Test Kandidat D,kandidat.d@example,+49 151 0000005,PLC Engineer,Indeed,Interview,JS,2026-10-01
C-006,Test Kandidat E,kandidat.e@example.com,+49 151 0000006,Quality Engineer,XING,Shortlisted,JS,20/11/2026
C-007,Test Kandidat F,kandidat.f@example.com,+49 151 0000007,,LinkedIn Recruiter,Contacted,JS,2026-11-20
C-008,Test Kandidat G,kandidat.g@example.com,+49 151 0000008,Quality Engineer,Messe,Hired,AM,2026-11-10
C-009,Test Kandidat H,kandidat.h@example.com,+49 151 0000009,PLC Engineer,Google,On hold,AM,2026-11-12
C-010,Test Kandidat I,kandidat.i@example.com,+49 151 0000010,Logistics Associate,Arbeitsagentur,Declined,JS,2026-11-15
`;
