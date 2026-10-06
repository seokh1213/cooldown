from pathlib import Path
import json
import tempfile
import unittest
from unittest.mock import patch
from collect_checkpoints import configured_stages, finish_if_collected
from artifact_io import sha256


def final_receipts(root):
    receipts = {}
    for key in ["retrieval-results", "quantized-results"]:
        directory = root / key
        directory.mkdir()
        file = directory / "artifact.tar.gz"
        file.write_bytes(b"previously verified archive")
        receipts[key] = {"restored": str(directory / "restored"), "sha256": sha256(file), "verified": True}
    return receipts


def remote_download(index):
    def transfer(metadata, operation, paths=None):
        if operation == "download" and paths["remote"].endswith("backup-index.json"):
            file = Path(paths["local"])
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text(json.dumps(index))
    return transfer


class CollectorCompletionTest(unittest.TestCase):
    def test_custom_sft_results_do_not_require_unrelated_experiments(self):
        with tempfile.TemporaryDirectory() as temporary:
            receipts = final_receipts(Path(temporary))
            metadata = {"work": temporary, "checkpointStages": ["retrieval-results"],
                        "requiredResults": ["retrieval-results"]}
            with patch("collect_checkpoints.latest_receipts", return_value=receipts), \
                 patch("collect_checkpoints.transfer", side_effect=remote_download(receipts)) as transfer:
                self.assertTrue(finish_if_collected(metadata))
                self.assertEqual([call.args[1] for call in transfer.call_args_list], ["download", "download", "stop"])

    def test_missing_custom_result_keeps_runtime(self):
        metadata = {"work": "/unused", "checkpointStages": ["sft-qwen35-results", "sft-lfm25-results"],
                    "requiredResults": ["sft-qwen35-results", "sft-lfm25-results"]}
        with patch("collect_checkpoints.latest_receipts", return_value={"sft-qwen35-results": {}}), \
             patch("collect_checkpoints.transfer") as transfer:
            self.assertFalse(finish_if_collected(metadata))
            transfer.assert_not_called()

    def test_invalid_custom_stage_or_unregistered_result_is_rejected(self):
        for metadata in [{"checkpointStages": ["../escape"]},
                         {"checkpointStages": ["sft"], "requiredResults": ["unknown"]},
                         {"requiredResults": []}]:
            with self.subTest(metadata=metadata), self.assertRaises(ValueError):
                configured_stages(metadata)

    def test_never_stops_runtime_without_both_verified_results(self):
        with patch("collect_checkpoints.latest_receipts", return_value={"retrieval-results": {}}), \
             patch("collect_checkpoints.transfer") as transfer:
            self.assertFalse(finish_if_collected({"work": "/unused"}))
            transfer.assert_not_called()

    def test_completed_and_verified_job_stops_after_done_marker(self):
        with tempfile.TemporaryDirectory() as temporary:
            receipts = final_receipts(Path(temporary))
            self.verify_completed(temporary, receipts)

    def verify_completed(self, temporary, receipts):
        with patch("collect_checkpoints.latest_receipts", return_value=receipts), \
             patch("collect_checkpoints.transfer", side_effect=remote_download(receipts)) as transfer:
            self.assertTrue(finish_if_collected({"work": temporary}))
            self.assertEqual([call.args[1] for call in transfer.call_args_list], ["download", "download", "stop"])
            self.assertTrue((Path(temporary) / "gpu-cleanup.json").exists())

    def test_corrupt_final_file_refuses_runtime_shutdown(self):
        with tempfile.TemporaryDirectory() as temporary:
            receipts = final_receipts(Path(temporary))
            (Path(temporary) / "retrieval-results/artifact.tar.gz").write_bytes(b"corrupt")
            with patch("collect_checkpoints.latest_receipts", return_value=receipts), \
                 patch("collect_checkpoints.transfer", side_effect=remote_download(receipts)) as transfer:
                with self.assertRaisesRegex(ValueError, "checksum"):
                    finish_if_collected({"work": temporary})
                self.assertEqual(transfer.call_count, 2)

    def test_final_publish_after_download_keeps_gpu_until_latest_archive_is_local(self):
        with tempfile.TemporaryDirectory() as temporary:
            receipts = final_receipts(Path(temporary))
            final = {key: {**entry} for key, entry in receipts.items()}
            final["retrieval-results"]["sha256"] = "new-final-archive"
            with patch("collect_checkpoints.latest_receipts", return_value=receipts), \
                 patch("collect_checkpoints.transfer", side_effect=remote_download(final)) as transfer:
                self.assertFalse(finish_if_collected({"work": temporary}))
                self.assertNotIn("stop", [call.args[1] for call in transfer.call_args_list])
                self.assertFalse((Path(temporary) / "gpu-cleanup.json").exists())

    def test_missing_final_manifest_stage_keeps_gpu(self):
        with tempfile.TemporaryDirectory() as temporary:
            receipts = final_receipts(Path(temporary))
            with patch("collect_checkpoints.latest_receipts", return_value=receipts), \
                 patch("collect_checkpoints.transfer", side_effect=remote_download({})) as transfer:
                self.assertFalse(finish_if_collected({"work": temporary}))
                self.assertNotIn("stop", [call.args[1] for call in transfer.call_args_list])

    def test_missing_done_marker_keeps_runtime(self):
        with patch("collect_checkpoints.latest_receipts", return_value={"retrieval-results": {}, "quantized-results": {}}), \
             patch("collect_checkpoints.transfer", side_effect=ConnectionError) as transfer:
            self.assertFalse(finish_if_collected({"work": "/unused"}))
            self.assertEqual(transfer.call_count, 1)


if __name__ == "__main__": unittest.main()
