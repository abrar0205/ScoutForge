/**
 * Platform-aware Boolean strings.
 *
 * LinkedIn Recruiter: separate "Job title" and "Keywords" fields; AND / OR / NOT in
 *   capitals, quotes for phrases, parentheses for grouping, no wildcards.
 * Google X-ray: site:linkedin.com/in, OR in capitals, "-" to exclude, no NOT, and
 *   Google ignores words beyond roughly 32 per query, so long strings are trimmed.
 * Generic: the same AND/OR/NOT syntax for XING, job boards and most ATS searches.
 *   Always test on the target platform; syntax support differs.
 */

export const LANGS = ['en', 'de', 'pl'];
export const GOOGLE_WORD_LIMIT = 32;

const clean = (t) => String(t ?? '').replace(/["“”„]/g, '').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
export function quote(term) {
  const t = clean(term);
  if (!t) return '';
  return /^[\p{L}\p{N}.#+/&-]+$/u.test(t) && !/^(AND|OR|NOT)$/i.test(t) ? t : `"${t}"`;
}
const uniq = (arr) => {
  const seen = new Set();
  return arr.filter((x) => { const k = clean(x).toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
};
export const orGroup = (terms) => {
  const q = uniq(terms).map(quote).filter(Boolean);
  if (!q.length) return '';
  return q.length === 1 ? q[0] : `(${q.join(' OR ')})`;
};

/** Search terms for one skill in the chosen profile languages. */
export function skillTerms(skill, langs) {
  if (skill.custom) return [skill.name];
  if (skill.source === 'esco') return [skill.name];
  return uniq(langs.flatMap((l) => skill.search?.[l] || []));
}
export function titleTerms(titles, langs, limit = 8) {
  // Interleave languages so a trimmed list still covers each language.
  const lists = langs.map((l) => titles?.[l] || []);
  const out = [];
  for (let i = 0; out.length < 40 && lists.some((x) => i < x.length); i++) for (const list of lists) if (list[i]) out.push(list[i]);
  return uniq(out).slice(0, limit);
}

const EXCLUDE = {
  en: ['intern', 'student', 'recruiter', 'talent acquisition'],
  de: ['Praktikant', 'Werkstudent', 'Recruiter'],
  pl: ['stażysta'],
};
export function exclusionTerms(familyId, langs) {
  let terms = uniq(langs.flatMap((l) => EXCLUDE[l] || []));
  if (familyId === 'intern') terms = terms.filter((t) => !/intern|student|praktikant|werkstudent|stażysta/i.test(t));
  if (familyId === 'recruiter' || familyId === 'hr-generalist') terms = terms.filter((t) => !/recruit|talent/i.test(t));
  return terms;
}

/**
 * Strategies (skills are grouped by category, the way sourcers group synonyms):
 *  narrow:   every selected skill required (at most 4 AND groups)
 *  balanced: one OR group per category, categories joined with AND (at most 3)
 *  broad:    any selected skill
 */
export function keywordExpression(skillGroups, strategy) {
  const g = skillGroups.filter((x) => x.terms.length);
  if (!g.length) return '';
  if (strategy === 'narrow') return g.slice(0, 4).map((x) => orGroup(x.terms)).join(' AND ');
  if (strategy === 'broad') return orGroup(g.flatMap((x) => x.terms));
  const byCat = new Map();
  for (const x of g) byCat.set(x.cat, [...(byCat.get(x.cat) || []), ...x.terms]);
  return [...byCat.values()].slice(0, 3).map(orGroup).join(' AND ');
}

export function buildPack({ titles, skills, familyId = null, langs = ['en', 'de'], strategy = 'balanced', locations = [], companies = [] }) {
  const sel = skills.filter((s) => s.selected);
  const skillGroups = sel.map((s) => ({ cat: s.custom || s.source === 'esco' ? 'Added' : s.cat, terms: skillTerms(s, langs) }));
  const groups = skillGroups.map((x) => orGroup(x.terms));
  const titleList = titleTerms(titles, langs);
  const titleGroup = orGroup(titleList);
  const keywords = keywordExpression(skillGroups, strategy);
  const excl = exclusionTerms(familyId, langs);
  const notGroup = excl.length ? ` NOT ${orGroup(excl)}` : '';

  const recruiter = {
    title: titleGroup,
    keywords: keywords ? keywords + notGroup : (excl.length ? `NOT ${orGroup(excl)}` : ''),
  };
  const generic = [titleGroup, keywords].filter(Boolean).join(' AND ') + notGroup;
  const xray = buildXray({ titleList, skillGroups, strategy, locations, companies, excl });
  return { recruiter, generic: generic.trim(), xray, langs, strategy };
}

/** Google X-ray with a hard word budget; returns what was trimmed so the UI can say so. */
export function buildXray({ titleList, skillGroups = [], strategy, locations = [], companies = [], excl = [] }) {
  const trimmed = [];
  let titles = titleList.slice(0, 6);
  // Narrow: the first two skills are each required. Otherwise one OR group that
  // takes the first synonym of every skill before any second synonym.
  const g = skillGroups.filter((x) => x.terms.length);
  const interleaved = [];
  for (let i = 0; i < 4; i++) for (const x of g) if (x.terms[i]) interleaved.push(x.terms[i]);
  let skillWords = !g.length ? [] : strategy === 'narrow' ? g.slice(0, 2).map((x) => orGroup(x.terms.slice(0, 3))) : [orGroup(interleaved.slice(0, 6))];
  let locs = locations.slice(0, 4);
  let comps = companies.slice(0, 5);
  const minus = excl.filter((t) => !t.includes(' ')).slice(0, 3).map((t) => '-' + t.toLowerCase());
  const assemble = () => ['site:linkedin.com/in', orGroup(titles), ...skillWords, orGroup(comps), orGroup(locs), ...minus].filter(Boolean).join(' ');
  let q = assemble();
  while (countGoogleWords(q) > GOOGLE_WORD_LIMIT) {
    if (titles.length > 3) { trimmed.push(titles.pop()); }
    else if (comps.length > 2) { trimmed.push(comps.pop()); }
    else if (locs.length > 2) { trimmed.push(locs.pop()); }
    else if (skillWords.length > 1) { trimmed.push(skillWords.pop()); }
    else if (titles.length > 1) { trimmed.push(titles.pop()); }
    else break;
    q = assemble();
  }
  return { query: q, words: countGoogleWords(q), trimmed };
}

/** Google counts words and operators except OR; site: and -term count as one each. */
export function countGoogleWords(q) {
  return (String(q).match(/"[^"]*"|\S+/g) || [])
    .filter((t) => !/^(OR|\(|\))$/.test(t))
    .reduce((n, t) => n + (t.startsWith('"') ? t.replace(/"/g, '').split(/\s+/).filter(Boolean).length : 1), 0);
}

export function googleUrl(q) {
  return 'https://www.google.com/search?q=' + encodeURIComponent(q);
}

// ----------------------------------------------------------------- validation
/** Tokenise and parse a Boolean string. Returns { ok, errors[], warnings[] }. */
export function validateBoolean(input, platform = 'recruiter') {
  const s = String(input ?? '');
  const errors = [];
  const warnings = [];
  if (!s.trim()) return { ok: false, errors: ['The search is empty.'], warnings };
  if ((s.match(/"/g) || []).length % 2) errors.push('A quotation mark is not closed.');
  if (/[“”„]/.test(s)) errors.push('Curly quotes (“ ”) are not recognised; use straight quotes (").');
  const tokens = [];
  const re = /"[^"]*"|\(|\)|[^\s()"]+/g;
  let m;
  while ((m = re.exec(s))) tokens.push(m[0]);
  let depth = 0;
  let prev = 'start';
  for (const t of tokens) {
    const op = /^(AND|OR|NOT)$/.test(t) ? t : null;
    if (/^(and|or|not)$/.test(t)) warnings.push(`"${t}" in lowercase is searched as a word. Use ${t.toUpperCase()}.`);
    if (t === '(') { if (platform !== 'xray' && (prev === 'term' || prev === ')')) warnings.push('Two terms next to each other are treated as AND on most platforms; add AND or OR.'); depth++; prev = '('; continue; }
    if (t === ')') { depth--; if (depth < 0) { errors.push('A closing parenthesis has no opening one.'); depth = 0; } if (prev === 'op' || prev === '(') errors.push('A group ends with an operator or is empty.'); prev = ')'; continue; }
    if (op) {
      if ((prev === 'op' && op !== 'NOT') || ((prev === 'start' || prev === '(') && op !== 'NOT')) errors.push(`"${op}" has nothing before it.`);
      prev = 'op';
      continue;
    }
    if (platform !== 'xray' && /\*$/.test(t)) warnings.push(`LinkedIn does not support wildcards: "${t}".`);
    prev = 'term';
  }
  if (depth > 0) errors.push('A parenthesis is not closed.');
  if (prev === 'op') errors.push('The search ends with an operator.');
  if (platform === 'xray') {
    if (/\bNOT\b/.test(s)) warnings.push('Google does not support NOT; use -word instead.');
    const n = countGoogleWords(s);
    if (n > GOOGLE_WORD_LIMIT) warnings.push(`${n} words: Google ignores words after about ${GOOGLE_WORD_LIMIT}.`);
  }
  if (s.length > 900) warnings.push('Very long strings are hard to debug; consider the Narrow strategy or fewer synonyms.');
  return { ok: !errors.length, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}
