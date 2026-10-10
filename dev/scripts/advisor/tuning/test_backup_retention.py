import json
from pathlib import Path
import tempfile
import unittest
from backup_artifacts import prune


class BackupRetentionTest(unittest.TestCase):
    def test_keeps_three_newest_verified_copies_and_unverified_download(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for step in range(5):
                directory = root / f"copy-{step}"
                directory.mkdir()
                (directory / "receipt.json").write_text(json.dumps({"publishedAt": str(step)}))
            (root / "incomplete").mkdir()
            prune(root)
            self.assertEqual({file.name for file in root.iterdir()}, {"copy-2", "copy-3", "copy-4", "incomplete"})


if __name__ == "__main__": unittest.main()
