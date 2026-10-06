import random
import unittest
from retrieval_order import LANGS, align_mined, retrieval_batches


class RetrievalOrderTest(unittest.TestCase):
    def test_resume_uses_identical_remaining_batches_from_legacy_shuffled_checkpoint(self):
        rows = [{"lang": lang, "q": str(i), "gold": [f"doc-{i}"], "negatives": ["other"]}
                for lang in LANGS for i in range(50)]
        expected = retrieval_batches(rows)
        saved = list(rows)
        random.Random(20261005).shuffle(saved)
        restored = retrieval_batches(align_mined(rows, saved))
        self.assertEqual(restored[20:], expected[20:])
        self.assertEqual(len(restored), len(expected))

    def test_batching_does_not_shuffle_persisted_mined_rows(self):
        rows = [{"lang": "ko_KR", "q": str(i), "gold": [str(i)]} for i in range(20)]
        before = [row["q"] for row in rows]
        retrieval_batches(rows)
        self.assertEqual([row["q"] for row in rows], before)


if __name__ == "__main__": unittest.main()
