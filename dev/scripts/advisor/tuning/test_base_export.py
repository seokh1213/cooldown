import json
from pathlib import Path
import tempfile
import unittest
import numpy as np
import onnx
import onnxruntime as ort
from onnx import TensorProto, helper, numpy_helper
from safetensors.numpy import save_file
from export_base_adapter import attach, projection_key


class BaseExportTest(unittest.TestCase):
    def test_lfm_mlp_mapping_preserves_gate_up_down_semantics(self):
        expected = {"gate_proj": "w1", "up_proj": "w3", "down_proj": "w2"}
        for projection, target in expected.items():
            node = helper.make_node("MatMul", ["x", "w"], ["y"], name=f"/model/layers.0/mlp/{projection}/MatMul")
            self.assertEqual(projection_key(node, "lfm25"), f"base_model.model.layers.0.feed_forward.{target}")
        node = helper.make_node("MatMul", ["x", "w"], ["y"], name="/model/layers.2/attn/o_proj/MatMul")
        self.assertEqual(projection_key(node, "lfm25"), "base_model.model.layers.2.self_attn.out_proj")

    def test_actual_ort_gate_zero_preserves_base_and_gate_one_adds_scaled_delta(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); node = helper.make_node("MatMul", ["x", "w"], ["y"],
                name="/model/layers.0/conv/in_proj/MatMul")
            graph = helper.make_graph([node], "test", [helper.make_tensor_value_info("x", TensorProto.FLOAT, [1, 2])],
                [helper.make_tensor_value_info("y", TensorProto.FLOAT, [1, 2])],
                [numpy_helper.from_array(np.eye(2, dtype=np.float32), "w")])
            model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 21)], ir_version=10)
            onnx.save(model, root / "base.onnx")
            (root / "adapter_config.json").write_text(json.dumps({"r": 1, "lora_alpha": 2}))
            key = "base_model.model.layers.0.conv.in_proj"
            save_file({key + ".lora_A.weight": np.array([[1, 2]], dtype=np.float32),
                       key + ".lora_B.weight": np.array([[3], [4]], dtype=np.float32)}, root / "adapter_model.safetensors")
            attach(root / "base.onnx", root, root / "candidate.onnx", "lfm25")
            session = ort.InferenceSession(str(root / "candidate.onnx"), providers=["CPUExecutionProvider"])
            x = np.array([[2, 5]], dtype=np.float32)
            zero = session.run(None, {"x": x, "qa_scale": np.array(0, dtype=np.float32)})[0]
            one = session.run(None, {"x": x, "qa_scale": np.array(1, dtype=np.float32)})[0]
            np.testing.assert_array_equal(zero, x)
            np.testing.assert_array_equal(one, x + np.array([[72, 96]], dtype=np.float32))


if __name__ == "__main__": unittest.main()
