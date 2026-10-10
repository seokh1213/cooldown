"""Rebuild query/document vectors with the deployed q4 runtime after export."""
import json
from pathlib import Path
import sys
import numpy as np
import torch
from huggingface_hub import hf_hub_download
from tokenizers import Tokenizer
from onnx_features import Features
from train_retrieval import EOL, LANGS, doc_text


def embed(runtime, tokenizer, text, lang):
    ids = tokenizer.encode(EOL[lang].format(text), add_special_tokens=False).ids[:512]
    hidden = runtime.hidden(ids, [len(ids) - 1], gate="embed_scale")[0]
    return hidden / (np.linalg.norm(hidden) + 1e-9)


def main(root, graph, variant):
    root = Path(root); output = root / "vectors" / variant; output.mkdir(parents=True, exist_ok=True)
    tokenizer = Tokenizer.from_file(hf_hub_download("onnx-community/Qwen3.5-0.8B-Text-ONNX", "tokenizer.json"))
    runtime = Features(graph, provider="CUDAExecutionProvider")
    rows = [json.loads(line) for line in (root / "dev/data/retrieval-all.jsonl").read_text().splitlines()]
    queries = []
    for index, row in enumerate(rows):
        queries.append(embed(runtime, tokenizer, row["q"], row["lang"]))
        if index % 200 == 0: print(json.dumps({"stage": "retrievalVectors", "variant": variant, "queries": index}), flush=True)
    np.stack(queries).astype(np.float32).tofile(output / "queries.f32")
    metadata = {"dim": 1024, "prompt": EOL, "languages": {}}
    matrices = []; offset = 0
    for lang in LANGS:
        docs = json.loads((root / "data" / f"corpus-{lang}.json").read_text())
        matrix = np.stack([embed(runtime, tokenizer, doc_text(doc), lang) for doc in docs])
        metadata["languages"][lang] = {"offset": offset, "ids": [doc["id"] for doc in docs]}
        offset += matrix.size; matrices.append(matrix)
    np.concatenate(matrices).astype(np.float16).tofile(output / "doc-vectors.bin")
    (output / "doc-vectors.json").write_text(json.dumps(metadata, ensure_ascii=False))
    (output / "DONE").write_text(str(len(rows)))
    print(json.dumps({"stage": "retrievalVectorsComplete", "variant": variant, "queries": len(rows)}), flush=True)


if __name__ == "__main__": main(*sys.argv[1:4])
