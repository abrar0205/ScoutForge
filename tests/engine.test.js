import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRole, sentences, containsPhrase, detectTitle } from '../web/js/analyze.js';
import { buildPack, validateBoolean, countGoogleWords, quote, GOOGLE_WORD_LIMIT } from '../web/js/boolean.js';
import { SKILLS, TITLE_FAMILIES } from '../web/js/vocab.js';

const SAMPLE = `Industrial Automation Engineer

We are hiring an automation engineer for a high-volume manufacturing plant.
Experience with PLCs, Siemens S7 and TIA Portal is important. You will troubleshoot industrial automation systems, maintain electrical equipment and improve production reliability.
Knowledge of Python, SQL, preventive maintenance and quality control would be useful. This role involves communication with maintenance and production teams.`;

test('v0.4 regression: the sample role selects PLC, Siemens S7 and TIA Portal and nothing unrelated', () => {
  const a = analyzeRole(SAMPLE);
  const sel = a.skills.filter((s) => s.selected).map((s) => s.name);
  assert.deepEqual(sel, ['PLC programming', 'Siemens S7', 'TIA Portal']);
  const all = a.skills.map((s) => s.name).join(' ').toLowerCase();
  for (const junk of ['bridge', 'textile', 'fisheries', 'mining', 'ropes', 'plant health', 'high-volume recruiting']) assert.ok(!all.includes(junk), junk);
});

test('"would be useful" and "Nice to have" sections mark nice-to-haves', () => {
  const a = analyzeRole(SAMPLE);
  assert.equal(a.skills.find((s) => s.id === 'python').priority, 'nice');
  const b = analyzeRole('Technician\nRequirements:\n- KUKA robots\nNice to have:\n- SAP PM');
  assert.equal(b.skills.find((s) => s.id === 'kuka').priority, 'must');
  assert.equal(b.skills.find((s) => s.id === 'cmms').priority, 'nice');
});

test('word boundaries: SQL does not match NoSQL, React needs the product name, Excel needs a capital', () => {
  assert.equal(containsPhrase('We use NoSQL stores', 'sql'), false);
  const a = analyzeRole('You react quickly and excel in a fast-paced team with a typical workday.');
  assert.deepEqual(a.skills.map((s) => s.id), []);
  const b = analyzeRole('Advanced Excel and React experience, Workday ATS.');
  assert.deepEqual(b.skills.map((s) => s.id).sort(), ['ats', 'excel', 'javascript'].sort());
});

test('German job descriptions: SPS, Fehlersuche and gendered titles', () => {
  const a = analyzeRole('SPS-Programmierer (m/w/d)\nIhre Aufgaben:\n- Programmierung von Siemens S7-1500 im TIA Portal\n- Fehlersuche an PROFINET-Netzwerken\nIhr Profil:\n- Erfahrung mit KUKA von Vorteil');
  assert.equal(a.family.id, 'automation-engineer');
  assert.equal(a.title, 'SPS-Programmierer');
  assert.ok(a.titles.de.includes('SPS-Programmiererin'));
  assert.equal(a.skills.find((s) => s.id === 'kuka').priority, 'nice');
  assert.ok(a.skills.some((s) => s.id === 'troubleshooting'));
});

test('context such as shift work and industry is never a default keyword', () => {
  const a = analyzeRole('Maintenance Technician\nWork in 3-shift operation in automotive body shop with KUKA robots.');
  for (const s of a.skills.filter((x) => x.contextOnly)) assert.equal(s.selected, false);
  assert.ok(a.skills.find((s) => s.id === 'kuka').selected);
});

test('titles: (m/w/d) is removed and the explicit title field wins', () => {
  assert.equal(detectTitle('Mechatroniker (m/w/d)\nText'), 'Mechatroniker');
  assert.equal(detectTitle('We are hiring.\nMore text'), '');
  assert.equal(analyzeRole('KUKA', { title: 'Robot Programmer' }).title, 'Robot Programmer');
});

test('every skill and family entry is well formed', () => {
  const ids = new Set();
  for (const s of SKILLS) {
    assert.ok(!ids.has(s.id), 'duplicate id ' + s.id); ids.add(s.id);
    assert.ok(s.detect.length + s.exact.length > 0, s.id);
    for (const l of ['en', 'de', 'pl']) assert.ok(s.search[l]?.length, `${s.id} missing ${l}`);
    for (const p of s.detect) assert.equal(p, p.toLowerCase(), `${s.id}: detect phrases are lowercase`);
  }
  for (const f of TITLE_FAMILIES) for (const l of ['en', 'de', 'pl']) assert.ok(f.titles[l].length, `${f.id} ${l}`);
});

