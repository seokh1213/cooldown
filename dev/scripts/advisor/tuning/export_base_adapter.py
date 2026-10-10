"""Attach a fresh LoRA to a standalone exported small model, retaining its base."""
import json
from pathlib import Path
import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper
from safetensors.numpy import load_file


def projection_key(node, family):
    parts = node.name.strip("/").split("/")
    if len(parts) < 5 or parts[0] != "model" or not parts[1].startswith("layers."):
        return None
    layer, block, projection = parts[1:4]
    if family == "lfm25":
        if block == "mlp": block, projection = "feed_forward", {"gate_proj": "w1", "up_proj": "w3", "down_proj": "w2"}[projection]
        if block == "attn":
            block = "self_attn"
            if projection == "o_proj": projection = "out_proj"
    return f"base_model.model.{layer}.{block}.{projection}"


def attach(graph, adapter, output, family):
    model = onnx.load(str(graph), load_external_data=False)
    if "qa_scale" in {item.name for item in model.graph.input}: raise ValueError("Adapter gate already exists")
    config = json.loads((Path(adapter) / "adapter_config.json").read_text())
    weights = load_file(Path(adapter) / "adapter_model.safetensors")
    scale = config["lora_alpha"] / config["r"]
    sequence = []; tensors = []; matched = set()
    for node in model.graph.node:
        key = projection_key(node, family) if node.op_type in {"MatMulNBits", "MatMul"} else None
        if key is None or key + ".lora_A.weight" not in weights:
            sequence.append(node); continue
        names = [key + ".lora_A.weight", key + ".lora_B.weight"]
        if matched & set(names): raise ValueError("Duplicate projection export")
        matched.update(names); tag = key.replace(".", "_") + "_qa"
        for name, array in [(tag + "_A", weights[names[0]].T), (tag + "_B", weights[names[1]].T * scale)]:
            if not np.isfinite(array).all(): raise ValueError("Non-finite adapter")
            tensors.append(numpy_helper.from_array(np.ascontiguousarray(array, dtype=np.float32), name))
        original = node.output[0]; node.output[0] = original + "_base"
        sequence.extend([node,
            helper.make_node("MatMul", [node.input[0], tag + "_A"], [tag + "_xA"], name=tag + "_first"),
            helper.make_node("MatMul", [tag + "_xA", tag + "_B"], [tag + "_delta"], name=tag + "_second"),
            helper.make_node("Mul", [tag + "_delta", "qa_scale"], [tag + "_scaled"], name=tag + "_gate"),
            helper.make_node("Add", [node.output[0], tag + "_scaled"], [original], name=tag + "_add")])
    if set(weights) != matched: raise ValueError("Adapter contains unmatched projections")
    del model.graph.node[:]; model.graph.node.extend(sequence)
    model.graph.initializer.extend(tensors)
    model.graph.input.append(helper.make_tensor_value_info("qa_scale", TensorProto.FLOAT, []))
    Path(output).parent.mkdir(parents=True, exist_ok=True); onnx.save(model, str(output))
    return {"projections": len(matched) // 2, "addedAdapterBytes": sum(len(t.raw_data) for t in tensors),
            "family": family, "baseGraphPreserved": True}


if __name__ == "__main__":
    import sys
    print(json.dumps(attach(*sys.argv[1:])))
