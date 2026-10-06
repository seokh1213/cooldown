from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from resume_checkpoints import upload_archive


class ResumeTransferTest(unittest.TestCase):
    def test_chunk_upload_preserves_all_bytes_including_partial_last_chunk(self):
        with tempfile.TemporaryDirectory() as temporary:
            file = Path(temporary) / "archive.tar.gz"
            original = bytes(range(256)) * 3 + b"last"
            file.write_bytes(original)
            uploaded = []
            def receive(metadata, operation, paths):
                self.assertEqual(operation, "upload")
                uploaded.append(Path(paths["local"]).read_bytes())
            with patch("resume_checkpoints.transfer", receive):
                parts = upload_archive({"work": temporary}, file, "retrieval", block_size=256)
            self.assertEqual(len(parts), 4)
            self.assertTrue(all(len(block) <= 256 for block in uploaded))
            self.assertEqual(b"".join(uploaded), original)


if __name__ == "__main__": unittest.main()
