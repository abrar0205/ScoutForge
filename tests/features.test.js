import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRole } from '../web/js/analyze.js';
import { buildPack } from '../web/js/boolean.js';
import { outreachDraft, checkOutreach } from '../web/js/outreach.js';
import { promptLibrary, promptLibraryMarkdown, GUARDRAILS } from '../web/js/prompts.js';
import { buildRequest, extractJson, validateSuggestions, suggestTerms, improveOutreach, readText } from '../web/js/ai.js';
import { checkAts, normStage, normSource, normDate, SAMPLE_ATS_CSV } from '../web/js/ats.js';
import { parseCsv, toCsv } from '../web/js/csv.js';
import { companyXray, marketFor } from '../web/js/market.js';
import { buildWorkbook, exampleRows } from '../web/js/workbook.js';
import { workbookFiles, crc32 } from '../web/js/xlsx.js';

const ROLE = analyzeRole('Maintenance Technician\nRequirements: KUKA robots, Siemens S7 and TIA Portal. Hydraulics is a plus.');

test('outreach drafts fail the check until placeholders are filled, then pass', () => {
  for (const lang of ['en', 'de']) {
    const d = outreachDraft({ lang, title: ROLE.title, skills: ROLE.skills });
    const before = checkOutreach({ ...d, lang });
    assert.equal(before.checks.find((c) => c.id === 'placeholders').pass, false);
    assert.equal(before.checks.find((c) => c.id === 'optout').pass, true, lang);
    assert.equal(before.checks.find((c) => c.id === 'cta').pass, true, lang);
    const filled = d.body.replace(/\[[^\]]+\]/g, (m) => (/name/i.test(m) ? 'Alex' : lang === 'de' ? 'Ihre Erfahrung mit KUKA-Robotern im Karosseriebau' : 'your experience maintaining KUKA robots in a body shop'));
    const after = checkOutreach({ subject: d.subject, body: filled, lang });
    assert.equal(after.checks.find((c) => c.id === 'placeholders').pass, true);
    assert.ok(d.subject.length <= 60, d.subject);
  }
  const bad = checkOutreach({ subject: 'Amazing opportunity!!!', body: 'Hey rockstar! Join us!!!', lang: 'en' });
  assert.ok(bad.score < 40);
  const mixed = checkOutreach({ subject: 'Hallo', body: 'Hallo,\nkannst du mir sagen, ob Sie Zeit haben?', lang: 'de' });
  assert.equal(mixed.checks.find((c) => c.id === 'address').pass, false);
});

test('prompt library covers the sourcing workflow and always carries guardrails', () => {
  const items = promptLibrary(ROLE);
  assert.deepEqual(items.map((p) => p.id), ['boolean-review', 'talent-map', 'profile-summary', 'outreach', 'screening-guide', 'funnel-insights']);
  for (const p of items) for (const g of GUARDRAILS) assert.ok(p.prompt.includes(g), p.id);
  assert.match(promptLibraryMarkdown(ROLE), /^# Prompt library: Maintenance Technician/);
});

test('AI adapter: request shape for Anthropic and OpenAI-compatible endpoints', () => {
  const a = buildRequest({ provider: 'anthropic', apiKey: 'k', model: 'm' }, 'sys', 'hi');
  assert.equal(a.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(a.init.headers['x-api-key'], 'k');
  assert.equal(a.init.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.deepEqual(JSON.parse(a.init.body).messages, [{ role: 'user', content: 'hi' }]);
  const o = buildRequest({ provider: 'openai', apiKey: '', model: 'llama3', baseUrl: 'http://localhost:11434/v1/' }, 'sys', 'hi');
  assert.equal(o.url, 'http://localhost:11434/v1/chat/completions');
  assert.equal(o.init.headers.authorization, undefined);
  assert.throws(() => buildRequest({ provider: 'anthropic', apiKey: '' }, 's', 'u'));
  assert.throws(() => buildRequest({ provider: 'openai', apiKey: 'x', model: '' }, 's', 'u'));
});

test('AI adapter: JSON extraction and suggestion validation', () => {
  assert.deepEqual(extractJson('Sure!\n```json\n{"a":{"b":"}"}}\n```'), { a: { b: '}' } });
  assert.throws(() => extractJson('no json here'));
  const v = validateSuggestions({
    titles: [{ term: 'Instandhaltungsmechaniker', lang: 'de', reason: 'common' }, { term: 'Young technician', lang: 'en' }, { term: 'X', lang: 'en' }, { term: 'Servicetechniker', lang: 'xx' }],
    skills: [{ term: 'KUKA KRC4' }, { term: 'KUKA KRC4' }, { term: 'PLC OR SPS' }, { term: 'native German speaker' }],
    risky: [{ term: 'automation', reason: 'too broad' }],
  }, ['Instandhalter']);
  assert.deepEqual(v.titles.map((t) => t.term), ['Instandhaltungsmechaniker']);
  assert.deepEqual(v.skills.map((t) => t.term), ['KUKA KRC4']);
  assert.equal(v.risky.length, 1);
});

test('AI adapter: end-to-end with a mocked provider', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const text = calls.length === 1
      ? '{"titles":[{"term":"Robotertechniker","lang":"de","reason":"profile wording"}],"skills":[{"term":"KRL","reason":"KUKA Robot Language"}],"risky":[]}'
      : '{"subject":"Kurzer Austausch?","body":"Guten Tag [Vorname Nachname], kurze Frage …"}';
    return { ok: true, json: async () => ({ content: [{ type: 'text', text }] }) };
  };
  const s = await suggestTerms({ provider: 'anthropic', apiKey: 'k' }, ROLE, '(KUKA)', fakeFetch);
  assert.deepEqual(s.titles.map((t) => t.term), ['Robotertechniker']);
  assert.deepEqual(s.skills.map((t) => t.term), ['KRL']);
  const o = await improveOutreach({ provider: 'anthropic', apiKey: 'k' }, { lang: 'de', subject: 'x', body: 'Guten Tag [Vorname Nachname]', role: ROLE }, fakeFetch);
  assert.equal(o.placeholdersKept, true);
  assert.equal(readText('openai', { choices: [{ message: { content: 'hi' } }] }), 'hi');
  const failing = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'invalid x-api-key' } }) });
  await assert.rejects(() => suggestTerms({ provider: 'anthropic', apiKey: 'bad' }, ROLE, '', failing), /invalid x-api-key/);
});

