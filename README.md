# ScoutForge — sourcing copilot for manufacturing hiring

**Live:** https://abrar0205.github.io/ScoutForge/

ScoutForge turns a job description into everything a sourcer needs for the first week of a search, in about a minute:

- **Search pack**: LinkedIn Recruiter *Job title* and *Keywords* strings, a Google X-ray string and a generic string for XING, job boards and ATS search. Narrow, balanced and broad strategies; English, German and Polish profile vocabulary; every string parsed and validated.
- **Talent map** for Berlin-Brandenburg: commute tiers including cross-border Poland, adjacent employers, schools and channels, with company-targeted X-ray strings and a ready-to-paste LinkedIn *Companies* filter.
- **Outreach** drafts in English and German (formal *Sie*) with a live candidate-experience check: length, personalisation, one clear ask, an easy way to say no, no hype.
- **AI assist**: a role-specific prompt library with guardrails, plus an optional bring-your-own-key step (Anthropic or any OpenAI-compatible endpoint) that suggests titles and synonyms for human approval.
- **Excel workbook**: search pack, a pipeline tracker with dropdowns, a funnel and channel-performance dashboard built on live formulas, an automation-impact calculator and the prompt library.
- **Batch mode** for several open roles at once, and an **ATS data check** that finds duplicates, non-standard stages and sources, broken emails, mixed date formats and stale records.

Everything runs in the browser. Nothing is uploaded, fonts are self-hosted, and there are no third-party requests.

> Independent open-source project. Not affiliated with Tesla, LinkedIn, XING, Google or the European Commission.

## Why v1.0 exists: measured, not assumed

v0.4 matched single generic words against the ESCO taxonomy. For the built-in "Industrial Automation Engineer" sample it searched for *bridge engineering*, *fisheries management* and *manufacturing of made-up textile articles*, and left PLC, Siemens S7 and TIA Portal out of the string.

v1.0 replaces that with an evidence-based engine and measures the result on 12 hand-labelled job descriptions ([`eval/roles.json`](eval/roles.json)):

| Metric (mean over 12 roles) | v0.4 | v1.0 |
|---|---:|---:|
| Precision of the terms pre-selected for the search | 35% | **98%** |
| Must-have skills covered by default | 26% | **91%** |
| Irrelevant terms among all suggestions (lower is better) | 57% | **13%** |

Reproduce with `node eval/run.mjs`. The job descriptions were written for the benchmark to resemble typical regional manufacturing roles; they are not real postings, and the benchmark measures term extraction, not search results or hiring outcomes. The remaining v1.0 miss ("Paint shop" pre-selected for a data-analyst role) is left visible on purpose. CI fails if precision drops below 90% or must-have recall below 85%.

## How it decides

1. **Evidence.** The text is split into sentences and sections (*Requirements*, *Nice to have*, *Ihr Profil*…). A skill counts only if a phrase from the curated vocabulary appears word-for-word. Short acronyms such as SAP or ATS, and words that are also ordinary English (Excel, React, Rust, Workday), must appear as product names.
2. **Priority.** "Is a plus", "preferred" or "von Vorteil" mark nice-to-haves. Specific tools rank above broad domains. Working conditions such as shift work are kept as context, and language requirements become LinkedIn filters rather than keywords.
3. **Vocabulary.** 89 skills and 19 job families in [`web/js/vocab.js`](web/js/vocab.js), with the terms people actually write on profiles in English, German (both gendered forms, because LinkedIn has no wildcards) and Polish.
4. **Strings.** Synonyms are grouped by category: OR inside a group, AND between groups. X-ray strings stay inside Google's ~32-word budget and report what was trimmed.
5. **Human in the loop.** ESCO multi-word concepts and AI suggestions are offered, never added automatically.

## Project layout

```
web/index.html, web/styles.css        single-page interface (no framework, no build step needed locally)
web/js/analyze.js                     sentence/section parsing, evidence, priority, job family
web/js/vocab.js                       editorial EN/DE/PL vocabulary (versioned)
web/js/boolean.js                     platform-specific builders + Boolean parser/validator
web/js/market.js                      Berlin-Brandenburg talent-map seed list (editorial)
web/js/outreach.js, prompts.js, ai.js outreach drafts + checks, prompt library, BYO-key AI adapter
web/js/xlsx.js, workbook.js           dependency-free XLSX writer with formulas and data validation
web/js/ats.js, csv.js                 ATS export data-quality checks, safe CSV I/O
web/data/esco-index.json              compact ESCO v1.2.0 skill index (multi-word phrases only)
eval/                                 benchmark set, runner, v0.4 engine kept for comparison
scripts/build_site.py                 fingerprinted, cache-safe release for GitHub Pages
scripts/build_esco.py, build_esco_index.py   reproducible ESCO snapshot and index
tests/                                node:test suites, Python build tests, Playwright end-to-end test
```

## Run and test locally

```sh
python3 -m http.server 8080 --directory web      # open http://localhost:8080
npm test                                         # 23 unit tests incl. the benchmark guard
node eval/run.mjs                                # benchmark table
python3 -m unittest discover -s tests -p 'test_*.py'
python3 scripts/build_site.py && SCOUTFORGE_SITE_ROOT=_site python3 tests/browser_smoke.py
```

The browser test runs every flow at 1440 px and 390 px: analysis, toggles, validation errors, talent map, outreach scoring, all downloads (the workbook is unzipped and its formulas checked), batch, ATS check and the benchmark page. It also asserts there are no console errors, no external requests and no horizontal scrolling.

## Privacy and limitations

- Use public job descriptions. The ATS check runs locally; still, only load exports you are allowed to process, and prefer pseudonymised data.
- The optional AI step sends the role summary (title, skills, current string) only to the endpoint you configure, with your key, which is held in memory for the tab. Do not paste personal data.
- The vocabulary is hand-curated; unknown tools are not guessed, so add them as terms.
- The talent map is an editorial starting list (reviewed 2026-11) with no headcounts or availability claims.
- Platforms change their search syntax. Test strings on the target platform and read the first results before scaling up.
- XLSX text is always written as inline strings, so user text can never become a formula; CSV exports escape values beginning with `=`, `+`, `-` or `@`.

## Data sources and licences

- ESCO v1.2.0, © European Union, used under the ESCO reuse conditions for optional multi-word skill matches. https://esco.ec.europa.eu/en/use-esco/download
- Archivo and JetBrains Mono fonts under the SIL Open Font License ([`web/assets/fonts/OFL.txt`](web/assets/fonts/OFL.txt)).
- Code: MIT licence. Third-party names and trademarks belong to their owners.
