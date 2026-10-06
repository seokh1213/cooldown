import tempfile
from pathlib import Path
import unittest
import numpy as np
import torch
from train_heads import Pointer, evaluate


class PointerTest(unittest.TestCase):
    def test_export_preserves_pointer_logits_and_temperature(self):
        with tempfile.TemporaryDirectory() as directory:
            prefix = Path(directory) / "head"
            np.array([1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0], dtype=np.float32).tofile(prefix.with_suffix(".bin"))
            meta = {"dim": 2, "pointer": 2, "temperature": 2}
            model = Pointer(prefix.with_suffix(".bin"), meta)
            hidden = torch.tensor([[1., 0.], [0., 1.], [0., 2.]])
            self.assertEqual(int(model(hidden).argmax()), 1)
            model.export(Path(directory) / "candidate", meta)
            restored = Pointer(Path(directory) / "candidate.bin", meta)
            self.assertTrue(torch.equal(model(hidden), restored(hidden)))
            self.assertEqual(evaluate(model, [(hidden, 1)])["accuracy"], 1)


if __name__ == "__main__": unittest.main()
