import json
from pathlib import Path
import tempfile
import unittest
from evaluate_sft_followup import collect_summary, infer, verify_inputs


class FollowupSummaryTest(unittest.TestCase):
    def test_a_coincidental_number_from_the_wrong_document_is_not_grounded_correct(self):
        row = {"variant": "sft", "cohort": "new", "correct": True, "answerable": True,
               "kind": "supported", "factGroup": "fact-1", "error": None,
               "verbatimScalar": True, "goldDocumentReached": False}
        result = collect_summary([row], "app")["variants"]["sft"]
        self.assertEqual(result["new"]["correct"], 1)
        self.assertEqual(result["groundedExact"], 0)
        self.assertEqual(result["sourceReached"], 0)

    def test_no_app_evidence_abstains_without_running_a_model(self):
        self.assertEqual(infer(None, None, {"context": ""}, None), ("NOT_FOUND", 0))

    def test_resume_rejects_changed_dataset(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); (root / "data").mkdir(); (root / "results").mkdir()
            dataset = root / "data/qa-followup.jsonl"; dataset.write_text("first input")
            baseline = root / "base.onnx"; baseline.write_bytes(b"base graph")
            candidate = root / "candidate.onnx"; candidate.write_bytes(b"candidate graph")
            metadata = {"baselineGraph": str(baseline), "candidateGraph": str(candidate)}
            verify_inputs(root, metadata, "provided")
            original = json.loads((root / "results/provided-inputs.json").read_text())
            dataset.write_text("changed input")
            with self.assertRaises(ValueError): verify_inputs(root, metadata, "provided")
            self.assertEqual(json.loads((root / "results/provided-inputs.json").read_text()), original)


if __name__ == "__main__": unittest.main()
