import unittest
from generate_onnx import state_input
from qa_prompts import context, exact_answer


class GenerationTest(unittest.TestCase):
    def test_both_attention_and_recurrent_states_are_reused(self):
        self.assertEqual(state_input("present.3.key"), "past_key_values.3.key")
        self.assertEqual(state_input("present_conv.0"), "past_conv.0")
        self.assertEqual(state_input("present_recurrent.0"), "past_recurrent.0")
        self.assertIsNone(state_input("logits"))
    def test_context_window_keeps_the_gold_sentence(self):
        row = {"context": "Title\n" + "noise " * 500 + "unique fact 15 seconds" + "tail " * 300,
               "answerable": True, "sourceSentence": "unique fact 15 seconds"}
        self.assertIn(row["sourceSentence"], context(row))
        self.assertLess(len(context(row)), 1300)
    def test_exact_answer_keeps_numeric_and_unit_errors(self):
        self.assertEqual(exact_answer(" 15 seconds\n"), "15 seconds")
        self.assertNotEqual(exact_answer("15"), "15 seconds")


if __name__ == "__main__": unittest.main()
