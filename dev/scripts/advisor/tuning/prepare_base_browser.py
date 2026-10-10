"""Describe exported model caches and identical browser probe questions."""
import json
from pathlib import Path
import onnx
from transformers import AutoTokenizer
from artifact_io import atomic_json
from evaluate_base_pilot import tasks
from qa_prompts import prompt_ids


def cache_spec(value):
    tensor = value.type.tensor_type
    if tensor.elem_type != onnx.TensorProto.FLOAT:
        raise ValueError("Browser pilot requires float32 caches")
    dimensions = [dimension.dim_value if dimension.HasField("dim_value") else
                  1 if dimension.dim_param == "batch_size" else 0
                  for dimension in tensor.shape.dim]
    return {"name": value.name, "dims": dimensions}


def describe(graph, root):
    model = onnx.load(str(graph), load_external_data=False)
    external = sorted({entry.value for tensor in model.graph.initializer
                       for entry in tensor.external_data if entry.key == "location"})
    if any(Path(name).name != name for name in external):
        raise ValueError("External weights must share the graph directory")
    prefix = "/models/" + str(graph.parent.relative_to(root / "models")) + "/"
    return {"graph": prefix + graph.name,
            "externalData": [{"path": name, "data": prefix + name} for name in external],
            "caches": [cache_spec(value) for value in model.graph.input if value.name.startswith("past_")]}


def prepare(metadata):
    root = Path(metadata["work"])
    bases = json.loads((root / "dev/data/models.json").read_text())
    rows = tasks(root)
    probes = [row for row in rows if row["phase"] == "provided" and row["cohort"] == "new"]
    probes = probes[:8] + [row for row in probes if not row["answerable"]][:4]
    specifications = {}; questions = {}
    for family in bases:
        graphs = sorted((root / "models").glob(f"{family}*/model_*.onnx"))
        if not graphs: continue
        tokenizer = AutoTokenizer.from_pretrained(bases[family]["model"], revision=bases[family]["revision"])
        tokenizer.save_pretrained(root / "browser-tokenizer" / family)
        questions[family] = [{"id": row["id"], "answer": row["answer"], "ids": prompt_ids(tokenizer, row),
                              "eos": tokenizer.eos_token_id} for row in probes]
        questions[family + "-full"] = [{"id": row["id"], "phase": row["phase"], "answer": row["answer"],
                                       "ids": prompt_ids(tokenizer, row) if row["context"] else [],
                                       "eos": tokenizer.eos_token_id} for row in rows]
        for graph in graphs:
            key = graph.parent.name
            specifications[key] = {**describe(graph, root), "family": family}
    atomic_json(root / "browser-specs.json", {"models": specifications, "tasks": questions})
    return {"models": sorted(specifications), "probeQuestions": len(probes),
            "scope": "Compatibility and timing probes, not a representative accuracy benchmark"}


if __name__ == "__main__":
    import sys
    print(json.dumps(prepare(json.loads(Path(sys.argv[1]).read_text()))))
