import json
import unittest
from pathlib import Path

from scripts.build_esco_index import build_index, phrases

ROOT = Path(__file__).resolve().parent.parent


class EscoIndexTests(unittest.TestCase):
    def test_only_multi_word_phrases(self):
        self.assertEqual(phrases({"name": "communication", "alt": "communicate\nverbal communication skills"}), ["verbal communication skills"])
        self.assertEqual(phrases({"name": "maintain electrical equipment", "alt": ""}), ["maintain electrical equipment"])

    def test_committed_index_matches_snapshot(self):
        esco = json.loads((ROOT / "web/data/esco.json").read_text(encoding="utf-8"))
        committed = json.loads((ROOT / "web/data/esco-index.json").read_text(encoding="utf-8"))
        self.assertEqual(build_index(esco), committed, "Run python scripts/build_esco_index.py")
        for entry in committed["skills"]:
            for p in entry[1:]:
                self.assertGreaterEqual(len(p.split()), 2, p)


if __name__ == "__main__":
    unittest.main()
