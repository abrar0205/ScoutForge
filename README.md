# ScoutForge — Sourcing Workbench

**Independent open-source project. Not affiliated with Tesla, LinkedIn, or the European Commission.**

**Live:** https://abrar0205.github.io/ScoutForge/

ScoutForge turns a job description — or even a single skill — into an **editable Boolean sourcing strategy**, with inspectable search terms, optional ESCO vocabulary exploration, a recruiter-reviewed outreach draft, and an Excel workbook export.

## v0.3.1 — Reliable, cache-safe website releases

GitHub Pages publishes the output of `python scripts/build_site.py` (directory `_site/`), not raw `web/` files. The build fingerprints the CSS, app and imported JavaScript filenames, rewrites every reference to the same release, and writes an asset manifest. This prevents a new interface loading outdated browser-cached styles or ESM modules. The CSS and ESM paths are checked in CI and the generated site is exercised in the desktop/mobile browser tests. No browser settings or private keys are required.

## v0.3 — One input, one search, one export

The v0.3 release is a product usability overhaul driven by real browser feedback. A sample failure (`Industrial Automation Engineer` and a JD containing only `python`) no longer produces an unhelpful blank analysis.

- **Paste or type a skill.** The tool recognizes exact text-based skill mentions from a transparent, versioned glossary (Python, SQL, PLC, TIA Portal, Power Automate, etc.) as well as recorded ESCO skills. Short inputs can be used as reviewable keywords. A human must approve search terms.
- **Copy an editable search immediately.** Balanced, Focused, and Broad query structures have syntax validation. Users can add, remove, and search for suggested skill terms without navigating between pages.
- **Export a native Excel workbook.** A dependency-free OOXML exporter creates four sheets: Plan overview, Search strategies, Reviewed terms, and an **empty**, editable activity tracker. No fabricated outreach or hiring results. A separate Markdown brief is available.
- **Optional detail.** Evidence sentences, ESCO-related occupations and the outreach template are behind expandable sections. There is no mandatory three-step wizard or large empty second panel.
- **Client-side by default.** The job description and strategy remain in the browser; the public demo does not store candidate records, send messages or scrape recruitment sites.

### Data provenance — three separate classes of terms

| Class | How derived | What it means |
|---|---|---|
| `ESCO concept` | Literal or narrowly normalized match to a published ESCO skill label/alias | Verified taxonomy concept, with evidence from supplied text |
| `Exact JD keyword` | Literal match to a name/alias in `web/engine.js`'s editorial glossary | Present in the text, **not claimed to be an ESCO concept** |
| `Recruiter added` | Explicitly entered by the user | A human-provided search term, not independently verified |

The skill glossary is hand-maintained vocabulary for **exact term recognition**. It is **not generative AI, semantic embeddings, recruiter benchmarking, or automated talent matching**. Unrecognized short inputs are offered back as editable keywords, never as factual ESCO relationships.

### Source taxonomy

The repository publishes a reproducible ESCO **v1.2.0** snapshot via `scripts/build_esco.py` and `.github/workflows/esco.yml`. Current snapshot: **420 occupations, 5,001 skills and 18,936 relations**. The data comes from a pinned public mirror of official European Commission ESCO CSV records and includes source metadata.

Official classification: https://esco.ec.europa.eu/en/use-esco/download

ESCO occupations shown in the optional explorer are connected through **recorded skill IDs**, not invented similarity measurements. The test-corpus count evaluates ontology **occupation records**, not actual people, candidate supply, search-platform results or hiring outcomes. Boolean syntax and quality must be checked on the chosen external sourcing platform.

### Privacy and limitations

- Use public job descriptions only; never paste identifiable candidate data, private CVs or confidential business data into the public demo.
- Recruiters must review and edit terms, outreach language, and search syntax before use.
- No LinkedIn scraping, automatic messages, candidate ranking or recruitment decisions.
- No hosted generative-AI inference is connected in this release. Any future hosted LLM requires a secure backend, explicit limits, testing and provenance.
- Outreach templates include verification placeholders rather than invented employer or candidate facts.
- Generated XLSX values use **inline string cells** and cannot execute user-provided spreadsheet formulas.

