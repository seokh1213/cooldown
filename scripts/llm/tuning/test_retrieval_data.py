import unittest
import zlib
from prepare_retrieval import split_rows


class RetrievalSplitTest(unittest.TestCase):
    def test_held_out_document_and_exact_test_questions_never_enter_training(self):
        ids = [f"doc:{i}" for i in range(30)]
        train = [{"lang": "ko_KR", "q": f"training-{i}", "gold": [id]} for i, id in enumerate(ids)]
        test = [{"lang": "ko_KR", "q": "existing-test", "gold": [ids[0]]}]
        train.append(test[0])
        result = split_rows(train, test)
        self.assertFalse({r["gold"][0] for r in result["train"]} & {r["gold"][0] for r in result["dev"]})
        self.assertNotIn(test[0], result["train"] + result["dev"])
        for row in result["train"] + result["dev"]:
            self.assertEqual(zlib.crc32(row["gold"][0].encode()) % 2, 0)


if __name__ == "__main__": unittest.main()
