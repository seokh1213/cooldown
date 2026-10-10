import unittest
from qa_context import select_context
from branch_gates import feeds, cache_suffix


class ContextTest(unittest.TestCase):
    def test_short_evidence_is_verbatim(self):
        text = "강타\n충전 간격은 90초입니다."
        self.assertEqual(select_context(text, "강타 충전 간격?"), text)

    def test_question_selects_late_evidence_without_a_label(self):
        filler = "포탑은 유닛입니다.\n" * 150
        text = "포탑\n" + filler + "요새화는 모든 피해를 85% 줄입니다."
        selected = select_context(text, "포탑의 요새화 피해 감소율?", 150)
        self.assertIn("85%", selected)
        self.assertLessEqual(len(selected), 150)

    def test_no_question_match_has_deterministic_bounded_result(self):
        text = "제목\n" + "관련 없는 문장.\n" * 100
        self.assertEqual(select_context(text, "xxxxx", 80), select_context(text, "xxxxx", 80))
        self.assertLessEqual(len(select_context(text, "xxxxx", 80)), 80)


class BranchTest(unittest.TestCase):
    def test_generation_cannot_enable_classifier_or_retrieval(self):
        inputs = {"lora_scale", "embed_scale", "qa_scale", "input_ids"}
        values = feeds(inputs, "qa_scale")
        self.assertEqual({name: float(value) for name, value in values.items()},
                         {"lora_scale": 0, "embed_scale": 0, "qa_scale": 1})

    def test_default_disables_every_branch_and_legacy_graph_rejects_qa(self):
        self.assertTrue(all(float(value) == 0 for value in feeds({"lora_scale"}).values()))
        with self.assertRaises(ValueError): feeds({"lora_scale", "embed_scale"}, "qa_scale")
        self.assertEqual(len({cache_suffix(gate) for gate in [None, "lora_scale", "embed_scale", "qa_scale"]}), 4)


if __name__ == "__main__": unittest.main()
