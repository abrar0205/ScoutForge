# ScoutForge · AI Sourcing Intelligence

**Independent research/portfolio tool. Not affiliated with Tesla, LinkedIn, or the European Commission.**

A recruiter-controlled sourcing strategy workbench. Transform an actual job description into auditable requirements, explore verifiable occupation–skill relationships, compare Boolean sourcing strategies with **SearchTwin**, and export a sourcing dossier. No candidate scraping, ranking or automated outreach.

## Product status

Release 0.1: browser-first workbench with deterministic phrase extraction, verified ESCO graph data generated on GitHub Actions, Boolean query compiler, search strategy comparison, editable reviewer controls, and a local dossier export. AI API integration is explicitly planned, **not presented as implemented**. Sourcing quality requires independent recruiter evaluation; there is no access to LinkedIn Recruiter and no candidate supply metrics.

## Run locally

```bash
python -m http.server 8080 --directory web
# open http://localhost:8080
```

When `web/data/esco.json` is not present, the UI explains that the verified dataset has not been published and disables ontology-dependent features. The `ESCO snapshot` GitHub Action builds this file by downloading the real European Commission ESCO v1.2.0 CSVs from an immutable GitHub mirror commit. Data provenance and source revision are embedded in JSON; these are actual taxonomy relationships, not candidate rankings.

## Privacy and provenance

- Job descriptions are processed **within the visitor's browser**, never uploaded by ScoutForge; no identifiable candidate data should be entered.
- Source: European Commission ESCO v1.2.0 via pinned mirror. The latest Commission release is newer; a migration is planned. See [`scripts/build_esco.py`](scripts/build_esco.py) and [ESCO official downloads](https://esco.ec.europa.eu/en/use-esco/download).
- Reuse acknowledgement: **This application uses the ESCO classification of the European Commission.**
- ESCO occupation–skill relationships can suggest **search pathways**. They do not prove that any person has a skill, is available, or should be hired.
- No fake recruiting KPIs, fictitious candidate records, or promised hiring outcomes.

## Roadmap

- Benchmark JD extraction and Boolean search quality against manually annotated public job descriptions.
- Add opt-in, rate-limited, server-side LLM extraction and outreach drafting with evaluator.
- Generate native Excel workbooks, campaign operations, public market snapshots with strict time/geography/provenance metadata.
- Add full browser CI, accessibility tests, and recruiter task studies.

## License

Project source code MIT (see LICENSE). ESCO-derived data retains its source-specific European Commission reuse conditions. No third-party trademark rights are granted.