import unittest
import numpy as np
from generate_onnx import generation_feeds


class BaseGenerationTest(unittest.TestCase):
    def test_cached_decode_uses_absolute_next_position_and_full_attention(self):
        feeds = generation_feeds({"past_key_values.0.key": np.zeros((1, 2, 9, 64))}, [8], 10,
                                 {"input_ids", "attention_mask", "position_ids"})
        self.assertEqual(feeds["position_ids"].tolist(), [[9]])
        self.assertEqual(feeds["attention_mask"].shape, (1, 10))
        self.assertNotIn("num_logits_to_keep", feeds)

    def test_current_graph_receives_logit_limit_without_unregistered_position_input(self):
        feeds = generation_feeds({}, [3, 4, 5], 3, {"input_ids", "attention_mask", "num_logits_to_keep"})
        self.assertEqual(int(feeds["num_logits_to_keep"]), 1)
        self.assertNotIn("position_ids", feeds)


if __name__ == "__main__": unittest.main()
