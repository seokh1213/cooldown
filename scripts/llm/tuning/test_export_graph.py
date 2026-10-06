import tempfile
from pathlib import Path
import unittest
import numpy as np
import onnx
from onnx import helper, numpy_helper
from export_adapters import export
from export_graph import replace_branch


class ExportGraphTest(unittest.TestCase):
    def test_roundtrip_preserves_small_half_weights_and_other_branch(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            tag = "base_model_model_layers_0_self_attn_q_proj"
            values = np.full((16, 4), np.nextafter(np.float16(0), np.float16(1)), dtype=np.float16)
            tensors = []
            for suffix in ["", "_embed_scale"]:
                tensors.extend([numpy_helper.from_array(np.ones((4, 16), dtype=np.float16), tag + suffix + "_lora_AT"),
                                numpy_helper.from_array(values, tag + suffix + "_lora_BT")])
            node = helper.make_node("MatMulNBits", ["x", "packed", "scales"], ["y"],
                                    name="/model/layers.0/attn/q_proj/MatMulNBits", domain="com.microsoft")
            model = helper.make_model(helper.make_graph([node], "roundtrip", [], [], tensors))
            original = root / "original.onnx"; onnx.save(model, original)
            export(original, root / "adapters")
            output = root / "candidate.onnx"
            replace_branch(original, root / "adapters/classifier", output, "classifier")
            restored = onnx.load(output)
            self.assertEqual([t.SerializeToString() for t in restored.graph.initializer],
                             [t.SerializeToString() for t in model.graph.initializer])


if __name__ == "__main__": unittest.main()