test('sentences keep section context', () => {
  const s = sentences('Requirements:\n- PLC\nNice to have:\n- SAP');
  assert.deepEqual(s.map((x) => x.section), ['must', 'nice']);
});

test('Boolean packs: categories are OR-grouped and AND-joined, strings validate on every platform', () => {
  const a = analyzeRole('Maintenance Technician\nTroubleshoot KUKA and FANUC robots. Maintain Siemens S7 PLCs in TIA Portal.');
  const p = buildPack({ titles: a.titles, skills: a.skills, familyId: a.family.id, langs: ['en', 'de'], strategy: 'balanced', locations: ['Berlin', 'Brandenburg'] });
  assert.match(p.recruiter.keywords, /^\((FANUC OR KUKA|KUKA OR FANUC)\) AND \(PLC OR SPS/);
  assert.match(p.recruiter.keywords, / NOT \(intern OR student/);
  assert.ok(p.recruiter.title.includes('Instandhalterin'));
  for (const [str, plat] of [[p.recruiter.title, 'recruiter'], [p.recruiter.keywords, 'recruiter'], [p.generic, 'recruiter'], [p.xray.query, 'xray']]) {
    const v = validateBoolean(str, plat);
    assert.ok(v.ok, `${plat}: ${v.errors.join(' ')} :: ${str}`);
  }
  assert.ok(p.xray.query.startsWith('site:linkedin.com/in '));
  assert.ok(p.xray.words <= GOOGLE_WORD_LIMIT);
  const narrow = buildPack({ titles: a.titles, skills: a.skills, familyId: a.family.id, langs: ['en'], strategy: 'narrow' });
  assert.ok(narrow.recruiter.keywords.split(' AND ').length >= 3);
});

test('recruiter roles do not exclude recruiters; intern roles do not exclude students', () => {
  const r = analyzeRole('Recruiter\nActive sourcing with LinkedIn Recruiter and Boolean search.');
  assert.ok(!/NOT \([^)]*recruiter/i.test(buildPack({ titles: r.titles, skills: r.skills, familyId: r.family.id }).recruiter.keywords));
  const i = analyzeRole('Praktikant Automatisierung\nSPS und TIA Portal.');
  assert.ok(!/Praktikant|student/.test(buildPack({ titles: i.titles, skills: i.skills, familyId: i.family.id }).recruiter.keywords.split('NOT')[1] || ''));
});

test('X-ray stays inside the Google word budget and reports what it trimmed', () => {
  const titles = { en: Array.from({ length: 12 }, (_, i) => `Title number ${i}`), de: [], pl: [] };
  const skills = Array.from({ length: 8 }, (_, i) => ({ name: `Skill ${i}`, cat: 'X', selected: true, custom: true }));
  const p = buildPack({ titles, skills, langs: ['en'], locations: ['Berlin', 'Potsdam', 'Cottbus', 'Eberswalde'] });
  assert.ok(p.xray.words <= GOOGLE_WORD_LIMIT, p.xray.query);
  assert.ok(p.xray.trimmed.length > 0);
});

test('validator catches broken strings', () => {
  assert.deepEqual(validateBoolean('(PLC OR SPS').errors, ['A parenthesis is not closed.']);
  assert.ok(validateBoolean('"TIA Portal').errors.length);
  assert.ok(validateBoolean('PLC OR').errors.includes('The search ends with an operator.'));
  assert.ok(validateBoolean('OR PLC').errors.some((e) => e.includes('nothing before it')));
  assert.ok(validateBoolean('PLC or SPS').warnings.some((w) => w.includes('lowercase')));
  assert.ok(validateBoolean('Mechatronik*').warnings.some((w) => w.includes('wildcards')));
  assert.ok(validateBoolean('site:linkedin.com/in PLC NOT SPS', 'xray').warnings.some((w) => w.includes('Google does not support NOT')));
  assert.ok(validateBoolean('“PLC”').errors.some((e) => e.includes('Curly')));
  assert.equal(validateBoolean('(PLC OR SPS) AND "TIA Portal" NOT intern').ok, true);
});

test('quoting and counting', () => {
  assert.equal(quote('TIA Portal'), '"TIA Portal"');
  assert.equal(quote('C++'), 'C++');
  assert.equal(quote('or'), '"or"');
  assert.equal(countGoogleWords('site:linkedin.com/in ("Maintenance Technician" OR KUKA) -intern'), 5);
});
