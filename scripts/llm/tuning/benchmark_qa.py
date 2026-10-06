"""Paired CPU timing with variants interleaved on the same twelve questions."""
import json
from pathlib import Path
import sys
import numpy as np
from transformers import AutoTokenizer
from evaluate_qa import predict
from generate_onnx import Generator


def benchmark(root):
    root = Path(root)
    tokenizer = AutoTokenizer.from_pretrained("Qwen/Qwen3.5-0.8B")
    base = Generator(root / "models/model_q4.onnx", "CPUExecutionProvider")
    tuned = Generator(root / "candidates/sft/model_q4.onnx", "CPUExecutionProvider")
    generators = {"current": base, "routing": base, "sft": tuned}
    source = [json.loads(line) for line in (root / "data/qa-natural-test.jsonl").read_text().splitlines()]
    rows = source[::3]
    for variant, generator in generators.items(): predict(generator, tokenizer, source[-1], variant)
    measurements = {variant: [] for variant in generators}
    for round in range(2):
        for index, row in enumerate(rows):
            variants = list(generators)
            order = (index + round) % len(variants)
            for variant in variants[order:] + variants[:order]:
                _, duration, _ = predict(generators[variant], tokenizer, row, variant)
                measurements[variant].append(duration)
    summary = {variant: {"medianSeconds": float(np.median(values)),
                         "p95Seconds": float(np.percentile(values, 95)), "inferences": len(values)}
               for variant, values in measurements.items()}
    report = {"summary": summary, "measurements": measurements,
              "scope": "Same Mac CPU, four ORT threads, two rounds of twelve fixed questions; excludes model load/tokenization/browser"}
    (root / "results/qa-paired-timing.json").write_text(json.dumps(report, indent=2))
    print(json.dumps({"summary": summary, "scope": report["scope"]}), flush=True)


if __name__ == "__main__": benchmark(sys.argv[1])
