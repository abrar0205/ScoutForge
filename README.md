# ScoutForge — Sourcing Strategy Workbench

**Independent open-source research project. Not affiliated with Tesla, LinkedIn, or the European Commission.**

ScoutForge helps a recruiter turn a job description into an **editable, evidence-backed sourcing plan**, without scraping candidates or inventing market statistics.

**Live:** https://abrar0205.github.io/ScoutForge/

## Release v0.2 — focused three-step workflow

1. **Define role.** Paste a job description. The browser finds ESCO skill labels and limited verb variants, displays the actual supporting JD sentence, and lets a recruiter approve or exclude suggestions. Add manual skill terms separately.
2. **Build search.** Switch between **Precise**, **Balanced**, and **Explore** Boolean searches. Edit them, validate grammar, and check how many published ESCO **occupation descriptions** satisfy the expression. Optionally open a compact skills-to-occupations graph.
3. **Export plan.** Review an editable outreach *template*, add recruiter notes, and download a Markdown brief or Excel-compatible CSV. Nothing is sent automatically.

The UI intentionally keeps the occupation graph and evidence details collapsed until requested. All three stages work with standard browser JavaScript. No accounts, secrets, paid services or build step are needed to explore the public demo.

## Real data / what the metrics mean

- ESCO version **1.2.0**, published by the European Commission and mirrored at a pinned commit; build logic and source metadata are in [`scripts/build_esco.py`](scripts/build_esco.py).
- The GitHub Actions pipeline publishes a relevance-focused subset of **420 occupations**, **5,001 skill concepts**, and **18,936 occupation–skill relations** (from its current published source snapshot). Exact totals may change when the dataset is rebuilt.
- SearchTwin counts **ontology occupation records** for which the Boolean expression matches the occupation name or its linked skills. The count **does not** represent people, CVs, sourcing results, available candidates, response rate, geographic talent pools, or model accuracy.
- ESCO overlap can suggest **search vocabulary** but cannot determine whether a person is suitable for a job. The user must review the source sentence and query.
- Phrase extraction and Boolean checks are **deterministic**, not a generative-AI API. We are not representing this release as running an LLM. An optional, auditable LLM enhancement is a future feature.

Official source: https://esco.ec.europa.eu/en/use-esco/download

## Privacy & ethics

- Job descriptions are processed in the browser; ScoutForge does not upload them or persist them to a server. The public website has no candidate account or profile database.
- Users should not paste personal candidate records, private CVs, or confidential recruiting data into the public demo.
- Outreach text is an **unsent, editable starting template** with explicit personalization placeholders; it does not claim knowledge of a candidate or employer.
- No LinkedIn scraping, candidate ranking, automated outreach, recruitment decision making, or claims of legal compliance certification.
- All data-based statements are bounded by a source, observable behavior or repeatable test; no fabricated recruiting KPIs.

## Development and tests

```bash
python -m http.server 8080 --directory web
# visit http://localhost:8080
```

The tracked `web/data/esco.json` is generated through the **Build verified ESCO snapshot** GitHub Action. For a fresh checkout with no local snapshot, the app explains missing ontology data and supports manually entered search terms.

```bash
npm test
npm run check
python -m unittest discover -s tests -p 'test_*.py' -v
python tests/browser_smoke.py
```

The GitHub Actions browser test serves the actual module files over local HTTP, injects **clearly labeled test taxonomy fixtures** only in CI, then exercises the entire three-step workflow at desktop and mobile widths, including syntax edits, data provenance, optional graph, and exports. A restricted local sandbox uses an equivalent inline script path when localhost connections are blocked.

## Release plan

- **v0.2 shipped:** simplified UI, real taxonomy query evaluation, robust Boolean parser, recruiter-approved export, editable outreach starter, desktop/mobile browser tests.
- **Next:** evaluate role extraction on a manually annotated JD set; publish precision/recall and false-positive examples.
- **Later:** optional secure server-side generative-AI assistance with prompt evaluation, request limits and meaningful user consent; more thorough labor-market source connections; native `.xlsx` workflow tracker.

## Licensing

Project code: MIT (`LICENSE`). ESCO-derived content retains the source-specific European Commission reuse conditions. No third-party trademarks or logos are granted.