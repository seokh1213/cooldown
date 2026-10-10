"""Recover exact current adapter values from shipped graph, not a guessed cache."""
import json
from pathlib import Path
import sys
import numpy as np
import onnx
from onnx import numpy_helper
from safetensors.numpy import save_file

TARGETS = ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj",
           "in_proj_qkv", "in_proj_z", "in_proj_a", "in_proj_b", "out_proj"]


def export(graph, output):
    model = onnx.load(graph, load_external_data=False)
    tensors = {t.name: t for t in model.graph.initializer}
    output = Path(output)
    for branch, suffix in [("classifier", ""), ("retrieval", "_embed_scale")]:
        weights = {}
        for node in model.graph.node:
            if node.op_type != "MatMulNBits" or node.name.startswith("/lm_head"): continue
            layer, block, projection = node.name.split("/")[2:-1]
            block = {"gdn": "linear_attn", "attn": "self_attn"}.get(block, block)
            key = f"base_model.model.{layer}.{block}.{projection}"
            tag = key.replace(".", "_") + suffix
            weights[key + ".lora_A.weight"] = numpy_helper.to_array(tensors[tag + "_lora_AT"]).T.copy()
            weights[key + ".lora_B.weight"] = (numpy_helper.to_array(tensors[tag + "_lora_BT"]).T.astype(np.float32) / 2).copy()
        destination = output / branch; destination.mkdir(parents=True, exist_ok=True)
        save_file(weights, destination / "adapter_model.safetensors")
        (destination / "adapter_config.json").write_text(json.dumps({
            "peft_type": "LORA", "task_type": "FEATURE_EXTRACTION", "r": 16, "lora_alpha": 32,
            "lora_dropout": 0, "bias": "none", "target_modules": TARGETS,
            "base_model_name_or_path": "Qwen/Qwen3.5-0.8B", "inference_mode": True,
        }))
        print(branch, len(weights) // 2, "current projections exported")


if __name__ == "__main__": export(*sys.argv[1:3])
