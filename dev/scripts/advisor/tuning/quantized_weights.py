"""Decode deployed ONNX MatMulNBits weights for quantization-matched LoRA."""
import numpy as np


def dequantize(packed, scales, zero_points, shape):
    n, k, block = shape
    blocks = (k + block - 1) // block
    packed = np.asarray(packed, dtype=np.uint8).reshape(n, blocks, block // 2)
    values = np.empty((n, blocks, block), dtype=np.float32)
    values[:, :, 0::2] = packed & 15
    values[:, :, 1::2] = packed >> 4
    if zero_points is None:
        zeros = np.full((n, blocks), 8, dtype=np.float32)
    else:
        raw = np.asarray(zero_points, dtype=np.uint8).reshape(n, (blocks + 1) // 2)
        zeros = np.empty((n, raw.shape[1] * 2), dtype=np.float32)
        zeros[:, 0::2] = raw & 15; zeros[:, 1::2] = raw >> 4
        zeros = zeros[:, :blocks]
    weights = (values - zeros[:, :, None]) * np.asarray(scales).reshape(n, blocks, 1)
    return np.ascontiguousarray(weights.reshape(n, blocks * block)[:, :k])


def projection_path(node):
    if node.name.startswith("/lm_head/"): return "lm_head"
    layer, block, projection = node.name.split("/")[2:-1]
    block = {"gdn": "linear_attn", "attn": "self_attn"}.get(block, block)
    return f"model.{layer}.{block}.{projection}"


def apply_quantized_weights(model, graph):
    import onnx
    import torch
    from onnx import numpy_helper
    onnx_model = onnx.load(str(graph), load_external_data=True)
    tensors = {tensor.name: tensor for tensor in onnx_model.graph.initializer}
    matched = 0
    for node in onnx_model.graph.node:
        # Classifier training never uses the vocabulary head. Keep embeddings
        # intact and avoid dequantizing its 248k x 1024 matrix in host memory.
        if node.op_type != "MatMulNBits" or node.name.startswith("/lm_head/"): continue
        attrs = {a.name: onnx.helper.get_attribute_value(a) for a in node.attribute}
        if attrs["bits"] != 4: raise ValueError("Only deployed 4-bit projections supported")
        arrays = [numpy_helper.to_array(tensors[name]) for name in node.input[1:4] if name]
        weight = dequantize(arrays[0], arrays[1], arrays[2] if len(arrays) > 2 else None,
                            (attrs["N"], attrs["K"], attrs["block_size"]))
        linear = model.get_submodule(projection_path(node))
        if tuple(linear.weight.shape) != weight.shape: raise ValueError("Quantized projection shape mismatch")
        # lm_head is tied to embeddings in HF; ONNX quantizes only the output projection.
        linear.weight = torch.nn.Parameter(torch.from_numpy(weight).to(linear.weight.device), requires_grad=False)
        matched += 1
    return matched
