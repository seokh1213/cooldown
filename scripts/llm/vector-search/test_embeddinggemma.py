import copy
from types import SimpleNamespace
import unittest

import numpy as np
from embeddinggemma_eval import calibrate, gpu_gate, metrics, split, validate_vectors
from embeddinggemma_runtime import Encoder, input_digest, texts
from embeddinggemma_run import compact_predictions


class RetrievalEvaluationTests(unittest.TestCase):
    def test_partial_or_duplicate_predictions_cannot_be_published(self):
        snapshot = {"rows": [{}, {}]}
        with self.assertRaisesRegex(ValueError, "partial"):
            compact_predictions(snapshot, {"qwen": [{"index": 0}]}, {})
        with self.assertRaisesRegex(ValueError, "duplicate"):
            compact_predictions(snapshot, {"qwen": [{"index": 0}, {"index": 0}]}, {})

    def test_partial_or_nonfinite_embeddings_cannot_be_scored(self):
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            validate_vectors(np.ones((1, 2)), 2, 2)
        with self.assertRaisesRegex(ValueError, "invalid"):
            validate_vectors(np.array([[np.nan, 0]]), 1, 2)
        with self.assertRaisesRegex(ValueError, "normalized"):
            validate_vectors(np.array([[2., 0]]), 1, 2)
        validate_vectors(np.array([[1., 0]]), 1, 2)

    def test_document_groups_never_cross_dev_and_test(self):
        rows = [{"bank": "main", "gold": ["rule:점화"], "q": question} for question in ["점화", "ignite", "点燃"]]
        self.assertEqual(len({split(row) for row in rows}), 1)
        self.assertEqual(split({"bank": "real"}), "real")

    def test_wrong_answers_are_distinct_from_missed_answers(self):
        rows = [{"gold": gold} for gold in [["a"], ["b"], [], ["a"]]]
        cases = [{"top3": ["a"], "rawTop3": ["a"], "score": score} for score in [.8, .8, .1, .1]]
        result = metrics(rows, cases, range(4), .5)
        self.assertEqual(result["correct"], 2)
        self.assertEqual(result["wrongAnswer"], 1)
        self.assertEqual(result["missedAnswer"], 1)
        self.assertEqual(result["correctAbstention"], 1)

    def test_abstaining_with_irrelevant_suggestions_is_reported_separately(self):
        result = metrics([{"gold": []}], [{"top3": ["a"], "rawTop3": ["a"], "score": .6}], [0], .8)
        self.assertEqual(result["correctAbstention"], 1)
        self.assertEqual(result["noAnswerRelated"], 1)

    def test_calibration_ignores_heldout_labels_and_respects_wrong_cap(self):
        rows = [{"gold": ["a"]}, {"gold": []}, {"gold": ["a"]}]
        cases = [{"top3": ["a"], "rawTop3": ["a"], "score": score} for score in [.9, .6, .7]]
        threshold, dev = calibrate(rows, cases, [0, 1], 0)
        changed = copy.deepcopy(rows)
        changed[2]["gold"] = []
        self.assertEqual(calibrate(changed, cases, [0, 1], 0), (threshold, dev))
        self.assertEqual(threshold, .9)
        self.assertEqual(dev["wrongAnswer"], 0)

    def test_calibration_can_choose_complete_abstention(self):
        rows = [{"gold": []}]
        cases = [{"top3": ["a"], "rawTop3": ["a"], "score": .8}]
        threshold, dev = calibrate(rows, cases, [0], 0)
        self.assertTrue(np.isinf(threshold))
        self.assertEqual(dev["correct"], 1)

    def test_webgpu_gate_rejects_faster_model_with_more_wrong_answers(self):
        baseline = {"testUsable": {"correct": 90, "wrongAnswer": 5, "recall3Hits": 94}, "directEligible": {"correct": 20}}
        candidate = copy.deepcopy(baseline)
        candidate["testUsable"].update(correct=92, wrongAnswer=6)
        limits = {
            "minimumAdditionalCorrect": 1, "maximumAdditionalWrong": 0, "maximumRecall3Regression": 0,
            "maximumDirectCorrectRegression": 0, "maximumQueryP90Seconds": 2, "maximumPeakRssMiB": 4096,
            "maximumCombinedDownloadMb": 1000,
        }
        result = gpu_gate(baseline, candidate, limits, {"querySeconds": {"p90": .1}, "peakRssMiB": 500, "combinedMb": 817})
        self.assertFalse(result["pass"])
        self.assertFalse(result["checks"]["heldoutWrong"])

    def test_text_only_gemma_has_zero_multimodal_tokens(self):
        encoder = Encoder.__new__(Encoder)
        encoder.model = "gemma"
        encoder.inputs = [SimpleNamespace(name=name) for name in ["input_ids", "attention_mask", "image_features", "video_features", "audio_features"]]
        feed = encoder.feed([2, 42, 1])
        self.assertEqual(feed["input_ids"].tolist(), [[2, 42, 1]])
        for name in ["image_features", "video_features", "audio_features"]:
            self.assertEqual(feed[name].shape, (0, 512))

    def test_qwen_retrieval_disables_judge_and_qa_adapters(self):
        encoder = Encoder.__new__(Encoder)
        encoder.model = "qwen"
        encoder.inputs = [SimpleNamespace(name=name) for name in ["lora_scale", "embed_scale", "qa_scale"]]
        feed = encoder.feed([1])
        self.assertEqual({key: float(value) for key, value in feed.items()}, {"lora_scale": 0, "embed_scale": 1, "qa_scale": 0})

    def test_models_receive_same_document_content_and_gemma_task_prefix(self):
        snapshot = {"docs": {"ko_KR": [{"id": "a", "title": "제목", "text": "본문"}]}, "rows": [{"q": "질문", "searchLang": "ko_KR"}]}
        gemma = texts(snapshot, "gemma")
        qwen = texts(snapshot, "qwen")
        self.assertEqual(gemma[0]["text"], "title: 제목 | text: 본문")
        self.assertIn("제목\n본문", qwen[0]["text"])
        self.assertEqual(gemma[1]["text"], "task: search result | query: 질문")

    def test_checkpoint_input_digest_ignores_labels_but_detects_changed_text(self):
        snapshot = {"docs": {"ko_KR": [{"id": "a", "title": "제목", "text": "본문"}]}, "rows": [{"q": "질문", "searchLang": "ko_KR", "gold": ["a"]}]}
        changed = copy.deepcopy(snapshot)
        changed["rows"][0]["gold"] = []
        self.assertEqual(input_digest(snapshot, "gemma"), input_digest(changed, "gemma"))
        changed["rows"][0]["q"] = "다른 질문"
        self.assertNotEqual(input_digest(snapshot, "gemma"), input_digest(changed, "gemma"))


if __name__ == "__main__":
    unittest.main()
