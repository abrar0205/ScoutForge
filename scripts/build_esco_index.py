#!/usr/bin/env python3
"""Build the compact ESCO skill index the browser loads (web/data/esco-index.json).

Only multi-word labels and aliases of at least 10 characters are kept, because
single words ("communication", "engineering") produce false matches. The index
is derived from the pinned ESCO v1.2.0 snapshot in web/data/esco.json.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def phrases(skill: dict) -> list[str]:
    raw = [skill.get("name", "")] + str(skill.get("alt", "")).replace("|", "\n").splitlines()
    out, seen = [], set()
    for p in raw:
        p = " ".join(p.strip().split())
        key = p.lower()
        if len(p) >= 10 and len(p.split()) >= 2 and key not in seen:
            seen.add(key)
            out.append(p)
    return out


def build_index(esco: dict) -> dict:
    skills = []
    for s in esco.get("skills", []):
        ps = phrases(s)
        if ps:
            sid = s["id"].rsplit("/", 1)[-1]
            name = s["name"] if s["name"] in ps else ps[0]
            skills.append([sid, name] + [p.lower() for p in ps if p != name][:6])
    return {
        "source": esco.get("source"), "version": esco.get("version"),
        "derived_from": "web/data/esco.json", "rule": "multi-word phrases of 10+ characters only",
        "count": len(skills), "skills": skills,
    }


def main(argv: list[str]) -> int:
    src = Path(argv[1]) if len(argv) > 1 else ROOT / "web" / "data" / "esco.json"
    dst = Path(argv[2]) if len(argv) > 2 else ROOT / "web" / "data" / "esco-index.json"
    index = build_index(json.loads(src.read_text(encoding="utf-8")))
    dst.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"ESCO index: {index['count']} skills -> {dst} ({dst.stat().st_size:,} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
