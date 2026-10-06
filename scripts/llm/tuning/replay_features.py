"""Precompute held-out app classifier requests on GPU after adapter training."""
import json
from pathlib import Path
import sys
import torch
from onnx_features import Features


def main(root, graph):
    if not torch.cuda.is_available(): raise RuntimeError("GPU replay requires CUDA")
    root = Path(root)
    runtime = Features(graph, provider="CUDAExecutionProvider", cache=root / "feature-cache-quantized")
    rows = [json.loads(line) for line in (root / "data/quantized-replay.jsonl").read_text().splitlines()]
    for index, row in enumerate(rows):
        runtime.hidden(row["ids"], row["positions"])
        if index % 200 == 0:
            print(json.dumps({"stage": "quantizedReplay", "requests": index, "total": len(rows)}), flush=True)
    (root / "feature-cache-quantized/DONE").write_text(str(len(rows)))
    print(json.dumps({"stage": "quantizedReplayComplete", "requests": len(rows)}), flush=True)


if __name__ == "__main__": main(*sys.argv[1:3])