## Test locally

```sh
python -m http.server 8080 --directory web
# visit http://localhost:8080
npm test
npm run check
python -m unittest discover -s tests -p 'test_*.py' -v
python tests/browser_smoke.py
```

The GitHub Actions browser job uses real HTTP-served ES modules plus a **clearly labeled, CI-only taxonomy fixture** to test: the Python screenshot regression, a longer manufacturing JD, query changes, optional source links, new terms, `.md` download and structurally valid `.xlsx` download at **1440px and 390px**. The historical ESCO snapshot is unchanged.

## Architecture

- `web/index.html`, `web/styles.css`, `web/app.js` — accessible, progressive single-page workflow
- `web/engine.js` — text evidence, glossary, Boolean parser, three strategies, optional ESCO corpus test
- `web/xlsx.js` — native OOXML+ZIP workbook generator, no dependencies
- `scripts/build_esco.py` — verifiable published ESCO subset builder
- `tests/` — JavaScript unit tests, browser tests, Python data-pipeline tests
- `.github/workflows/` — PR validation, ESCO source publishing, GitHub Pages deployment

**Project code:** MIT license. The ESCO-derived taxonomy is subject to its source-specific reuse conditions. Third-party names and trademarks remain their owners' property.


## v0.4 — Talent Sandbox + Campaign Operations

ScoutForge now includes an **end-to-end fictional recruitment workflow**. Recruiters can enter any role/skill, explore a searchable profile corpus, inspect examples, save them to a demo outreach queue, edit unsent outreach drafts, move demo records through simulation stages, and export records as a CSV or five-sheet Excel workbook. Role analysis and ESCO skills remain fully functional.

### Data provenance, privacy and what this is not

- **ESCO**: the European Commission's real, source-attributed occupation/skill classification (v1.2.0 subset). [Original ESCO downloads](https://esco.ec.europa.eu/en/use-esco/download).
- **Talent Sandbox**: a deterministic, reproducible library of **fictional profiles** generated from the checked-in ESCO relationships plus clearly editorial skill vocabularies. These are not real people, actual CVs, available talent, or evidence that any person has listed qualifications. The source contains no names, faces, email addresses, phone numbers or actual recruitment records.
- The build publishes `data/talent-sandbox.json` for the browser and a real, indexed **SQLite database** `data/talent-sandbox.sqlite` (tables: `profiles`, `profile_skills`). No paid hosting or backend API is required. If the dataset cannot load, a clearly labeled small fictional starter library remains usable.
- Unknown terms never produce fake positive search results. The interface shows that no *stored demo* profile covers the term and offers an explicitly labeled **what-if** example the user can create on demand. This is not live candidate sourcing or suitability scoring.
- Optional **local CSV import**: `id,title,skills,region`, where skills are separated with `|`. Only use non-identifying, authorized role/skill data. Personal columns (name/email/phone/etc.) are rejected; imported records remain in that browser tab and are not uploaded or retained in storage.
- The outreach queue is a **simulation**; it does not send messages, access LinkedIn/ATS, record actual responses, determine applicant suitability, or collect candidate personal information. Queue state for synthetic profiles is saved locally in the user's browser; use Reset to clear.

### Reproducible builds and tests

```bash
npm test                             # skill parsing, search, safety and workbook tests
python -m unittest discover -s tests -p 'test_*.py' -v
python scripts/build_talent.py --esco web/data/esco.json \
  --out web/data/talent-sandbox.json --sqlite web/data/talent-sandbox.sqlite
python scripts/build_site.py        # create clean, fingerprinted production release
```

`build_site.py` automatically derives the SQLite/JSON snapshots when the checked-in ESCO catalog is present. `GitHub Pages` publishes **the same fingerprinted bundle** validated by GitHub Actions, including browser tests at desktop and mobile widths.

A real, live candidate index would require a contracted provider, authorized ATS/Recruiter integration or an employer-owned database with appropriate permissions and safeguards; free public CV datasets do not establish candidate availability or permission to contact anyone. This project intentionally demonstrates sourcing *process* quality without pretending that fictional talent represents actual prospects.