/**
 * The ScoutForge Excel workbook: search pack, pipeline tracker, live funnel and
 * channel dashboards (formulas), automation-impact calculator and prompt library.
 */
import { ST, ref, colName, xlsxBytes } from './xlsx.js';
import { STAGES, SOURCES } from './ats.js';
import { promptLibrary } from './prompts.js';

const PIPE_ROWS = 300; // rows pre-wired with formulas and dropdowns
const C = (v, s) => ({ v, s });
const F = (f, s) => ({ f, s });

const PIPE_HEAD = ['Role', 'Candidate ref', 'Source', 'Stage', 'Stage #', 'Contacted on', 'Replied?', 'Screen date', 'Owner', 'Next step', 'Notes'];
// Column letters in Pipeline
const P = { role: 'A', ref: 'B', source: 'C', stage: 'D', idx: 'E', contacted: 'F', replied: 'G', screen: 'H' };
const rng = (col) => `Pipeline!$${col}$2:$${col}$${PIPE_ROWS + 1}`;

/** Deterministic, clearly labelled example rows so the dashboards show how they work. */
export function exampleRows(roles) {
  const plan = [
    ['LinkedIn Recruiter', 'Hired', 1, 1, 1], ['LinkedIn Recruiter', 'Interview', 1, 1, 1], ['LinkedIn Recruiter', 'Screen', 1, 1, 1],
    ['LinkedIn Recruiter', 'Replied', 1, 1, 0], ['LinkedIn Recruiter', 'Contacted', 1, 0, 0], ['LinkedIn Recruiter', 'Contacted', 1, 0, 0],
    ['Google X-ray', 'Replied', 1, 1, 0], ['Google X-ray', 'Contacted', 1, 0, 0], ['XING', 'Screen', 1, 1, 1], ['XING', 'Contacted', 1, 0, 0],
    ['Referral', 'Submitted', 1, 1, 1], ['Job board', 'Declined', 1, 1, 1], ['LinkedIn Recruiter', 'Identified', 0, 0, 0], ['Google X-ray', 'Identified', 0, 0, 0],
  ];
  const rows = [];
  roles.forEach((role, ri) => plan.forEach(([source, stage, contacted, replied, screened], i) => {
    if ((i + ri) % 5 === 4 && ri > 0) return; // vary volume per role
    const day = String(1 + ((i * 3 + ri * 2) % 18)).padStart(2, '0');
    rows.push({ role, ref: `EXAMPLE-${String(rows.length + 1).padStart(3, '0')}`, source, stage,
      contacted: contacted ? `2026-11-${day}` : '', replied: contacted ? (replied ? 'Yes' : 'No') : '', screen: screened ? `2026-11-${String(Math.min(28, +day + 4)).padStart(2, '0')}` : '',
      owner: 'You', next: stage === 'Contacted' ? 'Follow up in 5 days' : '', notes: 'Fictional example row: delete before use' });
  }));
  return rows;
}

function pipelineSheet(roles, includeExamples) {
  const rows = [PIPE_HEAD.map((h) => C(h, ST.header))];
  const ex = includeExamples ? exampleRows(roles) : [];
  for (let i = 0; i < PIPE_ROWS; i++) {
    const r = i + 2;
    const e = ex[i];
    rows.push([
      C(e?.role ?? '', ST.input), C(e?.ref ?? '', ST.input), C(e?.source ?? '', ST.input), C(e?.stage ?? '', ST.input),
      F(`IF(${P.stage}${r}="","",IFERROR(MATCH(${P.stage}${r},Lists!$A$2:$A$${STAGES.length + 1},0),""))`, ST.int),
      C(e?.contacted ?? '', ST.input), C(e?.replied ?? '', ST.input), C(e?.screen ?? '', ST.input),
      C(e?.owner ?? '', ST.input), C(e?.next ?? '', ST.input), C(e?.notes ?? '', ST.input),
    ]);
  }
  const last = PIPE_ROWS + 1;
  return {
    name: 'Pipeline', freeze: 1, autoFilter: `A1:K${last}`,
    cols: [28, 16, 20, 14, 9, 14, 11, 14, 12, 24, 40],
    rows, heights: { 0: 30 },
    validations: [
      { sqref: `A2:A${last}`, list: `Lists!$C$2:$C$${roles.length + 1}` },
      { sqref: `C2:C${last}`, list: `Lists!$B$2:$B$${SOURCES.length + 1}` },
      { sqref: `D2:D${last}`, list: `Lists!$A$2:$A$${STAGES.length + 1}` },
      { sqref: `G2:G${last}`, list: 'Lists!$D$2:$D$3' },
    ],
  };
}

