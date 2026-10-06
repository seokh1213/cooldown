import io
import tarfile
import unittest
from backup_artifacts import validate_members


class BackupArtifactsTest(unittest.TestCase):
    def check_archive(self, member):
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode="w") as target: target.addfile(member)
        stream.seek(0)
        with tarfile.open(fileobj=stream) as archive: validate_members(archive, "retrieval")

    def test_rejects_path_traversal(self):
        with self.assertRaisesRegex(ValueError, "Unsafe"):
            self.check_archive(tarfile.TarInfo("checkpoints/retrieval/../../escaped"))

    def test_rejects_symlink(self):
        member = tarfile.TarInfo("checkpoints/retrieval/step-1/link")
        member.type = tarfile.SYMTYPE; member.linkname = "/outside"
        with self.assertRaisesRegex(ValueError, "Unsafe"): self.check_archive(member)

    def test_rejects_other_stage(self):
        with self.assertRaisesRegex(ValueError, "Unexpected"):
            self.check_archive(tarfile.TarInfo("checkpoints/quantized/step-1/training.pt"))


if __name__ == "__main__": unittest.main()
