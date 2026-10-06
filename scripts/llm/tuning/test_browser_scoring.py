import unittest
from evaluate_browser_pilot import score


class BrowserScoringTest(unittest.TestCase):
    def setUp(self):
        self.rows = [{"id": "x", "phase": "provided", "answer": "3초", "context": "발동 지연 3초, 지속 4초",
                      "answerable": True, "cohort": "new", "factGroup": "x"}]
        self.records = [{"id": "x", "phase": "provided", "gate": gate, "gold": "3초",
                         "answer": "4초", "correct": True, "seconds": .5} for gate in [0, 1]]

    def test_recomputes_correctness_and_counts_wrong_number_already_in_document(self):
        results, scores = score(self.records, self.rows)
        self.assertFalse(results[0]["correct"])
        self.assertEqual(scores["provided"]["trained"]["new"]["wrongButVerbatim"], 1)

    def test_rejects_incomplete_or_duplicate_pairs(self):
        with self.assertRaises(ValueError): score(self.records[:1], self.rows)
        with self.assertRaises(ValueError): score(self.records + self.records[:1], self.rows)

    def test_rejects_modified_reference_answer(self):
        self.records[0]["gold"] = "4초"
        with self.assertRaises(ValueError): score(self.records, self.rows)


if __name__ == "__main__": unittest.main()
