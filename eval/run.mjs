#!/usr/bin/env node
/**
 * Term-extraction benchmark: ScoutForge v0.4 engine vs v1.0 engine on the same
 * authored, hand-labelled job descriptions (eval/roles.json).
 *
 * Metrics (per role, then averaged):
 *  - default precision: share of terms selected for the search by default that are relevant
 *  - must-have recall:  share of gold must-haves covered by the default selection
 *  - suggestion junk:   share of all suggested terms (selected or not) that are irrelevant
 *
 * Usage: node eval/run.mjs [--write]   (--write updates eval/results.json and web/data/eval.json)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeRole } from '../web/js/analyze.js';
import * as legacy from './legacy/engine_v04.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const set = JSON.parse(fs.readFileSync(path.join(ROOT, 'eval/roles.json'), 'utf8'));
const escoFull = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/data/esco.json'), 'utf8'));
const escoIndexPath = path.join(ROOT, 'web/data/esco-index.json');
const escoIndex = fs.existsSync(escoIndexPath) ? JSON.parse(fs.readFileSync(escoIndexPath, 'utf8')) : null;

const norm = (s) => String(s).toLowerCase().normalize('NFKC');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Whole-word match; plural / -ing / -ed forms count for both engines ("troubleshoot" ~ "troubleshooting").
const hasWord = (term, phrase) => new RegExp(`(?<![\\p{L}\\p{N}])${esc(norm(phrase))}(?:s|es|ing|ed)?(?![\\p{L}\\p{N}])`, 'u').test(norm(term));
const relevant = (strings, gold) => strings.some((t) => gold.some((g) => hasWord(t, g)));
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const r3 = (x) => Math.round(x * 1000) / 1000;

function scoreRole(role, items) {
  // items: [{ strings: [...], selected: bool, label }]
  const sel = items.filter((i) => i.selected);
  const prec = sel.length ? sel.filter((i) => relevant(i.strings, role.relevant)).length / sel.length : 0;
  const covered = role.must.filter((m) => sel.some((i) => i.strings.some((t) => hasWord(t, m)))).length;
  const recall = role.must.length ? covered / role.must.length : 1;
  const junkItems = items.filter((i) => !relevant(i.strings, role.relevant));
  return {
    precision: prec, mustRecall: recall, junk: items.length ? junkItems.length / items.length : 0,
    selected: sel.map((i) => i.label), irrelevantSelected: sel.filter((i) => !relevant(i.strings, role.relevant)).map((i) => i.label),
    junkExamples: junkItems.slice(0, 5).map((i) => i.label), suggested: items.length,
  };
}

function runLegacy(role) {
  const reqs = legacy.extractRequirements(role.jd, escoFull) || [];
  // v0.4 pre-selected the first eight terms for the search string.
  return reqs.map((r, i) => ({ label: r.name, strings: [r.name], selected: i < 8 }));
}
function runNew(role) {
  const a = analyzeRole(role.jd, { escoIndex });
  const items = a.skills.filter((s) => !s.contextOnly).map((s) => ({ label: s.name, strings: [s.name, ...Object.values(s.search).flat()], selected: s.selected }));
  for (const e of a.esco) items.push({ label: e.name + ' (ESCO)', strings: [e.name], selected: false });
  return items;
}

const rows = set.roles.map((role) => ({ id: role.id, v04: scoreRole(role, runLegacy(role)), v10: scoreRole(role, runNew(role)) }));
const summary = {};
for (const v of ['v04', 'v10']) {
  summary[v] = {
    precision: r3(mean(rows.map((r) => r[v].precision))),
    mustRecall: r3(mean(rows.map((r) => r[v].mustRecall))),
    junk: r3(mean(rows.map((r) => r[v].junk))),
  };
}
const result = {
  benchmark: 'ScoutForge term extraction', set_version: set.version, roles: rows.length,
  note: 'Authored job descriptions with hand-written gold labels; not real postings. Measures term extraction only, not search results or hiring outcomes.',
  summary, perRole: rows.map((r) => ({
    id: r.id,
    v04: { precision: r3(r.v04.precision), mustRecall: r3(r.v04.mustRecall), junk: r3(r.v04.junk), irrelevantSelected: r.v04.irrelevantSelected },
    v10: { precision: r3(r.v10.precision), mustRecall: r3(r.v10.mustRecall), junk: r3(r.v10.junk), irrelevantSelected: r.v10.irrelevantSelected },
  })),
};

const pct = (x) => `${Math.round(x * 100)}%`;
console.log(`\n${result.benchmark} · ${rows.length} roles\n`);
console.log('role'.padEnd(26), 'precision v0.4 → v1.0'.padEnd(24), 'must recall v0.4 → v1.0'.padEnd(26), 'junk v0.4 → v1.0');
for (const r of rows) console.log(r.id.padEnd(26), `${pct(r.v04.precision)} → ${pct(r.v10.precision)}`.padEnd(24), `${pct(r.v04.mustRecall)} → ${pct(r.v10.mustRecall)}`.padEnd(26), `${pct(r.v04.junk)} → ${pct(r.v10.junk)}`);
console.log('MEAN'.padEnd(26), `${pct(summary.v04.precision)} → ${pct(summary.v10.precision)}`.padEnd(24), `${pct(summary.v04.mustRecall)} → ${pct(summary.v10.mustRecall)}`.padEnd(26), `${pct(summary.v04.junk)} → ${pct(summary.v10.junk)}`);
for (const r of rows) if (r.v10.irrelevantSelected.length) console.log(`  v1.0 irrelevant selected in ${r.id}: ${r.v10.irrelevantSelected.join(', ')}`);

if (process.argv.includes('--write')) {
  fs.writeFileSync(path.join(ROOT, 'eval/results.json'), JSON.stringify(result, null, 2) + '\n');
  fs.writeFileSync(path.join(ROOT, 'web/data/eval.json'), JSON.stringify({ summary, roles: rows.length, set_version: set.version, note: result.note, perRole: result.perRole.map((r) => ({ id: r.id, v04: r.v04, v10: r.v10 })) }) + '\n');
  console.log('\nWrote eval/results.json and web/data/eval.json');
}
export default result;
