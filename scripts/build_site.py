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

    # Generate privacy-safe, indexed synthetic talent data from the same
    # pinned, previously verified ESCO snapshot used by the live workbench.
    esco_file = destination / "data" / "esco.json"
    if esco_file.is_file():
        import sys
        sys.path.insert(0, str(ROOT))
        from scripts.build_talent import generate, write_sqlite
        graph = json.loads(esco_file.read_text(encoding="utf-8"))
        catalog = generate(graph)
        (destination / "data" / "talent-sandbox.json").write_text(
            json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
        )
        write_sqlite(catalog, destination / "data" / "talent-sandbox.sqlite")
        print("Built ESCO-derived fictional talent sandbox:", catalog["counts"])

    manifest = {}
    for asset in ("engine.js", "xlsx.js", "talent.js"):
        original = destination / asset
        content = original.read_bytes()
        revised = f"{original.stem}.{checksum(content)}{original.suffix}"
        original.rename(destination / revised)
        manifest[asset] = revised

    # Fingerprint talent-ui after rewriting the two dependencies it imports.
    ui_path = destination / "talent-ui.js"
    talent_ui = ui_path.read_text(encoding="utf-8")
    for dep in ("talent.js", "engine.js"):
        old = f"from './{dep}'"
        if old not in talent_ui:
            raise ValueError(f"Expected talent-ui ESM import missing: {old}")
        talent_ui = talent_ui.replace(old, f"from './{manifest[dep]}'")
    ui_name = f"talent-ui.{checksum(talent_ui.encode('utf-8'))}.js"
    (destination / ui_name).write_text(talent_ui, encoding="utf-8")
    ui_path.unlink()
    manifest["talent-ui.js"] = ui_name

    original = destination / "app.js"
    content = original.read_text(encoding="utf-8")
    for base in ("engine.js", "xlsx.js", "talent-ui.js"):
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