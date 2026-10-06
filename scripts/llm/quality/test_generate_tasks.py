import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace
from generate_tasks import generate_all, validate_packet, backup_publisher


class GenerationRecoveryTest(unittest.TestCase):
    def packet(self):
        tasks = [{"id": "first", "prompt": "문서"}, {"id": "second", "prompt": "question"}]
        encoded = json.dumps(tasks, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()
        return {"schema": 1, "taskHash": hashlib.sha256(encoded).hexdigest(), "tasks": tasks}

    def test_interrupted_generation_resumes_only_missing_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "result.json"
            def interrupted(task):
                if task["id"] == "second":
                    raise RuntimeError("session disconnected")
                return "3초", 1
            identity = {"revision": "fixed"}
            with self.assertRaises(RuntimeError):
                generate_all(self.packet(), output, interrupted, {"model": identity})
            called = []
            result = generate_all(self.packet(), output, lambda task: (called.append(task["id"]) or "4초", 1), {"model": identity})
            self.assertEqual(called, ["second"])
            self.assertEqual(len(result["rows"]), 2)
            with self.assertRaisesRegex(ValueError, "model changed"):
                generate_all(self.packet(), output, interrupted, {"model": {"revision": "new"}})

    def test_modified_or_duplicate_tasks_are_rejected(self):
        packet = self.packet()
        packet["tasks"][0]["prompt"] = "changed"
        with self.assertRaisesRegex(ValueError, "fingerprint"):
            validate_packet(packet)

    def test_new_run_clears_old_completion_before_publishing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "GPU_DONE").write_text("old completed run")
            output = root / "result.json"
            output.write_text('{"rows": []}')
            calls = []
            with patch.dict("sys.modules", {"checkpoints": SimpleNamespace(publish=lambda *args: calls.append(args))}):
                publish = backup_publisher(root, output)
                self.assertFalse((root / "GPU_DONE").exists())
                publish(1, force=True)
                self.assertEqual(len(calls), 1)
                self.assertTrue((root / "checkpoints/generation-native.tar.gz").exists())


if __name__ == "__main__":
    unittest.main()
