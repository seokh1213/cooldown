"""Embed extra held-out questions using the same retrieval gate and EOL prompt."""
import argparse
import json
from pathlib import Path
import numpy as np
from huggingface_hub import hf_hub_download
from tokenizers import Tokenizer
from onnx_features import Features
from train_retrieval import EOL


def query_vectors(graph, source, output, provider):
    tokenizer = Tokenizer.from_file(hf_hub_download("onnx-community/Qwen3.5-0.8B-Text-ONNX", "tokenizer.json"))
    runtime = Features(graph, provider=provider)
    rows = [json.loads(line) for line in Path(source).read_text().splitlines()]
    vectors = []
    for row in rows:
        ids = tokenizer.encode(EOL[row["lang"]].format(row["q"]), add_special_tokens=False).ids[:512]
        hidden = runtime.hidden(ids, [len(ids) - 1], gate="embed_scale")[0]
        vectors.append(hidden / (np.linalg.norm(hidden) + 1e-9))
    np.stack(vectors).astype(np.float32).tofile(output)
    print(json.dumps({"queryVectorsWritten": len(rows), "provider": provider}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("graph"); parser.add_argument("source"); parser.add_argument("output")
    parser.add_argument("--provider", default="CPUExecutionProvider")
    args = parser.parse_args()
    query_vectors(args.graph, args.source, args.output, args.provider)
