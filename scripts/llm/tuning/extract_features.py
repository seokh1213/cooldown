"""Checkpoint deployed-q4 features on CUDA; export replay cache to the Mac."""
import json
from pathlib import Path
import sys
import tarfile
import time
import numpy as np
from huggingface_hub import hf_hub_download
from tokenizers import Tokenizer
from onnx_features import Features, encode_row


def extract(runtime, tokenizer, source, destination):
    rows = [json.loads(line) for line in source.read_text().splitlines()]
    destination.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    for start in range(0, len(rows), 64):
        file = destination / f"part-{start // 64:04d}.npz"
        if file.exists(): continue
        features, offsets, labels, tasks = [], [0], [], []
        for row in rows[start:start + 64]:
            for task, question in row["questions"].items():
                ids, positions = encode_row(tokenizer, row, question)
                hidden = runtime.hidden(ids, positions)
                if question.get("label") is None: continue
                features.append(hidden.astype(np.float16)); offsets.append(offsets[-1] + len(hidden))
                labels.append(list(question["criteria"]).index(question["label"])); tasks.append(task)
        if features:
            np.savez(file, feats=np.concatenate(features), offsets=np.array(offsets, dtype=np.int32),
                     labels=np.array(labels, dtype=np.int32), task=np.array(tasks))
        print(json.dumps({"dataset": source.stem, "rows": min(start + 64, len(rows)),
                          "total": len(rows), "seconds": round(time.monotonic() - started)}), flush=True)
    (destination / "DONE").write_text(str(len(rows)))


def archive(root, name, directories):
    with tarfile.open(root / name, "w:gz", compresslevel=1) as target:
        for directory in directories: target.add(root / directory, arcname=directory)


def main(root):
    import torch  # Load CUDA libraries before ORT DLL preloading.
    root = Path(root)
    tokenizer = Tokenizer.from_file(hf_hub_download("onnx-community/Qwen3.5-0.8B-Text-ONNX", "tokenizer.json"))
    runtime = Features(root / "model_q4.onnx", provider="CUDAExecutionProvider", cache=root / "feature-cache")
    for name in ["route3-test", "act-test"]:
        extract(runtime, tokenizer, root / "data" / (name + ".jsonl"), root / "features" / name)
    archive(root, "current-test-cache.tar.gz", ["feature-cache", "features/route3-test", "features/act-test"])
    for name in ["head-dev", "head-train"]:
        extract(runtime, tokenizer, root / "data" / (name + ".jsonl"), root / "features" / name)
    result = {"gpu": torch.cuda.get_device_name(), "inferences": len(runtime.durations),
              "medianSeconds": float(np.median(runtime.durations)), "scope": "q4 hidden features; not browser latency"}
    (root / "features/summary.json").write_text(json.dumps(result, indent=2))
    archive(root, "features.tar.gz", ["features", "feature-cache"])
    print("FEATURE_EXTRACTION_COMPLETE", flush=True)


if __name__ == "__main__": main(sys.argv[1])
