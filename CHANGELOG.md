# ScoutForge release notes

## v1.0 — Sourcing copilot

A rebuild focused on search quality, regional sourcing and measurable results.

**Search quality**
- New evidence-based engine: phrase matching on word boundaries, section-aware must-have / nice-to-have detection, specific tools ranked above broad domains, working conditions kept as context.
- Fixes the v0.4 sample, which searched for "bridge engineering" and "fisheries management" and omitted PLC / Siemens S7 / TIA Portal.
- Benchmark on 12 hand-labelled roles: default-term precision 35% → 98%, must-have recall 26% → 91%, junk suggestions 57% → 13%. Guarded in CI.

**Sourcing outputs**
- Platform-specific strings: LinkedIn Recruiter (title + keywords fields, suggested filters), Google X-ray within the word budget, generic Boolean for XING / job boards / ATS.
- English, German (both gendered title forms) and Polish profile vocabulary.
- Berlin-Brandenburg talent map with commute tiers, cross-border Poland, adjacent employers, schools, channels and company-targeted X-ray.
- Outreach drafts (EN / DE formal) with a live candidate-experience check.
- Role-specific prompt library with guardrails; optional bring-your-own-key AI suggestions (Anthropic or OpenAI-compatible) that require approval.
- Batch mode for several roles; ATS export data-quality check with a cleaned CSV.
- Excel workbook rebuilt: pipeline tracker with dropdowns, funnel and channel dashboards on live formulas, automation-impact calculator, prompt library.

**Engineering**
- Modular ES modules in `web/js`, all fingerprinted with dependency-ordered import rewriting.
- Self-hosted fonts; no third-party requests. Raw ESCO snapshot no longer shipped; compact index instead (1.1 MB vs 3.4 MB).
- Removed the fictional talent sandbox: fictional profiles did not demonstrate sourcing quality.
- Tests: 23 node tests, 9 Python tests, Playwright end-to-end flows at desktop and mobile widths.

## v0.4 — Talent Sandbox and completed sourcing demo
- Reproducible source-attributed ESCO-based synthetic profile dataset with downloadable SQLite database and static JSON index.
- Browser-based search, filters, fictional profiles, inspectable skill chips, lightweight family landscape chart and optional what-if profile for unknown skills.
- Save fictional profiles into browser-local outreach simulation, edit statuses, draft unsent outreach, and export queue CSV + five-sheet Excel.
- Optional privacy-limited, local-only CSV import for authorized anonymous role/skill records.
- Responsive recruiter UI and browser/unit/data checks, hashed module imports and atomic GitHub Pages publication.
- Clear provenance labeling: no real candidates, live supply claims, unauthorized scraping, ranking, or actual contact.


## v0.3.1 — Prevent stale CSS and JS across deployments

- Fixed a live-site mixed-release regression reported by a user: the updated page structure rendered with outdated dark/mint CSS, resulting in overlapping controls, unstyled inputs, and a skills library stuck in a loading state.
- Pages now publishes content-fingerprinted CSS, app, and ESM dependencies as an atomic release; the page references only the matching versions.
- Added source/package and browser regression tests that validate the deployed stylesheet, compiled module paths, rendering, and sourcing workflow.
- Corrected the description textarea placeholder so it no longer displays literal backslash-n sequences.
- Kept the same site URL, client-side privacy model, and verified ESCO data. No paid hosting or external JS dependencies.


## v0.3 — Search that actually works for humans

- Fixed the reported case where entering only `python` produced zero suggestions and an unusable path through the workbench. Exact mention of Python (with job title present or absent) is accepted as a reviewable JD keyword.
- Added a transparent, inspectable glossary alongside ESCO, with distinct ESCO / JD keyword / recruiter-added provenance; no invented taxonomy relationships.
- Rebuilt the UI as a single prominent input and immediately usable search pane. Removed the mandatory multi-tab wizard, empty analysis column and large decorative hero.
- Search strategy tabs include Balanced, Focused and Broad. Users can edit, validate, copy and reset each Boolean query, remove or add search terms and use optional suggestions from the loaded ESCO vocabulary.
- Added a real offline-generated XLSX workbook with Overview, Searches, Terms and empty Activity tracker, plus existing Markdown brief.
- Moved detailed evidence, related-occupation graph and outreach draft into optional sections. Added a stale-state guard when the source JD changes before regeneration.
- Expanded deterministic unit tests, syntax tests, Excel ZIP/XML verification and desktop/mobile browser QA.

## v0.2 — Compact initial workbench

- Three-stage sourcing workflow; initial ESCO evidence extraction, source-linked terms, Boolean validation, CSV and Markdown exports.