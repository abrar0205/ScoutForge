/**
 * Role analysis: turns a job description into explainable sourcing signals.
 *
 * Principles
 *  - Evidence only: every skill comes with the sentence and phrase that triggered it.
 *  - Precision over recall: generic words never become search terms. ESCO concepts
 *    are only matched as full multi-word phrases and are offered as optional extras.
 *  - Must-have vs nice-to-have comes from the wording and section headings.
 */
import { SKILLS, TITLE_FAMILIES, LANGUAGES, NICE_TO_HAVE_CUES } from './vocab.js';

export const normalize = (s) => String(s ?? '').normalize('NFKC').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
const lower = (s) => normalize(s).toLowerCase();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Word boundary that also works for terms such as "C++", "C#", ".NET", "s7-1500" and German umlauts.
const B_LEFT = '(?<![\\p{L}\\p{N}+#])';
const B_RIGHT = '(?![\\p{L}\\p{N}+#])';
const reCache = new Map();
export function phraseRegex(phrase, caseSensitive = false) {
  const key = (caseSensitive ? 'S:' : 'I:') + phrase;
  if (!reCache.has(key)) {
    const body = escapeRe(normalize(phrase)).replace(/\\? /g, '[\\s-]+');
    reCache.set(key, new RegExp(B_LEFT + body + B_RIGHT, caseSensitive ? 'u' : 'iu'));
  }
  return reCache.get(key);
}
export const containsPhrase = (text, phrase, caseSensitive = false) => phraseRegex(phrase, caseSensitive).test(normalize(text));

