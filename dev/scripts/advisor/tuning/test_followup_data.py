import unittest
from unittest.mock import patch
from prepare_followup import build, make_row


class FollowupDataTest(unittest.TestCase):
    def test_wrong_context_negative_stays_held_out_and_removes_the_answer(self):
        documents = [{"id": "rule:감전", "title": "감전", "text": "제한 시간은 3초입니다."},
                     {"id": "meta:baron", "title": "바론", "text": "등장 시간은 20분입니다."}]
        facts = [("rule:감전", "3초", "제한 시간", "감전 제한 시간?", "감전 몇 초 안에?")]
        with patch("prepare_followup.FACTS", facts), patch("prepare_followup.ABSENT", []):
            rows = build(documents)
        negative = next(row for row in rows if not row["answerable"])
        self.assertEqual(negative["answer"], "NOT_FOUND")
        self.assertEqual(negative["docId"], "meta:baron")
        self.assertNotIn("3초", negative["context"])
        self.assertEqual(negative["questionDocId"], "rule:감전")

    def test_labels_cannot_change_selected_context(self):
        document = {"id": "rule:감전", "title": "감전", "text": "다른 문장.\n" * 500 + "감전 제한 시간은 3초입니다."}
        first = make_row(document, "감전 제한 시간?", {"kind": "supported", "answer": "3초"})
        second = make_row(document, "감전 제한 시간?", {"kind": "supported", "answer": "999초", "sourceSentence": "다른 문장."})
        self.assertEqual(first["context"], second["context"])


if __name__ == "__main__": unittest.main()