function funnelSheet(roles) {
  const head = ['Role', 'Sourced', 'Contacted', 'Replied', 'Screened', 'Submitted or later', 'Hired', 'Reply rate', 'Screen rate (of replies)', 'Hire rate (of contacted)'];
  const rows = [
    [C('Sourcing funnel', ST.title)],
    [C('Live formulas over the Pipeline sheet. Rates show blank until there is data.', ST.muted)],
    [],
    head.map((h) => C(h, ST.header)),
  ];
  const first = rows.length + 1;
  roles.forEach((role, i) => {
    const r = first + i;
    const roleCrit = `${rng(P.role)},$A${r}`;
    rows.push([
      C(role, ST.bold),
      F(`COUNTIFS(${roleCrit},${rng(P.stage)},"<>")`, ST.int),
      F(`COUNTIFS(${roleCrit},${rng(P.contacted)},"<>")`, ST.int),
      F(`COUNTIFS(${roleCrit},${rng(P.replied)},"Yes")`, ST.int),
      F(`COUNTIFS(${roleCrit},${rng(P.screen)},"<>")`, ST.int),
      F(`COUNTIFS(${roleCrit},${rng(P.idx)},">=5",${rng(P.idx)},"<=8")`, ST.int),
      F(`COUNTIFS(${roleCrit},${rng(P.stage)},"Hired")`, ST.int),
      F(`IF(C${r}=0,"",D${r}/C${r})`, ST.pct),
      F(`IF(D${r}=0,"",E${r}/D${r})`, ST.pct),
      F(`IF(C${r}=0,"",G${r}/C${r})`, ST.pct),
    ]);
  });
  const lastRole = first + roles.length - 1;
  const t = lastRole + 1;
  rows.push([
    C('All roles', ST.total),
    ...['B', 'C', 'D', 'E', 'F', 'G'].map((c) => F(`SUM(${c}${first}:${c}${lastRole})`, ST.total)),
    F(`IF(C${t}=0,"",D${t}/C${t})`, ST.totalPct), F(`IF(D${t}=0,"",E${t}/D${t})`, ST.totalPct), F(`IF(C${t}=0,"",G${t}/C${t})`, ST.totalPct),
  ]);
  rows.push([], [C('Definitions', ST.section)],
    [C('Sourced: any row with a stage. Contacted: "Contacted on" filled. Replied: "Replied?" = Yes. Screened: "Screen date" filled. Submitted or later: stage Submitted, Interview, Offer or Hired.', ST.muted)]);

  // Channel performance
  rows.push([], [C('Channel performance', ST.title)], [], ['Source', 'Contacted', 'Replied', 'Reply rate', 'Screened', 'Hired'].map((h) => C(h, ST.header)));
  const cFirst = rows.length + 1;
  SOURCES.forEach((src, i) => {
    const r = cFirst + i;
    const crit = `${rng(P.source)},$A${r}`;
    rows.push([
      C(src, ST.bold),
      F(`COUNTIFS(${crit},${rng(P.contacted)},"<>")`, ST.int),
      F(`COUNTIFS(${crit},${rng(P.replied)},"Yes")`, ST.int),
      F(`IF(B${r}=0,"",C${r}/B${r})`, ST.pct),
      F(`COUNTIFS(${crit},${rng(P.screen)},"<>")`, ST.int),
      F(`COUNTIFS(${crit},${rng(P.stage)},"Hired")`, ST.int),
    ]);
  });
  return { name: 'Funnel', cols: [32, 11, 11, 11, 11, 18, 9, 12, 22, 22], rows, heights: { 3: 30 } };
}

function impactSheet() {
  const rows = [
    [C('Automation impact (estimate)', ST.title)],
    [C('Replace the yellow defaults with times you measured. Formulas update automatically.', ST.muted)],
    [],
    ['Task', 'Volume per month', 'Minutes each, manual', 'Minutes each, with ScoutForge', 'Hours saved per month'].map((h) => C(h, ST.header)),
  ];
  const tasks = [
    ['Write and test Boolean strings (per role × platform)', 15, 25, 6],
    ['Draft first-touch outreach messages', 80, 6, 2],
    ['Build a talent map for a new role', 3, 120, 45],
    ['Clean ATS records for the weekly report', 4, 90, 15],
    ['Update the funnel report', 4, 60, 10],
  ];
  const first = rows.length + 1;
  tasks.forEach(([task, vol, man, auto], i) => {
    const r = first + i;
    rows.push([C(task, ST.wrap), C(vol, ST.inputInt), C(man, ST.inputInt), C(auto, ST.inputInt), F(`ROUND(B${r}*(C${r}-D${r})/60,1)`, ST.int)]);
  });
  const last = first + tasks.length - 1;
  rows.push([C('Total', ST.total), C('', ST.total), C('', ST.total), C('', ST.total), F(`SUM(E${first}:E${last})`, ST.total)]);
  rows.push([], [C('These are planning estimates, not measured results. Measure a baseline week before claiming savings.', ST.muted)]);
  return { name: 'Automation impact', cols: [52, 17, 20, 28, 20], rows, heights: { 3: 30 } };
}

