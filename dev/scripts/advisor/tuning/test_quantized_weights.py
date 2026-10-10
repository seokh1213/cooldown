import unittest
import numpy as np
import onnx
from onnx import helper, numpy_helper, TensorProto
import onnxruntime as ort
from quantized_weights import dequantize


class QuantizedWeightsTest(unittest.TestCase):
    def test_dequantized_weight_matches_actual_matmulnbits_operator(self):
        rng = np.random.default_rng(20261005)
        packed = rng.integers(0, 256, (3, 2, 16), dtype=np.uint8)
        scales = rng.uniform(.01, .2, (3, 2)).astype(np.float32)
        zeros = np.array([[0x87], [0x98], [0x76]], dtype=np.uint8)
        nodes = [helper.make_node("MatMulNBits", ["x", "packed", "scales", "zeros"], ["y"],
            domain="com.microsoft", K=64, N=3, bits=4, block_size=32)]
        graph = helper.make_graph(nodes, "quant-test", [helper.make_tensor_value_info("x", TensorProto.FLOAT, [2, 64])],
            [helper.make_tensor_value_info("y", TensorProto.FLOAT, [2, 3])],
            [numpy_helper.from_array(value, name) for name, value in [("packed", packed), ("scales", scales), ("zeros", zeros)]])
        model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 21), helper.make_opsetid("com.microsoft", 1)], ir_version=10)
        session = ort.InferenceSession(model.SerializeToString(), providers=["CPUExecutionProvider"])
        x = rng.normal(size=(2, 64)).astype(np.float32)
        expected = session.run(None, {"x": x})[0]
        np.testing.assert_allclose(x @ dequantize(packed, scales, zeros, (3, 64, 32)).T, expected, rtol=1e-5, atol=1e-5)


if __name__ == "__main__": unittest.main()
