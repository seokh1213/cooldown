"""모델 호출 없이 재판정의 입력 격리와 기각 조건을 검증한다."""
import importlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

review = importlib.import_module("evaluate-request-review")


class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.cache = patch.object(review, "CACHE", Path(self.directory.name) / "cache.json")
        self.cache.start()
        self.addCleanup(self.cache.stop)
        self.row = {"text": "◇ R 설명해줘", "language": "ko_KR", "fastPrediction": "ability",
                    "initialPrediction": "skills", "confidence": .99, "expected": "identity"}
        self.output = {"scope": "ability", "slots": ["R"], "breadth": "specific", "excludedScopes": [], "evidence": "R 설명해줘"}

    def call_pair(self, output):
        with patch.object(review.common, "post", return_value={"message": {"content": json.dumps(output)}}) as post:
            result = review.review_pair(self.row, {"digest": "test-model"})
        return result, post.call_args.args[1]

    def test_agreement_does_not_review(self):
        with patch.object(review.standalone, "predict", return_value={"predicted": "ability", "key": "first"}), \
                patch.object(review, "review_pair") as pair:
            result = review.predict(self.row, {}, {})
        self.assertEqual(result["predicted"], "ability")
        self.assertFalse(result["reviewed"])
        pair.assert_not_called()

    def test_review_hides_scores_gold_and_candidate_origin(self):
        result, body = self.call_pair(self.output)
        self.assertEqual(body["messages"][-1], {"role": "user", "content": self.row["text"]})
        self.assertEqual(body["format"]["properties"]["scope"]["enum"], ["ability", "skills", "clarify"])
        payload = json.dumps(body)
        for private in ["confidence", "expected", "fastPrediction", "initialPrediction"]:
            self.assertNotIn(private, payload)
        self.assertEqual(result["predicted"], "ability")
        self.assertFalse(result["abstained"])

    def test_unsupported_quote_requires_clarification(self):
        result, _ = self.call_pair({**self.output, "evidence": "궁 전체가 궁금해"})
        self.assertTrue(result["abstained"])
        self.assertEqual(result["reason"], "unsupported-evidence")

    def test_selected_rejected_scope_requires_clarification(self):
        result, _ = self.call_pair({**self.output, "excludedScopes": ["ability"]})
        self.assertEqual(result["reason"], "selected-excluded-scope")

    def test_missing_fields_require_clarification(self):
        result, _ = self.call_pair({"scope": "ability"})
        self.assertTrue(result["abstained"])

    def test_invalid_initial_response_never_reaches_pair(self):
        with patch.object(review.standalone, "predict", return_value={"predicted": "invalid", "key": "first"}), \
                patch.object(review, "review_pair") as pair:
            result = review.predict(self.row, {}, {})
        self.assertTrue(result["abstained"])
        pair.assert_not_called()


if __name__ == "__main__":
    unittest.main()