test('ATS check on the sample export finds each planted problem', () => {
  const { headers, records } = parseCsv(SAMPLE_ATS_CSV);
  const r = checkAts(records, headers, { today: '2026-11-21' });
  const p = r.issues.map((i) => i.problem).join('\n');
  for (const expected of ['Duplicate of row', 'Invalid email format', 'Missing value', 'Unknown stage "On hold"', 'Non-standard stage "phone screen"', 'Inconsistent source "xray"', 'Mixed date formats', 'No activity for 51 days while "Interview"']) {
    assert.ok(p.includes(expected), expected);
  }
  assert.ok(r.health > 0 && r.health < 100);
  const c = r.cleaned.find((x) => x.candidate_id === 'C-002');
  assert.equal(c.stage, 'Screen'); assert.equal(c.source, 'LinkedIn Recruiter'); assert.equal(c.last_activity, '2026-11-14');
  assert.equal(r.cleaned.find((x) => x.candidate_id === 'C-004').dq_flag, 'possible duplicate');
});

test('ATS normalisers and CSV handling', () => {
  assert.equal(normStage('Phone Screening'), 'Screen');
  assert.equal(normSource('LI'), 'LinkedIn Recruiter');
  assert.equal(normDate('31.02.2026'), null);
  assert.equal(normDate('1/12/2026'), '2026-12-01');
  const parsed = parseCsv('a;b\n"x;1";"he said ""hi"""\n');
  assert.deepEqual(parsed.records, [{ a: 'x;1', b: 'he said "hi"' }]);
  assert.match(toCsv(['a'], [{ a: '=HYPERLINK("x")' }]), /^a\r\n"'=HYPERLINK\(""x""\)"/);
});

test('talent map: company X-ray within the word budget', () => {
  const m = marketFor('maintenance-technician');
  assert.ok(m.employers.length >= 5 && m.channels.length);
  const q = companyXray({ titles: ROLE.titles, langs: ['en', 'de'], employers: m.employers.map((e) => e.name), places: ['Berlin', 'Brandenburg'] });
  assert.ok(q.startsWith('site:linkedin.com/in'));
  assert.ok(q.split(/\s+/).filter((t) => t !== 'OR').length <= 40);
  assert.equal(marketFor('unknown').group, 'industrial');
});

test('workbook: sheets, formulas, dropdowns and a valid ZIP', () => {
  const packs = {};
  for (const s of ['narrow', 'balanced', 'broad']) packs[s] = buildPack({ titles: ROLE.titles, skills: ROLE.skills, familyId: ROLE.family.id, strategy: s });
  const entry = { title: ROLE.title, role: ROLE, mustHaves: ['KUKA'], packs, companyXray: 'site:linkedin.com/in KUKA', filters: ['Spoken languages: German'] };
  const { sheets, bytes } = buildWorkbook([entry], { created: new Date('2026-11-21T10:00:00Z') });
  assert.deepEqual(sheets.map((s) => s.name), ['Start here', 'Search pack', 'Pipeline', 'Funnel', 'Automation impact', 'Prompt library', 'Lists']);
  const files = workbookFiles(sheets);
  assert.match(files['xl/workbook.xml'], /fullCalcOnLoad="1"/);
  assert.match(files['xl/worksheets/sheet4.xml'], /<f>COUNTIFS\(Pipeline!\$A\$2:\$A\$301,\$A5,Pipeline!\$G\$2:\$G\$301,&quot;Yes&quot;\)<\/f>/);
  assert.match(files['xl/worksheets/sheet3.xml'], /<dataValidation type="list"[^>]*sqref="D2:D301"><formula1>Lists!\$A\$2:\$A\$11<\/formula1>/);
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), 'PK');
  assert.ok(exampleRows([ROLE.title]).every((r) => r.ref.startsWith('EXAMPLE-')));
  // User text is never written as a formula.
  const evil = buildWorkbook([{ ...entry, title: '=cmd|"/c calc"!A1' }]);
  assert.doesNotMatch(workbookFiles(evil.sheets)['xl/worksheets/sheet1.xml'], /<f>cmd/);
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});
