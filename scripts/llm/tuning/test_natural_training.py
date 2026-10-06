import unittest
from unittest.mock import patch
from prepare_natural_training import add_negatives, fact_rows
from prepare_qa import partition


def document_id(split, excluded=()):
    return next(f"doc-{index}" for index in range(1000)
                if partition(f"doc-{index}") == split and f"doc-{index}" not in excluded)


class NaturalTrainingTest(unittest.TestCase):
    def test_test_document_annotations_are_rejected(self):
        key = document_id("test")
        documents = {key: {"id": key, "title": "Test", "text": "충전 시간은 90초입니다."}}
        with patch("prepare_natural_training.FACTS", [(key, "충전 시간", "90초", "충전 시간")]):
            with self.assertRaisesRegex(ValueError, "Held-out"):
                fact_rows(documents)

    def test_paraphrases_share_evidence_and_do_not_expose_copy_anchors(self):
        key = document_id("train")
        documents = {key: {"id": key, "title": "Training", "text": "충전 시간은 90초입니다. 재사용 대기는 15초입니다."}}
        with patch("prepare_natural_training.FACTS", [(key, "충전 시간", "90초", "충전 시간")]):
            rows = fact_rows(documents)
        self.assertEqual(len(rows), 4)
        self.assertEqual(len({row["question"] for row in rows}), 4)
        self.assertTrue(all(row["answer"] == "90초" and "15초" in row["context"] for row in rows))
        self.assertTrue(all("«" not in row["question"] and "90초" not in row["question"] for row in rows))

    def test_wrong_context_negatives_remain_in_same_document_partition(self):
        train = document_id("train"); other = document_id("train", [train]); test = document_id("test")
        documents = {key: {"id": key, "title": key, "text": text}
                     for key, text in [(train, "90초"), (other, "다른 규칙 15초"), (test, "틀린 구간 30초")]}
        source = [{"id": "natural-000-0", "docId": train, "question": "충전 간격?",
                   "answer": "90초", "answerable": True, "split": "train", "context": "90초"}]
        rows = add_negatives(source, documents)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[1]["contextDocId"], other)
        self.assertEqual(rows[1]["answer"], "NOT_FOUND")
        self.assertFalse(rows[1]["answerable"])


if __name__ == "__main__": unittest.main()
