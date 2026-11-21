"""Release build: fingerprinted assets, resolved imports, no raw ESCO dump, no external hosts."""
import json
import re
import tempfile
import unittest
from pathlib import Path

from scripts.build_site import build_site, module_imports

ROOT = Path(__file__).resolve().parent.parent


class BuildSiteTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = Path(self.tmp.name) / "release"
        self.assets = build_site(ROOT / "web", self.out)

    def tearDown(self):
        self.tmp.cleanup()

    def test_every_asset_is_fingerprinted_and_referenced(self):
        html = (self.out / "index.html").read_text()
        self.assertIn(f'href="{self.assets["styles.css"]}"', html)
        self.assertIn(f'src="js/{self.assets["js/app.js"]}"', html)
        self.assertNotIn('src="js/app.js"', html)
        for rel, name in self.assets.items():
            self.assertRegex(name, r"\.[0-9a-f]{12}\.(js|css)$")
        self.assertFalse((self.out / "styles.css").exists())
        self.assertEqual(sorted(p.name for p in (self.out / "js").glob("*.js")), sorted(v for k, v in self.assets.items() if k.startswith("js/")))

    def test_imports_point_to_fingerprinted_modules_that_exist(self):
        for path in (self.out / "js").glob("*.js"):
            for dep in module_imports(path.read_text()):
                self.assertRegex(dep, r"\.[0-9a-f]{12}\.js$", f"{path.name} imports unhashed {dep}")
                self.assertTrue((self.out / "js" / dep).is_file(), dep)

    def test_raw_esco_snapshot_is_not_published_but_index_is(self):
        self.assertFalse((self.out / "data" / "esco.json").exists())
        self.assertTrue((self.out / "data" / "esco-index.json").is_file())
        self.assertTrue((self.out / "data" / "eval.json").is_file())

    def test_no_external_hosts_in_page_or_styles(self):
        html = (self.out / "index.html").read_text()
        css = (self.out / self.assets["styles.css"]).read_text()
        for text in (html, css):
            self.assertNotRegex(text, r"fonts\.googleapis|fonts\.gstatic|cdn\.|unpkg|jsdelivr")
        for m in re.finditer(r"url\('([^']+)'\)", css):
            self.assertTrue((self.out / m.group(1)).is_file(), m.group(1))

    def test_manifest(self):
        manifest = json.loads((self.out / "asset-manifest.json").read_text())
        self.assertEqual(manifest["release_format"], 2)
        self.assertEqual(manifest["assets"], self.assets)


if __name__ == "__main__":
    unittest.main()