const HEADING_MUST = /^(requirements|what you('|’)ll bring|what you bring|your profile|qualifications|basic qualifications|minimum qualifications|must[- ]haves?|you have|we expect|ihr profil|dein profil|anforderungen|das bringst du mit|das bringen sie mit|wymagania)\b/i;
const HEADING_NICE = /^(nice[- ]to[- ]haves?|preferred( qualifications)?|bonus( points)?|it('|’)s a plus|plus points|desirable|optional|von vorteil|wünschenswert|mile widziane)\b/i;
const HEADING_DUTIES = /^(what you('|’)ll do|what to expect|responsibilities|your tasks|tasks|the role|about the role|ihre aufgaben|deine aufgaben|aufgaben|obowiązki)\b/i;
const HEADING_OTHER = /^(about us|who we are|benefits|what we offer|why join|our offer|wir bieten|das bieten wir|oferujemy|location|equal opportunity)\b/i;

/** Split a JD into sentences, keeping the section each sentence belongs to. */
export function sentences(jd) {
  const out = [];
  let section = 'body';
  for (const rawLine of String(jd ?? '').split(/\r?\n/)) {
    const line = normalize(rawLine.replace(/^[\s\-*•·●▪◦–\d.)]+/, ''));
    if (!line) continue;
    const headingText = line.replace(/[:：]$/, '');
    const looksHeading = /[:：]$/.test(line) || headingText.split(' ').length <= 5;
    if (looksHeading) {
      if (HEADING_NICE.test(headingText)) { section = 'nice'; continue; }
      if (HEADING_MUST.test(headingText)) { section = 'must'; continue; }
      if (HEADING_DUTIES.test(headingText)) { section = 'duties'; continue; }
      if (HEADING_OTHER.test(headingText)) { section = 'other'; continue; }
    }
    for (const part of line.split(/(?<=[.!?;])\s+(?=[A-ZÄÖÜ])/)) {
      if (part.trim()) out.push({ text: part.trim(), section });
    }
  }
  return out;
}

const isNice = (s) => s.section === 'nice' || NICE_TO_HAVE_CUES.test(s.text);

/** Titles: explicit field wins; otherwise a short first line that reads like a title. */
export function detectTitle(jd, explicit = '') {
  if (normalize(explicit)) return normalize(explicit).slice(0, 90);
  const first = normalize(String(jd ?? '').split(/\r?\n/).find((l) => normalize(l)) || '');
  if (!first || first.length > 80 || /[.!?]$/.test(first) || first.split(' ').length > 9) return '';
  if (/^(about|we |our |who |what |join |at |the |are you|looking)/i.test(first)) return '';
  return first.replace(/^(job title|role|position|stelle|stanowisko)\s*[:\-]\s*/i, '').replace(/\s*\((m\/w\/d|m\/f\/d|w\/m\/d|f\/m\/d|all genders|k\/m)\)/gi, '').trim();
}

export function detectFamily(title, jd) {
  const t = lower(title);
  let best = null;
  for (const fam of TITLE_FAMILIES) {
    for (const m of fam.match) {
      if (t && containsPhrase(t, m)) {
        const score = 100 + m.length;
        if (!best || score > best.score) best = { fam, score, via: 'title' };
      }
    }
  }
  if (best) return best;
  // Fall back to the first two sentences of the JD ("We are hiring a maintenance technician...").
  const head = sentences(jd).slice(0, 2).map((s) => s.text).join(' ');
  for (const fam of TITLE_FAMILIES) {
    for (const m of fam.match) {
      if (m.split(' ').length >= 2 && containsPhrase(head, m)) {
        const score = m.length;
        if (!best || score > best.score) best = { fam, score, via: 'description' };
      }
    }
  }
  return best;
}

function findSkill(skill, sents) {
  const evidence = [];
  for (const s of sents) {
    let match = null;
    for (const p of skill.detect) if (containsPhrase(s.text, p)) { match = p; break; }
    if (!match) for (const p of skill.exact) if (containsPhrase(s.text, p, true)) { match = p; break; }
    if (match) evidence.push({ sentence: s.text, match, nice: isNice(s), section: s.section });
  }
  return evidence;
}

// Categories that describe working conditions or industry: useful context, poor keywords.
const CONTEXT_ONLY = new Set(['shift-work', 'automotive', 'sustainability']);
// Domain-level skills: valid, but weaker keywords than specific tools, so they rank lower.
const BROAD = new Set(['industrial-automation', 'robotics', 'electrical', 'schematics', 'data-analysis', 'supply-chain', 'process-engineering', 'quality-assurance', 'quality-control', 'troubleshooting', 'active-sourcing', 'mechanical-maintenance', 'preventive-maintenance', 'sap', 'excel']);
// Vocational qualifications are already covered by job-title variants, so they are not
// pre-selected as required keywords (people often omit them from profiles).
const CAT_WEIGHT = { Automation: 6, Robotics: 6, Qualification: 6, Electrical: 5, Mechanical: 5, Quality: 5, 'Software & data': 5, AI: 5, Recruiting: 5, Logistics: 4, Maintenance: 4, Manufacturing: 3, 'Business tools': 4, EHS: 4 };

/**
 * Optional ESCO matching. Only full multi-word labels/aliases of at least 10
 * characters count, and they never override the curated vocabulary.
 */
export function escoMatches(jd, escoIndex, taken = new Set()) {
  if (!escoIndex?.skills?.length) return [];
  const text = normalize(jd);
  const low = text.toLowerCase();
  const out = [];
  for (const [id, name, ...aliases] of escoIndex.skills) {
    for (const phrase of [name, ...aliases]) {
      if (phrase.length < 10 || phrase.split(' ').length < 2) continue;
      if (!low.includes(phrase.split(' ')[0])) continue; // cheap pre-filter
      if (containsPhrase(text, phrase)) {
        if (!taken.has(name.toLowerCase())) out.push({ id: 'esco:' + id, name, match: phrase });
        break;
      }
    }
    if (out.length >= 12) break;
  }
  return out;
}

export function analyzeRole(jd, { title = '', escoIndex = null } = {}) {
  const text = String(jd ?? '');
  const sents = sentences(text);
  const roleTitle = detectTitle(text, title);
  const familyHit = detectFamily(roleTitle, text);
  const fam = familyHit?.fam || null;

  const skills = [];
  for (const sk of SKILLS) {
    const ev = findSkill(sk, sents);
    if (!ev.length) continue;
    const must = ev.some((e) => !e.nice);
    skills.push({
      id: sk.id, name: sk.name, cat: sk.cat, source: 'vocab', search: sk.search,
      priority: must ? 'must' : 'nice', contextOnly: CONTEXT_ONLY.has(sk.id), broad: BROAD.has(sk.id),
      count: ev.length, evidence: ev.slice(0, 3),
    });
  }
  // Rank: must-haves first, then specific tools (category weight), then frequency.
  skills.sort((a, b) =>
    (a.contextOnly - b.contextOnly) ||
    ((b.priority === 'must') - (a.priority === 'must')) ||
    (a.broad - b.broad) ||
    ((CAT_WEIGHT[b.cat] || 1) - (CAT_WEIGHT[a.cat] || 1)) ||
    (b.count - a.count) || a.name.localeCompare(b.name));
  // Default selection: up to five specific must-have tools; broad domains only fill up to three.
  for (const s of skills) s.selected = false;
  const eligible = skills.filter((s) => !s.contextOnly && s.cat !== 'Qualification');
  let picked = 0;
  for (const s of eligible) if (s.priority === 'must' && !s.broad && picked < 5) { s.selected = true; picked++; }
  for (const s of eligible) if (picked < 3 && s.priority === 'must' && !s.selected) { s.selected = true; picked++; }
  if (!picked) for (const s of eligible.slice(0, 3)) s.selected = true;

  const taken = new Set(skills.flatMap((s) => [s.name.toLowerCase(), ...Object.values(s.search).flat().map((x) => x.toLowerCase())]));
  const esco = escoMatches(text, escoIndex, taken).map((e) => ({ ...e, source: 'esco', selected: false }));

  const languages = LANGUAGES.filter((l) => l.detect.some((p) => sents.some((s) => containsPhrase(s.text, p))))
    .map((l) => ({ ...l, nice: sents.filter((s) => l.detect.some((p) => containsPhrase(s.text, p))).every(isNice) }));

  const years = (text.match(/(\d{1,2})\s*\+?\s*(?:years|yrs|jahre|lat)/i) || [])[1];
  const seniority = /\b(senior|lead|principal|staff)\b/i.test(roleTitle) ? 'senior'
    : /\b(junior|graduate|entry[- ]level|berufseinsteiger)\b/i.test(roleTitle + ' ' + text.slice(0, 400)) ? 'junior'
      : fam?.id === 'intern' ? 'student' : 'any';

  const titles = fam ? structuredClone(fam.titles) : { en: [], de: [], pl: [] };
  const shortTitle = roleTitle.replace(/\s+[-–|,(].*$/, '').trim();
  if (shortTitle && shortTitle.split(' ').length <= 6 && ![...titles.en, ...titles.de].some((t) => t.toLowerCase() === shortTitle.toLowerCase())) {
    (/[äöüß]|ingenieur|techniker|programmierer|mitarbeiter|leiter/i.test(shortTitle) ? titles.de : titles.en).unshift(shortTitle);
  }

  const warnings = [];
  if (!text.trim()) warnings.push('Paste a job description or a few skills to start.');
  else if (!skills.length) warnings.push('No known skills or tools were found. Add search terms manually; ScoutForge will not guess.');
  if (!fam) warnings.push('Job family not recognised, so only the title you entered is used. Add alternative titles below.');

  return {
    title: roleTitle || (fam ? fam.titles.en[0] : 'Untitled role'),
    shortTitle: shortTitle || (fam ? fam.titles.en[0] : 'this role'),
    family: fam ? { id: fam.id, via: familyHit.via } : null,
    titles, skills, esco, languages, years: years ? Number(years) : null, seniority,
    wordCount: (text.match(/\S+/g) || []).length, warnings,
  };
}

/** Text-only role input such as "PLC, TIA Portal" should still work. */
export function looksLikeSkillList(jd) {
  const t = normalize(jd);
  return t.length > 0 && t.length < 120 && !/[.!?]/.test(t);
}
