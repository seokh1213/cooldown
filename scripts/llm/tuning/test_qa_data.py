import unittest
from prepare_qa import build, partition


class QADataTest(unittest.TestCase):
    def test_translated_documents_and_negative_contexts_never_cross_partition(self):
        docs = [{"id": f"rule:{i}", "title": f"Rule {i}", "text": f"The unique event {i} happens after 15 seconds."} for i in range(30)]
        result = build({"en_US": docs, "ko_KR": docs})
        for name, rows in result.items():
            for row in rows:
                self.assertEqual(partition(row["docId"]), name)
                self.assertEqual(partition(row.get("contextDocId", row["docId"])), name)
                if row["answerable"]: self.assertIn(row["answer"], row["context"])


if __name__ == "__main__": unittest.main()
