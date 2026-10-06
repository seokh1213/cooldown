import json
from pathlib import Path
import tempfile
import unittest
import numpy as np
import onnx
import onnxruntime as ort
from onnx import TensorProto, helper, numpy_helper
from safetensors.numpy import save_file
from export_generation import add_generation

KEY = "base_model.model.layers.0.mlp.up_proj"
TAG = KEY.replace(".", "_")


def miniature(directory):
    rng = np.random.default_rng(20)
    tensors = [numpy_helper.from_array(rng.integers(0, 256, (4, 1, 16), dtype=np.uint8), "packed"),
               numpy_helper.from_array(np.full((4, 1), .1, dtype=np.float32), "scales")]
    nodes = [helper.make_node("MatMulNBits", ["x", "packed", "scales"], ["y_base"],
        name="/model/layers.0/mlp/up_proj/MatMul_Quant", domain="com.microsoft", K=32, N=4, bits=4, block_size=32),
        helper.make_node("Cast", ["x"], [TAG + "_x16"], to=TensorProto.FLOAT16)]
    accumulator = "y_base"
    for gate, suffix in [("lora_scale", ""), ("embed_scale", "_embed_scale")]:
        tag = TAG + suffix
        tensors.extend([numpy_helper.from_array(rng.normal(0, .01, (32, 16)).astype(np.float16), tag + "_lora_AT"),
                        numpy_helper.from_array(rng.normal(0, .01, (16, 4)).astype(np.float16), tag + "_lora_BT")])
        output = "y" if suffix else "y_classifier"
        nodes.extend([
            helper.make_node("MatMul", [TAG + "_x16", tag + "_lora_AT"], [tag + "_xa"]),
            helper.make_node("MatMul", [tag + "_xa", tag + "_lora_BT"], [tag + "_d16"]),
            helper.make_node("Cast", [tag + "_d16"], [tag + "_d"], to=TensorProto.FLOAT),
            helper.make_node("Mul", [tag + "_d", gate], [tag + "_ds"]),
            helper.make_node("Add", [accumulator, tag + "_ds"], [output], name=tag + "_lora_add"),
        ])
        accumulator = output
    inputs = [helper.make_tensor_value_info("x", TensorProto.FLOAT, [2, 32])]
    inputs.extend(helper.make_tensor_value_info(gate, TensorProto.FLOAT, []) for gate in ["lora_scale", "embed_scale"])
    graph = helper.make_graph(nodes, "two-branch-test", inputs,
        [helper.make_tensor_value_info("y", TensorProto.FLOAT, [2, 4])], tensors)
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 21), helper.make_opsetid("com.microsoft", 1)], ir_version=10)
    graph_file = directory / "original.onnx"; onnx.save(model, graph_file)
    adapter = directory / "adapter"; adapter.mkdir()
    weights = {KEY + ".lora_A.weight": rng.normal(0, .1, (16, 32)).astype(np.float32),
               KEY + ".lora_B.weight": rng.normal(0, .1, (4, 16)).astype(np.float32)}
    save_file(weights, adapter / "adapter_model.safetensors")
    (adapter / "adapter_config.json").write_text(json.dumps({"r": 16, "lora_alpha": 32}))
    return graph_file, adapter, weights


class ExportGenerationTest(unittest.TestCase):
    def test_closed_generation_gate_preserves_each_existing_branch(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary); original, adapter, _ = miniature(directory)
            output = directory / "integrated.onnx"; add_generation(original, adapter, output)
            before = ort.InferenceSession(str(original), providers=["CPUExecutionProvider"])
            after = ort.InferenceSession(str(output), providers=["CPUExecutionProvider"])
            x = np.random.default_rng(40).normal(size=(2, 32)).astype(np.float32)
            for classify, retrieve in [(0, 0), (1, 0), (0, 1)]:
                inputs = {"x": x, "lora_scale": np.array(classify, dtype=np.float32),
                          "embed_scale": np.array(retrieve, dtype=np.float32)}
                np.testing.assert_array_equal(before.run(None, inputs)[0],
                    after.run(None, {**inputs, "qa_scale": np.array(0, dtype=np.float32)})[0])
            old = onnx.load(original); new = onnx.load(output)
            preserved = {t.name: t.SerializeToString() for t in new.graph.initializer}
            self.assertTrue(all(preserved[t.name] == t.SerializeToString() for t in old.graph.initializer))

    def test_generation_adds_its_own_delta_and_cannot_be_added_twice(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary); original, adapter, weights = miniature(directory)
            output = directory / "integrated.onnx"; add_generation(original, adapter, output)
            session = ort.InferenceSession(str(output), providers=["CPUExecutionProvider"])
            x = np.random.default_rng(50).normal(size=(2, 32)).astype(np.float32)
            inputs = {"x": x, "lora_scale": np.array(0, dtype=np.float32), "embed_scale": np.array(0, dtype=np.float32)}
            off = session.run(None, {**inputs, "qa_scale": np.array(0, dtype=np.float32)})[0]
            on = session.run(None, {**inputs, "qa_scale": np.array(1, dtype=np.float32)})[0]
            a = weights[KEY + ".lora_A.weight"].T.astype(np.float16)
            b = (weights[KEY + ".lora_B.weight"].T * 2).astype(np.float16)
            expected = ((x.astype(np.float16) @ a).astype(np.float16) @ b).astype(np.float16).astype(np.float32)
            np.testing.assert_allclose(on, off + expected, atol=2e-4, rtol=2e-4)
            with self.assertRaises(ValueError): add_generation(output, adapter, directory / "duplicate.onnx")


if __name__ == "__main__": unittest.main()
