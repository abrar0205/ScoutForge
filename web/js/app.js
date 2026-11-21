/* ScoutForge v1 — interface controller. All processing happens in the browser. */
import { analyzeRole, escoMatches } from './analyze.js';
import { buildPack, validateBoolean, googleUrl, LANGS } from './boolean.js';
import { VOCAB_VERSION } from './vocab.js';
import { LOCATION_TIERS, MARKET_REVIEWED, marketFor, companyXray, POLISH_SCHOOLS } from './market.js';
import { outreachDraft, checkOutreach } from './outreach.js';
import { promptLibrary, promptLibraryMarkdown } from './prompts.js';
import { PROVIDERS, suggestTerms, improveOutreach } from './ai.js';
import { buildWorkbook } from './workbook.js';
import { checkAts, SAMPLE_ATS_CSV } from './ats.js';
import { parseCsv, toCsv } from './csv.js';
import { EXAMPLES, BATCH_EXAMPLE } from './examples.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
};
const STRATEGY_HELP = {
  narrow: 'Every selected skill is required. Few, precise results.',
  balanced: 'One OR group per skill category, categories joined with AND. Start here.',
  broad: 'Any selected skill. Use when Balanced returns too few results.',
};

const state = {
  role: null, langs: new Set(['en', 'de']), strategy: 'balanced', titleOff: new Set(), customTitles: [],
  tiers: new Set(['core', 'regional']), employers: [], outreach: { lang: 'en', tone: 'concise', edited: false },
  escoIndex: null, ai: { provider: 'anthropic', key: '', model: PROVIDERS.anthropic.model, base: '' }, batch: [], ats: null,
};

// ------------------------------------------------------------------ helpers
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 2200);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch { const ta = h('textarea', { class: 'visually-hidden' }); ta.value = text; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  toast('Copied');
}
function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const slug = (s) => String(s || 'role').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'role';

// ------------------------------------------------------------------ routing
function route() {
  const view = (location.hash || '#workbench').slice(1).split('/')[0];
  const known = ['workbench', 'batch', 'ats', 'method'];
  const v = known.includes(view) ? view : 'workbench';
  for (const sec of $$('.view')) sec.hidden = sec.dataset.view !== v;
  for (const a of $$('.mainnav a')) a.classList.toggle('active', a.dataset.view === v);
  if (v === 'method') renderMethod();
}
window.addEventListener('hashchange', route);

// ------------------------------------------------------------------ analysis
function currentTitles() {
  const r = state.role;
  const out = { en: [], de: [], pl: [] };
  for (const l of LANGS) for (const t of r.titles[l] || []) if (!state.titleOff.has(`${l}:${t}`)) out[l].push(t);
  for (const c of state.customTitles) if (!state.titleOff.has(`${c.lang}:${c.term}`)) out[c.lang].unshift(c.term);
  return out;
}
function allSkills() { return [...state.role.skills, ...state.role.esco]; }
function selectedLocations() {
  return LOCATION_TIERS.filter((t) => state.tiers.has(t.id)).flatMap((t) => t.places);
}

