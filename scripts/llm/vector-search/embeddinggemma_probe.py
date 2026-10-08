"""Score new-document probes with frozen dev thresholds and cached document vectors."""
import json
from pathlib import Path
import sys

import numpy as np
from embeddinggemma_eval import atomic_json, metrics, ranked_cases
from embeddinggemma_runtime import Encoder, texts


def run(cache):
    main = json.loads((cache / "snapshot.json").read_text())
    snapshot = json.loads((cache / "probe-snapshot.json").read_text())
    if main["docs"] != snapshot["docs"]:
        raise ValueError("Probe and main evaluation must use the same documents")
    scores = json.loads((cache / "scores.json").read_text())
    doc_count = sum(len(docs) for docs in main["docs"].values())
    groups = {"all": list(range(len(snapshot["rows"]))), "eligible": [i for i, row in enumerate(snapshot["rows"]) if row["eligible"]]}
    output = {"purpose": "New-document diagnostic, no calibration or model selection", "models": {}}
    for model in ["qwen", "gemma", "gemma-full"]:
        encoder = Encoder(cache / ("qwen" if model == "qwen" else "gemma"), model)
        items = texts(snapshot, model)[doc_count:]
        queries = np.stack([encoder.encode(item["text"])[0] for item in items])
        doc_vectors = np.load(cache / f"{model}-embeddings.npz")["vectors"][:doc_count]
        vectors = np.concatenate([doc_vectors, queries])
        names = [(f"{model}Fresh", False)] + ([("qwenDeployed", True)] if model == "qwen" else [])
        for name, deployed in names:
            cases = ranked_cases(snapshot, vectors, deployed)
            threshold = scores["models"][name]["threshold"]
            threshold = float("inf") if threshold is None else threshold
            variants = {"fixed": snapshot["hybrid"]["answer"], "calibrated": threshold}
            output["models"][name] = {
                variant: {group: metrics(snapshot["rows"], cases, indices, value) for group, indices in groups.items()}
                for variant, value in variants.items()
            }
            atomic_json(cache / f"{name}-probe-predictions.json", [{"index": i, **item} for i, item in enumerate(cases)])
        del encoder
    atomic_json(cache / "probe-scores.json", output)
    print(json.dumps(output), flush=True)


if __name__ == "__main__":
    run(Path(sys.argv[1]).resolve())
