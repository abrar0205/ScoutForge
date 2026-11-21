"""Regression protection against mixed-release CSS / JS on GitHub Pages."""
import re
import tempfile
import unittest
from pathlib import Path
from scripts.build_site import build_site

ROOT = Path(__file__).resolve().parent.parent


class BuildSiteTests(unittest.TestCase):
    def test_all_frontend_assets_are_fingerprinted_and_imports_resolve(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'release'
            m = build_site(ROOT / 'web', out)
            self.assertEqual(set(m), {'styles.css', 'app.js', 'engine.js', 'xlsx.js'})
            html = (out / 'index.html').read_text()
            app = (out / m['app.js']).read_text()
            css = (out / m['styles.css']).read_text()
            for asset in m.values():
                self.assertTrue((out / asset).is_file())
                self.assertRegex(asset, r'\.[0-9a-f]{12}\.(?:js|css)$')
            self.assertIn(f'href="{m["styles.css"]}"', html)
            self.assertIn(f'src="{m["app.js"]}"', html)
            self.assertIn(f"from './{m['engine.js']}'", app)
            self.assertIn(f"from './{m['xlsx.js']}'", app)
            self.assertIn('--bg:#f6f7fa', css)
            self.assertNotIn('src="app.js"', html)
            self.assertNotIn('href="styles.css"', html)
            self.assertFalse((out / 'styles.css').exists())
            self.assertFalse((out / 'app.js').exists())

    def test_css_change_changes_release_filename(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / 'source'
            import shutil
            shutil.copytree(ROOT / 'web', source)
            a = build_site(source, Path(tmp) / 'r1')
            with (source / 'styles.css').open('a') as f:
                f.write('\n/* stylesheet update */\n')
            b = build_site(source, Path(tmp) / 'r2')
            self.assertNotEqual(a['styles.css'], b['styles.css'])
            self.assertEqual(a['app.js'], b['app.js'])

    def test_app_change_changes_release_filename(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / 'source'
            import shutil
            shutil.copytree(ROOT / 'web', source)
            a = build_site(source, Path(tmp) / 'r1')
            with (source / 'app.js').open('a') as f:
                f.write('\n// release update\n')
            b = build_site(source, Path(tmp) / 'r2')
            self.assertNotEqual(a['app.js'], b['app.js'])


if __name__ == '__main__':
    unittest.main()