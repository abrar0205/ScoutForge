# ScoutForge release notes

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