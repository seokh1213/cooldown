"""Add a QA branch without replacing shipped classifier/retrieval tensors."""
import argparse
import json
from pathlib import Path
import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper
from safetensors.numpy import load_file


def projection_key(node):
    layer, block, projection = node.name.split("/")[2:-1]
    block = {"gdn": "linear_attn", "attn": "self_attn"}.get(block, block)
    return f"base_model.model.{layer}.{block}.{projection}"


def branch_nodes(key, config, weights, previous):
    tag = key.replace(".", "_")
    qa = tag + "_qa_scale"
    scale = config["lora_alpha"] / config["r"]
    arrays = [(qa + "_lora_AT", weights[key + ".lora_A.weight"].T),
              (qa + "_lora_BT", weights[key + ".lora_B.weight"].T * scale)]
    if not all(np.isfinite(value).all() for _, value in arrays):
        raise ValueError("Non-finite generation adapter")
    tensors = [numpy_helper.from_array(np.ascontiguousarray(value, dtype=np.float16), name)
               for name, value in arrays]
    original = previous.output[0]
    intermediate = original + "_before_qa"
    previous.output[0] = intermediate
    nodes = [
        helper.make_node("MatMul", [tag + "_x16", qa + "_lora_AT"], [qa + "_xa"], name=qa + "_lora_a"),
        helper.make_node("MatMul", [qa + "_xa", qa + "_lora_BT"], [qa + "_d16"], name=qa + "_lora_b"),
        helper.make_node("Cast", [qa + "_d16"], [qa + "_d"], to=TensorProto.FLOAT, name=qa + "_cast_out"),
        helper.make_node("Mul", [qa + "_d", "qa_scale"], [qa + "_ds"], name=qa + "_lora_gate"),
        helper.make_node("Add", [intermediate, qa + "_ds"], [original], name=qa + "_lora_add"),
    ]
    return nodes, tensors


def add_generation(graph, adapter, output):
    model = onnx.load(str(graph), load_external_data=False)
    if "qa_scale" in {item.name for item in model.graph.input}:
        raise ValueError("Generation branch already exists")
    config = json.loads((Path(adapter) / "adapter_config.json").read_text())
    if config["r"] != 16: raise ValueError("Generation pilot requires rank 16")
    weights = load_file(Path(adapter) / "adapter_model.safetensors")
    additions = {}; extra_tensors = []; matched = set()
    names = {node.name: node for node in model.graph.node}
    for node in model.graph.node:
        if node.op_type != "MatMulNBits" or node.name.startswith("/lm_head"): continue
        key = projection_key(node)
        tag = key.replace(".", "_")
        previous = names[tag + "_embed_scale_lora_add"]
        nodes, tensors = branch_nodes(key, config, weights, previous)
        additions[previous.name] = nodes; extra_tensors.extend(tensors)
        matched.update([key + ".lora_A.weight", key + ".lora_B.weight"])
    if set(weights) != matched: raise ValueError("Unmatched generation projections")
    sequence = []
    for node in model.graph.node:
        sequence.append(node); sequence.extend(additions.get(node.name, []))
    del model.graph.node[:]; model.graph.node.extend(sequence)
    model.graph.initializer.extend(extra_tensors)
    model.graph.input.append(helper.make_tensor_value_info("qa_scale", TensorProto.FLOAT, []))
    output = Path(output); output.parent.mkdir(parents=True, exist_ok=True)
    onnx.save(model, output)
    return {"projections": len(additions), "addedAdapterBytes": sum(len(t.raw_data) for t in extra_tensors),
            "gates": {"classification": "lora_scale", "retrieval": "embed_scale", "generation": "qa_scale"}}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("graph"); parser.add_argument("adapter"); parser.add_argument("output")
    args = parser.parse_args()
    print(json.dumps(add_generation(args.graph, args.adapter, args.output)))
