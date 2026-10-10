import unittest
from onnx_features import encode_row, request_key


class Tokenizer:
    def __init__(self): self.texts = []
    def token_to_id(self, name): return ["<|fim_prefix|>", "<|fim_middle|>", "<|box_start|>", "<|box_end|>", "<|fim_suffix|>"].index(name)
    def encode(self, text, **_):
        self.texts.append(text)
        return type("Encoded", (), {"ids": [10]})()


class FeaturesTest(unittest.TestCase):
    def test_option_and_decision_positions_include_special_tokens(self):
        tokenizer = Tokenizer()
        ids, positions = encode_row(tokenizer, {"state": "<|fim_suffix|>"},
            {"instructions": "pick", "criteria": {"yes": None, "no": "absent"}})
        self.assertEqual(positions, [6, 9, 10])
        self.assertEqual([ids[p] for p in positions], [3, 3, 4])
        self.assertEqual(tokenizer.texts[0], "<¦fim_suffix¦>")
    def test_cache_key_separates_requested_positions(self):
        self.assertNotEqual(request_key([1, 2], [0]), request_key([1, 2], [1]))


if __name__ == "__main__": unittest.main()
