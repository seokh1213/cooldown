"""Replace one existing LoRA branch while keeping deployed q4 weights intact."""
import json
from pathlib import Path
import sys
import numpy as np
import onnx
from onnx import numpy_helper
from safetensors.numpy import load_file


def replace_branch(graph, adapter, output, branch="classifier"):
    adapter = Path(adapter); config = json.loads((adapter / "adapter_config.json").read_text())
    if config["r"] != 16: raise ValueError("Deployed branch requires rank 16")
    weights = load_file(adapter / "adapter_model.safetensors")
    model = onnx.load(str(graph), load_external_data=False)
    tensors = {tensor.name: tensor for tensor in model.graph.initializer}
    suffix = "_embed_scale" if branch == "retrieval" else ""
    scale = config["lora_alpha"] / config["r"]
    replaced = 0
    for node in model.graph.node:
        if node.op_type != "MatMulNBits" or node.name.startswith("/lm_head"): continue
        layer, block, projection = node.name.split("/")[2:-1]
        block = {"gdn": "linear_attn", "attn": "self_attn"}.get(block, block)
        key = f"base_model.model.{layer}.{block}.{projection}"
        tag = key.replace(".", "_") + suffix
        for letter, multiplier in [("A", 1), ("B", scale)]:
            name = tag + f"_lora_{letter}T"
            values = np.ascontiguousarray(weights[key + f".lora_{letter}.weight"].T * multiplier, dtype=np.float16)
            if list(values.shape) != list(tensors[name].dims): raise ValueError("LoRA export shape mismatch")
            tensors[name].CopyFrom(numpy_helper.from_array(values, name))
        replaced += 1
    if replaced * 2 != len(weights): raise ValueError("Unmatched LoRA projections")
    output = Path(output); output.parent.mkdir(parents=True, exist_ok=True)
    onnx.save(model, output)
    return replaced


if __name__ == "__main__":
    print("Exported projections:", replace_branch(*sys.argv[1:5]))
