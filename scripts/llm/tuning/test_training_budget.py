import json
from pathlib import Path
import tempfile
import unittest
from training_budget import quantized_limit


class TrainingBudgetTest(unittest.TestCase):
    def test_default_uses_whole_pool_and_pilot_is_capped_to_pool(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.assertEqual(quantized_limit(root, 1120), 1120)
            (root / "quantized-budget.json").write_text(json.dumps({"maxRows": 256}))
            self.assertEqual(quantized_limit(root, 1120), 256)
            self.assertEqual(quantized_limit(root, 80), 80)

    def test_invalid_budget_cannot_stop_mid_accumulation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for rows in [0, True, 255, -8]:
                (root / "quantized-budget.json").write_text(json.dumps({"maxRows": rows}))
                with self.assertRaises(ValueError): quantized_limit(root, 1120)


if __name__ == "__main__": unittest.main()
