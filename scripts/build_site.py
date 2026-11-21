"""Produce an atomic, cache-safe static release for GitHub Pages.

Static assets are content-fingerprinted so HTML from one release cannot load
CSS or JavaScript cached from an incompatible previous release. No CDN or secret
is needed. The source directory is never modified.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def checksum(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:12]


def build_site(source: Path, destination: Path) -> dict:
    source = source.resolve()
    destination = destination.resolve()
    if not (source / "index.html").is_file():
        raise FileNotFoundError(f"ScoutForge source index is missing: {source}")
    if destination == source or destination in source.parents:
        raise ValueError("Output must not replace the source")
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(source, destination)

    manifest = {}
    for asset in ("engine.js", "xlsx.js"):
        original = destination / asset
        content = original.read_bytes()
        revised = f"{original.stem}.{checksum(content)}{original.suffix}"
        original.rename(destination / revised)
        manifest[asset] = revised

    original = destination / "app.js"
    content = original.read_text(encoding="utf-8")
    for base in ("engine.js", "xlsx.js"):
        old = f"from './{base}'"
        if old not in content:
            raise ValueError(f"Expected ESM import missing: {old}")
        content = content.replace(old, f"from './{manifest[base]}'")
    new_app = f"app.{checksum(content.encode('utf-8'))}.js"
    (destination / new_app).write_text(content, encoding="utf-8")
    original.unlink()
    manifest["app.js"] = new_app

    original = destination / "styles.css"
    css = original.read_bytes()
    new_css = f"styles.{checksum(css)}.css"
    original.rename(destination / new_css)
    manifest["styles.css"] = new_css

    index = destination / "index.html"
    html = index.read_text(encoding="utf-8")
    css_tag = '<link rel="stylesheet" href="styles.css"/>'
    app_tag = '<script type="module" src="app.js"></script>'
    if html.count(css_tag) != 1 or html.count(app_tag) != 1:
        raise ValueError("Expected single CSS/module reference in index.html")
    html = html.replace(css_tag, f'<link rel="stylesheet" href="{new_css}"/>')
    html = html.replace(app_tag, f'<script type="module" src="{new_app}"></script>')
    index.write_text(html, encoding="utf-8")

    for output in manifest.values():
        if not (destination / output).is_file():
            raise AssertionError(f"Release references missing asset: {output}")
    (destination / "asset-manifest.json").write_text(
        json.dumps({"release_format": 1, "assets": manifest}, indent=2) + "\n", encoding="utf-8"
    )
    return manifest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', type=Path, default=ROOT / 'web')
    ap.add_argument('--output', type=Path, default=ROOT / '_site')
    args = ap.parse_args()
    manifest = build_site(args.source, args.output)
    print('ScoutForge static release prepared:', json.dumps(manifest, sort_keys=True))


if __name__ == '__main__':
    main()