function searchSheet(packs) {
  const rows = [[C('Search pack', ST.title)], [C('Test every string on the target platform before use. Syntax support differs between platforms.', ST.muted)], [],
    ['Role', 'Platform', 'Field / strategy', 'Search string', 'Notes'].map((h) => C(h, ST.header))];
  for (const p of packs) {
    const add = (platform, field, str, note = '') => rows.push([C(p.title, ST.bold), C(platform), C(field), C(str, ST.mono), C(note, ST.muted)]);
    add('LinkedIn Recruiter', 'Job title field', p.packs.balanced.recruiter.title);
    for (const s of ['narrow', 'balanced', 'broad']) add('LinkedIn Recruiter', `Keywords · ${s}`, p.packs[s].recruiter.keywords, s === 'balanced' ? 'Start here' : '');
    add('Google X-ray', 'Balanced', p.packs.balanced.xray.query, `${p.packs.balanced.xray.words} words (limit ≈32)`);
    if (p.companyXray) add('Google X-ray', 'Company-targeted', p.companyXray, 'From the talent map selection');
    add('XING / job boards / ATS', 'Balanced', p.packs.balanced.generic, 'Generic AND / OR / NOT');
    if (p.filters?.length) add('LinkedIn Recruiter', 'Filters (not keywords)', p.filters.join(' · '), 'Set these as filters');
  }
  return { name: 'Search pack', freeze: 4, cols: [26, 22, 22, 90, 26], rows };
}

function startSheet(packs, created) {
  const rows = [
    [C('ScoutForge sourcing workbook', ST.title)],
    [C(`Generated ${created.toISOString().slice(0, 10)} · ${packs.length} role${packs.length === 1 ? '' : 's'}`, ST.muted)],
    [],
    [C('How to use it', ST.section)],
    [C('1. Copy a string from "Search pack" into LinkedIn Recruiter, Google or XING and check the first 25 results.')],
    [C('2. Log every person you contact in "Pipeline". Use the dropdowns for Role, Source, Stage and Replied?.')],
    [C('3. "Funnel" updates itself: reply rate, screen rate and channel performance.')],
    [C('4. Use "Prompt library" with your approved AI platform. Review every output.')],
    [],
    [C('Roles in this workbook', ST.section)],
    ...packs.map((p) => [C(p.title, ST.bold), C(p.mustHaves.join(', '), ST.wrap)]),
    [],
    [C('Notes', ST.section)],
    [C('Rows labelled EXAMPLE are fictional and only show how the dashboards work. Delete them before real use.', ST.muted)],
    [C('Do not store personal data you do not need. Follow your company’s data-protection rules (GDPR).', ST.muted)],
  ];
  return { name: 'Start here', cols: [34, 90], rows };
}

function promptSheet(packs) {
  const rows = [[C('Prompt library', ST.title)], [C('Paste into an approved AI platform; replace <<...>> placeholders; review every output.', ST.muted)], [],
    ['Role', 'Prompt', 'When to use', 'Prompt text'].map((h) => C(h, ST.header))];
  for (const p of packs) for (const pr of promptLibrary(p.role)) rows.push([C(p.title, ST.bold), C(pr.title, ST.bold), C(pr.when, ST.wrap), C(pr.prompt, ST.wrap)]);
  return { name: 'Prompt library', freeze: 4, cols: [24, 30, 22, 110], rows };
}

function listsSheet(roles) {
  const n = Math.max(STAGES.length, SOURCES.length, roles.length, 2);
  const rows = [['Stages', 'Sources', 'Roles', 'Yes/No'].map((h) => C(h, ST.header))];
  for (let i = 0; i < n; i++) rows.push([STAGES[i] ?? '', SOURCES[i] ?? '', roles[i] ?? '', ['Yes', 'No'][i] ?? '']);
  return { name: 'Lists', cols: [16, 22, 30, 10], rows };
}

/**
 * packs: [{ title, role, mustHaves, packs: {narrow, balanced, broad}, companyXray, filters }]
 */
export function buildWorkbook(packs, { includeExamples = true, created = new Date() } = {}) {
  const roles = [...new Set(packs.map((p) => p.title))];
  const sheets = [
    startSheet(packs, created), searchSheet(packs), pipelineSheet(roles, includeExamples), funnelSheet(roles),
    impactSheet(), promptSheet(packs), listsSheet(roles),
  ];
  return { sheets, bytes: xlsxBytes(sheets, { title: 'ScoutForge sourcing workbook', created }) };
}

export { colName, ref };
