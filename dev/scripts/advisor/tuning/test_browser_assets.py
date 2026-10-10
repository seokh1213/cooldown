from pathlib import Path
import tempfile
import unittest
from serve_base_browser import contained_file


class BrowserAssetTest(unittest.TestCase):
    def test_only_resolves_assets_inside_declared_directory(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.assertEqual(contained_file(root, "lfm25/tokenizer.json"), root.resolve() / "lfm25/tokenizer.json")
            for unsafe in ["../sessions.json", "/tmp/sessions.json"]:
                with self.assertRaises(ValueError): contained_file(root, unsafe)

    def test_symlink_cannot_expose_an_outside_configuration(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); allowed = root / "models"; allowed.mkdir()
            (root / "private.json").write_text("{}")
            (allowed / "tokenizer.json").symlink_to(root / "private.json")
            with self.assertRaises(ValueError): contained_file(allowed, "tokenizer.json")


if __name__ == "__main__": unittest.main()
