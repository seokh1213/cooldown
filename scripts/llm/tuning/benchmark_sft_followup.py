"""Measure the integrated graph, interleaving both variants on fixed questions."""
import argparse
import json
from pathlib import Path
import numpy as np
from transformers import AutoTokenizer
from evaluate_sft_followup import infer
from generate_onnx import Generator


def benchmark(metadata):
    root = Path(metadata["work"])
    tokenizer = AutoTokenizer.from_pretrained("Qwen/Qwen3.5-0.8B", local_files_only=True)
    source = [json.loads(line) for line in (root / "data/qa-followup.jsonl").read_text().splitlines()]
    regression = [row for row in source if row["cohort"] == "regression"]
    rows = regression[::3]
    if len(rows) != 12: raise ValueError("Timing requires the twelve fixed regression questions")
    variants = {"current": (Generator(metadata["baselineGraph"], "CPUExecutionProvider"), None),
                "sft-integrated": (Generator(metadata["candidateGraph"], "CPUExecutionProvider"), "qa_scale")}
    for runtime, gate in variants.values(): infer(runtime, tokenizer, regression[-1], gate)
    measurements = {variant: [] for variant in variants}
    for round_index in range(2):
        for index, row in enumerate(rows):
            order = list(variants) if (index + round_index) % 2 == 0 else list(reversed(variants))
            for variant in order:
                runtime, gate = variants[variant]
                _, seconds = infer(runtime, tokenizer, row, gate)
                measurements[variant].append(seconds)
    summary = {variant: {"medianSeconds": float(np.median(values)),
                         "p95Seconds": float(np.percentile(values, 95)), "inferences": len(values)}
               for variant, values in measurements.items()}
    result = {"summary": summary, "measurements": measurements, "questionIds": [row["id"] for row in rows],
              "scope": "Same Mac CPU, 4 ORT threads, 2 interleaved rounds of 12 fixed questions; excludes model load/tokenization/browser"}
    (root / "results/paired-timing.json").write_text(json.dumps(result, indent=2))
    print(json.dumps({"summary": summary, "scope": result["scope"]}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("metadata")
    args = parser.parse_args(); benchmark(json.loads(Path(args.metadata).read_text()))
