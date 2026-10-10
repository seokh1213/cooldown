import unittest
from onnx import TensorProto, helper
from prepare_base_browser import cache_spec


class BrowserCacheTest(unittest.TestCase):
    def test_empty_attention_cache_preserves_heads_and_zeroes_only_sequence(self):
        value = helper.make_tensor_value_info("past_key_values.3.key", TensorProto.FLOAT,
                                              ["batch_size", 2, "past_sequence_length", 256])
        self.assertEqual(cache_spec(value)["dims"], [1, 2, 0, 256])

    def test_recurrent_cache_keeps_fixed_state_dimensions(self):
        value = helper.make_tensor_value_info("past_recurrent.0", TensorProto.FLOAT,
                                              ["batch_size", 16, 128, 128])
        self.assertEqual(cache_spec(value)["dims"], [1, 16, 128, 128])

    def test_half_precision_cache_cannot_be_silently_created_as_float32(self):
        value = helper.make_tensor_value_info("past_key_values.0.key", TensorProto.FLOAT16, [1, 2, 0, 64])
        with self.assertRaises(ValueError): cache_spec(value)


if __name__ == "__main__": unittest.main()
