from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from train_quantized import train


class QuantizedInputsTest(unittest.TestCase):
    def test_missing_frozen_head_fails_before_expensive_model_load(self):
        with tempfile.TemporaryDirectory() as temporary, patch("train_quantized.load_text_model") as load:
            with self.assertRaisesRegex(FileNotFoundError, "frozen"):
                train(Path(temporary))
            load.assert_not_called()


if __name__ == "__main__": unittest.main()
