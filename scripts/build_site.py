"""Produce an atomic, cache-safe static release for GitHub Pages.

Every JavaScript module in web/js and the stylesheet are content-fingerprinted.
Imports between modules are rewritten in dependency order, so a module's hash
also covers the exact versions of everything it imports: HTML from one release
can never run with CSS or JavaScript cached from another. The raw ESCO snapshot
(web/data/esco.json) is a build input only and is not published. No CDN, no
secrets; the source directory is never modified.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMPORT_RE = re.compile(r"""(from\s+|import\s*\(\s*)(['"])\./([A-Za-z0-9_-]+\.js)\2""")
NOT_PUBLISHED = {Path("data/esco.json")}


def checksum(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:12]


def module_imports(source: str) -> list[str]:
    return [m.group(3) for m in IMPORT_RE.finditer(source)]


def build_site(source: Path, destination: Path) -> dict:
    source = source.resolve()
    destination = destination.resolve()
    if not (source / "index.html").is_file():
        raise FileNotFoundError(f"ScoutForge source index is missing: {source}")
    if destination == source or destination in source.parents or source in destination.parents:
        raise ValueError("Output must be outside the source directory")
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(source, destination)
    for rel in NOT_PUBLISHED:
        (destination / rel).unlink(missing_ok=True)

    js_dir = destination / "js"
    modules = {p.name: p.read_text(encoding="utf-8") for p in sorted(js_dir.glob("*.js"))}
    for name, text in modules.items():
        for dep in module_imports(text):
            if dep not in modules:
                raise ValueError(f"{name} imports missing module {dep}")

    manifest: dict[str, str] = {}
    visiting: set[str] = set()

    def fingerprint(name: str) -> str:
        if name in manifest:
            return manifest[name]
        if name in visiting:
            raise ValueError(f"Circular import involving {name}")
        visiting.add(name)
        text = modules[name]
        for dep in sorted(set(module_imports(text))):
            hashed = fingerprint(dep)
            text = re.sub(rf"""(from\s+|import\s*\(\s*)(['"])\./{re.escape(dep)}\2""", rf"\1\2./{hashed}\2", text)
        out = f"{name[:-3]}.{checksum(text.encode('utf-8'))}.js"
        (js_dir / out).write_text(text, encoding="utf-8")
        (js_dir / name).unlink()
        visiting.discard(name)
        manifest[f"js/{name}"] = out
        manifest[name] = out
        return out

    for name in modules:
        fingerprint(name)

    css_path = destination / "styles.css"
    css = css_path.read_bytes()
    css_out = f"styles.{checksum(css)}.css"
    css_path.rename(destination / css_out)

    index = destination / "index.html"
    html = index.read_text(encoding="utf-8")
    css_tag = '<link rel="stylesheet" href="styles.css">'
    app_tag = '<script type="module" src="js/app.js"></script>'
    if html.count(css_tag) != 1 or html.count(app_tag) != 1:
        raise ValueError("Expected exactly one stylesheet and one app module reference in index.html")
    html = html.replace(css_tag, f'<link rel="stylesheet" href="{css_out}">')
    html = html.replace(app_tag, f'<script type="module" src="js/{manifest["app.js"]}"></script>')
    index.write_text(html, encoding="utf-8")

    assets = {"styles.css": css_out, **{k: v for k, v in manifest.items() if k.startswith("js/")}}
    for rel, out in assets.items():
        target = destination / out if rel == "styles.css" else js_dir / out
        if not target.is_file():
            raise AssertionError(f"Release references missing asset: {out}")
    (destination / "asset-manifest.json").write_text(
        json.dumps({"release_format": 2, "assets": assets}, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return assets


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", type=Path, default=ROOT / "web")
    ap.add_argument("--output", type=Path, default=ROOT / "_site")
    args = ap.parse_args()
    assets = build_site(args.source, args.output)
    print("ScoutForge static release prepared:", json.dumps(assets, sort_keys=True))


if __name__ == "__main__":
    main()