function analyze() {
  const jd = $('#jd').value;
  if (!jd.trim()) { toast('Paste a job description or a few skills first'); $('#jd').focus(); return; }
  state.role = analyzeRole(jd, { title: $('#title').value, escoIndex: state.escoIndex });
  state.titleOff = new Set(); state.customTitles = [];
  state.outreach.edited = false;
  // Polish titles only help when cross-border search is on; switch on automatically for Polish JDs.
  if (/[ąęłńśźż]/i.test(jd) && !state.langs.has('pl')) { state.langs.add('pl'); syncLangBoxes(); }
  const market = marketFor(state.role.family?.id);
  state.employers = market.employers.map((e, i) => ({ ...e, selected: i < 5 }));
  $('#results').hidden = false;
  renderRole(); renderTerms(); updateOutputs(); renderMap(); renderOutreach(true); renderPrompts();
  syncAi();
  $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function syncLangBoxes() { for (const cb of $$('#langs input')) cb.checked = state.langs.has(cb.value); }

function renderRole() {
  const r = state.role;
  $('#role-title').textContent = r.title;
  $('#role-family').textContent = r.family ? `Job family: ${r.family.id.replace(/-/g, ' ')}` : 'Job family: not recognised';
  const must = r.skills.filter((s) => s.priority === 'must' && !s.contextOnly).length;
  const nice = r.skills.filter((s) => s.priority === 'nice').length;
  const bits = [`${must} must-have and ${nice} nice-to-have skills found`, `${r.wordCount} words`];
  if (r.years) bits.push(`${r.years}+ years mentioned`);
  if (r.languages.length) bits.push('languages: ' + r.languages.map((l) => l.name + (l.nice ? ' (plus)' : '')).join(', '));
  $('#role-meta').textContent = bits.join(' · ');
  $('#warnings').replaceChildren(...r.warnings.map((w) => h('div', { class: 'warn', text: w })));
}

function chip({ label, pressed, onClick, tip, lang, tag }) {
  return h('button', { type: 'button', class: 'chip', 'aria-pressed': String(!!pressed), 'data-tip': tip || null, onclick: onClick },
    label, lang ? h('span', { class: 'lang', text: lang }) : null, tag ? h('span', { class: 'tag', text: tag }) : null);
}

function renderTerms() {
  const r = state.role;
  // Titles
  const titleChips = [];
  for (const l of LANGS) {
    if (!state.langs.has(l)) continue;
    const list = [...state.customTitles.filter((c) => c.lang === l).map((c) => ({ term: c.term, custom: true })), ...(r.titles[l] || []).map((t) => ({ term: t }))];
    for (const t of list) {
      const key = `${l}:${t.term}`;
      titleChips.push(chip({ label: t.term, lang: l, tag: t.custom ? 'added' : null, pressed: !state.titleOff.has(key),
        onClick: () => { state.titleOff.has(key) ? state.titleOff.delete(key) : state.titleOff.add(key); renderTerms(); updateOutputs(); } }));
    }
  }
  $('#title-chips').replaceChildren(...(titleChips.length ? titleChips : [h('span', { class: 'chip empty', text: 'No titles yet: add one below' })]));

  const skillChip = (s) => chip({
    label: s.name, pressed: s.selected, tag: s.custom ? 'added' : s.source === 'esco' ? 'ESCO' : null,
    tip: s.custom ? 'Added by you' : s.evidence ? `“${s.evidence[0].sentence.slice(0, 180)}” · matched “${s.evidence[0].match}”` : s.match ? `ESCO concept, matched “${s.match}”` : null,
    onClick: () => { s.selected = !s.selected; renderTerms(); updateOutputs(); },
  });
  const must = r.skills.filter((s) => s.priority === 'must' && !s.contextOnly);
  const nice = r.skills.filter((s) => s.priority === 'nice' && !s.contextOnly);
  $('#must-chips').replaceChildren(...(must.length ? must.map(skillChip) : [h('span', { class: 'chip empty', text: 'None found' })]));
  $('#nice-chips').replaceChildren(...(nice.length ? nice.map(skillChip) : [h('span', { class: 'chip empty', text: 'None found' })]));
  $('#esco-box').hidden = !r.esco.length;
  $('#esco-count').textContent = r.esco.length ? `(${r.esco.length})` : '';
  $('#esco-chips').replaceChildren(...r.esco.map(skillChip));
  const ctx = r.skills.filter((s) => s.contextOnly);
  const ctxItems = [...ctx.map((s) => h('div', { class: 'c-item' }, h('strong', { text: s.name }), ` · “${s.evidence[0].sentence.slice(0, 120)}”`)),
    ...r.languages.map((l) => h('div', { class: 'c-item' }, h('strong', { text: `${l.name}${l.nice ? ' (plus)' : ''}` }), ' · set as a Spoken languages filter in LinkedIn Recruiter, not as a keyword'))];
  $('#context-box').hidden = !ctxItems.length;
  $('#context-list').replaceChildren(...ctxItems);
}

function packFor(strategy) {
  return buildPack({
    titles: currentTitles(), skills: allSkills(), familyId: state.role.family?.id, langs: [...state.langs],
    strategy, locations: selectedLocations().slice(0, 4),
  });
}
function linkedinFilters() {
  const r = state.role, f = [];
  const places = selectedLocations();
  f.push(['Location', state.tiers.has('cross-border') ? 'Berlin, Brandenburg + western Poland' : 'Berlin and Brandenburg (radius around Grünheide)']);
  const req = r.languages.filter((l) => !l.nice);
  if (req.length) f.push(['Spoken languages', req.map((l) => l.name).join(', ')]);
  if (r.years) f.push(['Years of experience', `${r.years}+`]);
  if (r.seniority === 'student') f.push(['Schools / current students', 'filter by school']);
  if (places.length && !f.length) f.push(['Location', places.slice(0, 3).join(', ')]);
  return f;
}

function autosize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight + 2, 420) + 'px'; }
function setOutput(id, value, platform) {
  const el = $('#' + id); el.value = value; autosize(el); showCheck(id, platform);
}
function showCheck(id, platform) {
  const el = $('#' + id); const p = $(`.check[data-for="${id}"]`);
  if (!p) return;
  if (!el.value.trim()) { p.className = 'check'; p.textContent = ''; return; }
  const v = validateBoolean(el.value, platform);
  p.className = 'check ' + (v.errors.length ? 'err' : v.warnings.length ? 'warn-t' : 'ok');
  p.textContent = v.errors.length ? '✕ ' + v.errors.join(' ') : v.warnings.length ? '! ' + v.warnings.join(' ') : `✓ Valid syntax${platform === 'xray' ? ` · ${el.value.match(/"[^"]*"|\S+/g).filter((t) => t !== 'OR').length} terms` : ''}`;
}

function updateOutputs() {
  if (!state.role) return;
  const pack = packFor(state.strategy);
  $('#strategy-help').textContent = STRATEGY_HELP[state.strategy];
  setOutput('out-li-title', pack.recruiter.title, 'recruiter');
  setOutput('out-li-kw', pack.recruiter.keywords, 'recruiter');
  setOutput('out-xray', pack.xray.query, 'xray');
  if (pack.xray.trimmed.length) $('.check[data-for="out-xray"]').textContent += ` · trimmed to fit Google: ${pack.xray.trimmed.slice(0, 4).join(', ')}`;
  $('#xray-open').href = googleUrl(pack.xray.query);
  setOutput('out-generic', pack.generic, 'recruiter');
  $('#li-filters').replaceChildren(h('span', { class: 'hint', text: 'Set as filters:' }), ...linkedinFilters().map(([k, v]) => h('span', { class: 'filter' }, h('b', { text: k + ': ' }), v)));
  renderCompanyXray();
  if (!state.outreach.edited) renderOutreach(true);
}

// ------------------------------------------------------------------ talent map
function renderMap() {
  const m = marketFor(state.role.family?.id);
  $('#map-reviewed').textContent = MARKET_REVIEWED;
  $('#map-locations').replaceChildren(...LOCATION_TIERS.map((t) => h('div', { class: 'loc' },
    h('label', { class: 'loc-head' }, h('input', { type: 'checkbox', checked: state.tiers.has(t.id) || null, onchange: (e) => { e.target.checked ? state.tiers.add(t.id) : state.tiers.delete(t.id); if (t.id === 'cross-border' && e.target.checked && !state.langs.has('pl')) { state.langs.add('pl'); syncLangBoxes(); renderTerms(); } updateOutputs(); } }), t.label),
    h('div', { class: 'hint', text: t.places.join(' · ') + (t.note ? ` — ${t.note}` : '') }))));
  renderEmployers();
  const schools = [...m.schools, ...(state.tiers.has('cross-border') ? POLISH_SCHOOLS : [])];
  $('#map-schools').replaceChildren(...(schools.length ? schools : ['—']).map((s) => h('li', { text: s })));
  $('#map-channels').replaceChildren(...m.channels.map((c) => h('li', { text: c })));
}
function renderEmployers() {
  $('#map-employers').replaceChildren(...state.employers.map((e) => h('label', { class: 'emp' },
    h('input', { type: 'checkbox', checked: e.selected || null, onchange: (ev) => { e.selected = ev.target.checked; renderCompanyXray(); } }),
    h('span', {}, h('b', { text: e.name }), e.where ? ` · ${e.where}` : '', e.why ? h('span', { class: 'hint', text: ` — ${e.why}` }) : null))));
}
function renderCompanyXray() {
  if (!state.role) return;
  const sel = state.employers.filter((e) => e.selected).map((e) => e.name);
  const q = sel.length ? companyXray({ titles: currentTitles(), langs: [...state.langs], employers: sel, places: selectedLocations() }) : '';
  setOutput('out-company-xray', q, 'xray');
  $('#cx-open').href = q ? googleUrl(q) : '#';
  $('#out-company-list').value = sel.join('\n'); autosize($('#out-company-list'));
}

// ------------------------------------------------------------------ outreach
function renderOutreach(regenerate) {
  if (!state.role) return;
  if (regenerate) {
    const d = outreachDraft({ lang: state.outreach.lang, tone: state.outreach.tone, title: state.role.shortTitle, skills: state.role.skills });
    $('#msg-subject').value = d.subject; $('#msg-body').value = d.body;
  }
  const res = checkOutreach({ subject: $('#msg-subject').value, body: $('#msg-body').value, lang: state.outreach.lang });
  $('#msg-score').textContent = res.score;
  $('#msg-checks').replaceChildren(...res.checks.map((c) => h('li', { class: c.pass ? 'pass' : 'fail' },
    h('span', { class: 'i', text: c.pass ? '✓' : '✕' }), h('span', {}, c.label, h('span', { class: 'd', text: c.detail })))));
}

// ------------------------------------------------------------------ prompts + AI
function renderPrompts() {
  const items = promptLibrary(state.role);
  $('#prompt-list').replaceChildren(...items.map((p) => h('details', { class: 'prompt' },
    h('summary', {}, p.title, h('span', { class: 'hint', text: p.when })),
    h('pre', { text: p.prompt }),
    h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn small', onclick: () => copyText(p.prompt) }, 'Copy prompt')))));
}
function aiReady() {
  const a = state.ai;
  return a.provider === 'anthropic' ? !!a.key : !!(a.base && a.model);
}
function syncAi() {
  state.ai.provider = $('#ai-provider').value;
  state.ai.base = $('#ai-base').value.trim();
  state.ai.model = $('#ai-model').value.trim();
  state.ai.key = $('#ai-key').value.trim();
  $('#ai-base').placeholder = PROVIDERS[state.ai.provider].base;
  const ready = aiReady() && !!state.role;
  $('#ai-suggest').disabled = !ready; $('#msg-ai').disabled = !ready;
}
async function runSuggest() {
  const status = $('#ai-status'); status.textContent = 'Asking the model…'; $('#ai-suggest').disabled = true;
  try {
    const s = await suggestTerms({ ...state.ai, apiKey: state.ai.key, baseUrl: state.ai.base }, state.role, $('#out-li-kw').value);
    status.textContent = `${s.titles.length + s.skills.length} suggestions · review before adding`;
    const row = (label, reason, action) => h('div', { class: 'sugg-row' }, h('strong', { text: label }), h('span', { class: 'hint', text: reason }), action);
    const box = h('div', { class: 'sugg' },
      h('h4', { text: 'Suggested titles' }),
      ...(s.titles.length ? s.titles.map((t) => row(`${t.term} (${t.lang.toUpperCase()})`, t.reason, h('button', { type: 'button', class: 'btn small', onclick: (e) => { state.customTitles.push({ term: t.term, lang: t.lang }); if (!state.langs.has(t.lang)) { state.langs.add(t.lang); syncLangBoxes(); } e.target.disabled = true; e.target.textContent = 'Added'; renderTerms(); updateOutputs(); } }, 'Add'))) : [h('p', { class: 'hint', text: 'None.' })]),
      h('h4', { text: 'Suggested skill synonyms' }),
      ...(s.skills.length ? s.skills.map((t) => row(t.term, t.reason, h('button', { type: 'button', class: 'btn small', onclick: (e) => { addCustomSkill(t.term, 'ai'); e.target.disabled = true; e.target.textContent = 'Added'; } }, 'Add'))) : [h('p', { class: 'hint', text: 'None.' })]),
      ...(s.risky.length ? [h('h4', { text: 'Terms that may pull in noise' }), ...s.risky.map((t) => row(t.term, t.reason, null))] : []));
    $('#ai-results').replaceChildren(box);
  } catch (e) { status.textContent = e.message; }
  finally { syncAi(); }
}
async function runImproveOutreach() {
  const btn = $('#msg-ai'); btn.disabled = true; btn.textContent = 'Improving…';
  try {
    const out = await improveOutreach({ ...state.ai, apiKey: state.ai.key, baseUrl: state.ai.base }, { lang: state.outreach.lang, subject: $('#msg-subject').value, body: $('#msg-body').value, role: state.role });
    $('#msg-subject').value = out.subject; $('#msg-body').value = out.body; state.outreach.edited = true; renderOutreach(false);
    toast(out.placeholdersKept ? 'Draft improved; review it before sending' : 'Draft improved, but some [placeholders] changed; review carefully');
  } catch (e) { toast(e.message); }
  finally { btn.textContent = 'Improve with AI'; syncAi(); }
}

function addCustomSkill(term, origin = 'user') {
  const t = String(term || '').replace(/["()]/g, '').trim().slice(0, 60);
  if (!t || !state.role) return;
  if (state.role.skills.some((s) => s.name.toLowerCase() === t.toLowerCase())) { toast('Already in the list'); return; }
  state.role.skills.push({ id: 'custom:' + t, name: t, cat: 'Added', source: origin, custom: true, priority: 'must', selected: true, search: {}, count: 0 });
  renderTerms(); updateOutputs();
}

// ------------------------------------------------------------------ exports
function packEntry(role, langs, extra = {}) {
  const packs = {};
  for (const s of ['narrow', 'balanced', 'broad']) packs[s] = buildPack({ titles: extra.titles || role.titles, skills: [...role.skills, ...(role.esco || [])], familyId: role.family?.id, langs, strategy: s, locations: extra.locations || ['Berlin', 'Brandenburg'] });
  return { title: role.title, role, mustHaves: role.skills.filter((s) => s.priority === 'must' && !s.contextOnly).map((s) => s.name), packs, companyXray: extra.companyXray || '', filters: extra.filters || [] };
}
function downloadWorkbook(entries, name) {
  const { bytes } = buildWorkbook(entries, { includeExamples: $('#xl-examples')?.checked ?? true });
  download(name, new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}
function exportXlsx() {
  const entry = packEntry(state.role, [...state.langs], {
    titles: currentTitles(), locations: selectedLocations().slice(0, 4), companyXray: $('#out-company-xray').value,
    filters: linkedinFilters().map(([k, v]) => `${k}: ${v}`),
  });
  // Keep the user's edited balanced strings in the workbook.
  entry.packs.balanced.recruiter.title = $('#out-li-title').value;
  if (state.strategy === 'balanced') entry.packs.balanced.recruiter.keywords = $('#out-li-kw').value;
  downloadWorkbook([entry], `scoutforge-${slug(state.role.title)}.xlsx`);
}
function exportBrief() {
  const r = state.role;
  const md = [
    `# Sourcing brief: ${r.title}`, '', `Generated with ScoutForge on ${new Date().toISOString().slice(0, 10)}. Review before sharing.`, '',
    '## Must-have skills', ...r.skills.filter((s) => s.priority === 'must' && !s.contextOnly).map((s) => `- ${s.name}: “${s.evidence?.[0]?.sentence ?? 'added by recruiter'}”`), '',
    '## Nice to have', ...(r.skills.filter((s) => s.priority === 'nice').map((s) => `- ${s.name}`).concat(r.skills.some((s) => s.priority === 'nice') ? [] : ['- none listed'])), '',
    '## LinkedIn Recruiter', '**Job title field**', '```', $('#out-li-title').value, '```', `**Keywords (${state.strategy})**`, '```', $('#out-li-kw').value, '```',
    '**Filters:** ' + linkedinFilters().map(([k, v]) => `${k}: ${v}`).join(' · '), '',
    '## Google X-ray', '```', $('#out-xray').value, '```', '',
    '## Talent map (editorial seed list)', '**Employers:** ' + state.employers.filter((e) => e.selected).map((e) => e.name).join(', '), '',
    '```', $('#out-company-xray').value, '```', '',
    '## First message draft', `**Subject:** ${$('#msg-subject').value}`, '', $('#msg-body').value, '',
    '---', 'Independent tool; test strings on the target platform. No candidate data is included.',
  ].join('\n');
  download(`sourcing-brief-${slug(r.title)}.md`, md, 'text/markdown');
}

// ------------------------------------------------------------------ batch
function runBatch() {
  const parts = $('#batch-input').value.split(/^\s*-{3,}\s*$/m).map((s) => s.trim()).filter(Boolean).slice(0, 25);
  if (!parts.length) { toast('Paste at least one job description'); return; }
  const langs = $$('#batch-langs input:checked').map((i) => i.value);
  state.batch = parts.map((jd) => packEntry(analyzeRole(jd, { escoIndex: state.escoIndex }), langs.length ? langs : ['en']));
  const copyBtn = (text) => h('button', { type: 'button', class: 'btn small cp', onclick: () => copyText(text) }, 'Copy');
  $('#batch-table tbody').replaceChildren(...state.batch.map((e) => h('tr', {},
    h('td', {}, h('strong', { text: e.title }), h('div', { class: 'hint', text: e.role.family ? e.role.family.id.replace(/-/g, ' ') : 'family not recognised' })),
    h('td', { text: e.mustHaves.slice(0, 6).join(', ') || '—' }),
    h('td', { class: 'mono' }, e.packs.balanced.recruiter.keywords || '—', h('div', {}, copyBtn(e.packs.balanced.recruiter.keywords))),
    h('td', { class: 'mono' }, e.packs.balanced.xray.query, h('div', {}, copyBtn(e.packs.balanced.xray.query))))));
  $('#batch-results').hidden = false;
}

// ------------------------------------------------------------------ ATS
function runAts(text, name) {
  const { headers, records } = parseCsv(text);
  if (!headers.length || !records.length) { toast('No rows found in that file'); return; }
  const res = checkAts(records, headers);
  state.ats = { res, name };
  $('#ats-results').hidden = false;
  $('#ats-health').textContent = res.health + '%';
  $('#ats-rows').textContent = res.rows;
  $('#ats-issues').textContent = res.issues.length;
  const max = Math.max(1, ...Object.values(res.byType));
  $('#ats-types').replaceChildren(...Object.entries(res.byType).sort((a, b) => b[1] - a[1]).map(([k, n]) =>
    h('li', {}, h('span', { text: k }), h('span', { class: 'bar' }, h('i', { style: `width:${(n / max) * 100}%` })), h('strong', { text: String(n) }))));
  $('#ats-table tbody').replaceChildren(...res.issues.slice(0, 300).map((i) => h('tr', {}, h('td', { text: String(i.row) }), h('td', { text: i.field || '—' }), h('td', { text: i.problem }), h('td', { text: i.fix }))));
}

// ------------------------------------------------------------------ method
let methodDone = false;
async function renderMethod() {
  $('#vocab-version').textContent = VOCAB_VERSION;
  if (methodDone) return;
  try {
    const ev = await (await fetch('data/eval.json')).json();
    methodDone = true;
    const pct = (x) => `${Math.round(x * 100)}%`;
    $('#eval-note').textContent = `${ev.roles} roles, set ${ev.set_version}. ${ev.note}`;
    const card = (k, a, b, better) => h('div', { class: 'eval-card' }, h('div', { class: 'k', text: k }), h('div', { class: 'v' }, pct(b), h('span', { text: ` vs ${pct(a)} in v0.4` })), h('div', { class: 'hint', text: better }));
    $('#eval-summary').replaceChildren(
      card('Precision of default search terms', ev.summary.v04.precision, ev.summary.v10.precision, 'share of pre-selected terms that are relevant'),
      card('Must-have recall', ev.summary.v04.mustRecall, ev.summary.v10.mustRecall, 'share of required skills covered by default'),
      card('Junk in all suggestions', ev.summary.v04.junk, ev.summary.v10.junk, 'lower is better'));
    $('#eval-table tbody').replaceChildren(...ev.perRole.map((r) => h('tr', {}, h('td', { text: r.id }),
      h('td', { text: `${pct(r.v04.precision)} → ${pct(r.v10.precision)}` }), h('td', { text: `${pct(r.v04.mustRecall)} → ${pct(r.v10.mustRecall)}` }), h('td', { text: `${pct(r.v04.junk)} → ${pct(r.v10.junk)}` }))));
  } catch { $('#eval-note').textContent = 'Benchmark results could not be loaded.'; }
}

// ------------------------------------------------------------------ wiring
function wire() {
  $('#intake').addEventListener('submit', (e) => { e.preventDefault(); analyze(); });
  $('#jd').addEventListener('input', () => { $('#jd-count').textContent = `${($('#jd').value.match(/\S+/g) || []).length} words`; });
  $('#jd').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) analyze(); });
  $('#clear').addEventListener('click', () => { $('#jd').value = ''; $('#title').value = ''; $('#results').hidden = true; state.role = null; $('#jd').dispatchEvent(new Event('input')); $('#jd').focus(); });
  for (const b of $$('[data-example]')) b.addEventListener('click', () => { $('#jd').value = EXAMPLES[b.dataset.example]; $('#title').value = ''; $('#jd').dispatchEvent(new Event('input')); analyze(); });
  for (const cb of $$('#langs input')) cb.addEventListener('change', () => {
    cb.checked ? state.langs.add(cb.value) : state.langs.delete(cb.value);
    if (!state.langs.size) { state.langs.add('en'); syncLangBoxes(); toast('At least one language is needed'); }
    if (state.role) { renderTerms(); updateOutputs(); }
  });
  for (const r of $$('input[name=strategy]')) r.addEventListener('change', () => { state.strategy = r.value; updateOutputs(); });
  for (const t of $$('.tab')) t.addEventListener('click', () => {
    for (const x of $$('.tab')) { x.classList.toggle('active', x === t); x.setAttribute('aria-selected', String(x === t)); }
    for (const p of $$('.panel')) p.hidden = p.dataset.panel !== t.dataset.tab;
    for (const ta of $$(`.panel[data-panel="${t.dataset.tab}"] textarea.code`)) autosize(ta);
  });
  for (const id of ['out-li-title', 'out-li-kw', 'out-generic']) $('#' + id).addEventListener('input', () => { autosize($('#' + id)); showCheck(id, 'recruiter'); });
  for (const id of ['out-xray', 'out-company-xray']) $('#' + id).addEventListener('input', () => { autosize($('#' + id)); showCheck(id, 'xray'); });
  $('#out-xray').addEventListener('input', () => { $('#xray-open').href = googleUrl($('#out-xray').value); });
  for (const b of $$('[data-copy]')) b.addEventListener('click', () => {
    const target = $('#' + b.dataset.copy);
    copyText(b.dataset.copy === 'msg-body' ? `${$('#msg-subject').value}\n\n${target.value}` : target.value);
  });
  const addTitle = () => { const v = $('#add-title').value.replace(/["()]/g, '').trim(); if (!v || !state.role) return; state.customTitles.push({ term: v.slice(0, 60), lang: $('#add-title-lang').value }); if (!state.langs.has($('#add-title-lang').value)) { state.langs.add($('#add-title-lang').value); syncLangBoxes(); } $('#add-title').value = ''; renderTerms(); updateOutputs(); };
  $('#add-title-btn').addEventListener('click', addTitle);
  $('#add-title').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTitle(); } });
  const addSkill = () => { addCustomSkill($('#add-skill').value); $('#add-skill').value = ''; };
  $('#add-skill-btn').addEventListener('click', addSkill);
  $('#add-skill').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } });
  const addEmployer = () => { const v = $('#add-employer').value.replace(/["()]/g, '').trim(); if (!v || !state.role) return; state.employers.unshift({ name: v.slice(0, 60), where: '', why: 'added by you', selected: true }); $('#add-employer').value = ''; renderEmployers(); renderCompanyXray(); };
  $('#add-employer-btn').addEventListener('click', addEmployer);
  $('#add-employer').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addEmployer(); } });
  for (const r of $$('input[name=olang]')) r.addEventListener('change', () => { state.outreach.lang = r.value; state.outreach.edited = false; renderOutreach(true); });
  for (const r of $$('input[name=otone]')) r.addEventListener('change', () => { state.outreach.tone = r.value; state.outreach.edited = false; renderOutreach(true); });
  for (const id of ['msg-subject', 'msg-body']) $('#' + id).addEventListener('input', () => { state.outreach.edited = true; renderOutreach(false); });
  $('#msg-reset').addEventListener('click', () => { state.outreach.edited = false; renderOutreach(true); });
  $('#msg-ai').addEventListener('click', runImproveOutreach);
  for (const id of ['ai-provider', 'ai-base', 'ai-model', 'ai-key']) $('#' + id).addEventListener('input', syncAi);
  $('#ai-provider').addEventListener('change', () => { $('#ai-model').value = PROVIDERS[$('#ai-provider').value].model; syncAi(); });
  $('#ai-suggest').addEventListener('click', runSuggest);
  $('#dl-prompts').addEventListener('click', () => download(`prompt-library-${slug(state.role.title)}.md`, promptLibraryMarkdown(state.role), 'text/markdown'));
  $('#dl-xlsx').addEventListener('click', exportXlsx);
  $('#dl-brief').addEventListener('click', exportBrief);
  $('#batch-run').addEventListener('click', runBatch);
  $('#batch-example').addEventListener('click', () => { $('#batch-input').value = BATCH_EXAMPLE; runBatch(); });
  $('#batch-xlsx').addEventListener('click', () => { if (state.batch.length) downloadWorkbook(state.batch, `scoutforge-${state.batch.length}-roles.xlsx`); });
  $('#ats-sample').addEventListener('click', () => runAts(SAMPLE_ATS_CSV, 'sample-ats-export.csv'));
  $('#ats-file').addEventListener('change', (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 5e6) { toast('File is larger than 5 MB'); return; }
    const reader = new FileReader(); reader.onload = () => runAts(String(reader.result), f.name); reader.readAsText(f);
  });
  $('#ats-download').addEventListener('click', () => { if (state.ats) download(`cleaned-${state.ats.name.replace(/\.csv$/i, '')}.csv`, toCsv(state.ats.res.outHeaders, state.ats.res.cleaned), 'text/csv'); });
  $('#ai-model').value = PROVIDERS.anthropic.model;
  syncAi();
}

async function loadEsco() {
  try {
    const res = await fetch('data/esco-index.json');
    if (!res.ok) return;
    state.escoIndex = await res.json();
    if (state.role) {
      const taken = new Set(state.role.skills.map((s) => s.name.toLowerCase()));
      state.role.esco = escoMatches($('#jd').value, state.escoIndex, taken).map((e) => ({ ...e, source: 'esco', selected: false }));
      renderTerms();
    }
  } catch { /* optional data */ }
}

wire();
route();
loadEsco();
window.ScoutForge = { state }; // for tests and debugging
