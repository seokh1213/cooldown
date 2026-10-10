"""Pinned q4 text graphs, identical tokenization on CPU and WebGPU."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import time
import urllib.request

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

ROOT = Path(__file__).resolve().parents[4]
REPOSITORIES = {
    "gemma": ("onnx-community/embeddinggemma-2-ONNX", "daa72c51243991dfcaf9f9137d2c573d8f7790c0"),
    "qwen": ("onnx-community/Qwen3.5-0.8B-Text-ONNX", "471b493cf4c64cd99e8b0942ec74dbf0221c10c2"),
}
GEMMA_HASHES = {
    "onnx/model_q4.onnx": "f9eeba97acddf139b8ee2ddf04bc30dceafa88de93fadf74d7644e0d61a477a9",
    "onnx/model_q4.onnx_data": "c3975f2d1ab7a1878ae31a7d7a9b7804a827aff3800b60dfceafce21cac3df49",
}
TOKENIZER_HASHES = {
    "gemma": {"tokenizer.json": "4d777ef5bdc1aa36227abdfb77c3e49e7b9c892d16e1b6bda41c393504828be4",
              "tokenizer_config.json": "17bd5d6e9364ca49a534e1502076593317c298d4a663623091ed45388f004874",
              "config.json": "8d011bfe08b5e345bbe0b81e5c6fd02c381920b345b986047bc2a33ce7b90d1d"},
    "qwen": {"tokenizer.json": "89da80cc6689bef4d90cc1028249436975ffb0814618f1d93c65310e05801a9b",
             "tokenizer_config.json": "814c11499c492963d13b3ebd3a55fa0ada68df89568f711e001c73b73fb67072",
             "config.json": "46fdb58a1817864df3cb39bc494e6fa6aa36f29277daec13b63d2a407a312f52",
             "onnx/model_q4.onnx_data": "ac65b1f1220314ef2debc02545f5aa5702ec201e723ca45dce2bfefc85921859"},
}
PROMPTS = {
    "ko_KR": '이 글 "{}" 을 한 낱말로 줄이면:',
    "en_US": 'This text: "{}" means in one word:',
    "zh_CN": '这段话"{}"用一个词概括是：',
}


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def download(model, name, directory):
    repo, revision = REPOSITORIES[model]
    target = directory / name
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        url = f"https://huggingface.co/{repo}/resolve/{revision}/{name}"
        temporary = target.with_name(target.name + ".partial")
        with urllib.request.urlopen(url, timeout=120) as source, open(temporary, "wb") as dest:
            shutil.copyfileobj(source, dest)
        temporary.replace(target)
    digest = sha256(target)
    expected = GEMMA_HASHES.get(name) if model == "gemma" else None
    expected = expected or TOKENIZER_HASHES[model].get(name)
    if expected and digest != expected:
        raise ValueError(f"SHA256 mismatch: {target.name}")
    return {"path": name, "bytes": target.stat().st_size, "sha256": digest}


def prepare_models(cache, snapshot):
    manifest = {}
    for model in REPOSITORIES:
        directory = cache / model
        files = ["tokenizer.json", "tokenizer_config.json", "config.json"]
        if model == "gemma":
            files += list(GEMMA_HASHES)
        entries = [download(model, name, directory) for name in files]
        if model == "qwen":
            graph = ROOT / "public" / snapshot["provenance"]["model"]["graph"]
            expected_graph = snapshot["provenance"]["hashes"][str(graph.relative_to(ROOT))]
            if sha256(graph) != expected_graph:
                raise ValueError("Qwen graph changed after snapshot")
            destination = directory / "onnx/model_q4.onnx"
            destination.parent.mkdir(parents=True, exist_ok=True)
            if not destination.exists() or sha256(destination) != expected_graph:
                shutil.copyfile(graph, destination)
            # Reuse the user's existing immutable base weights; never delete the source.
            base = Path(os.environ.get("QWEN_BASE_WEIGHTS", str(Path.home() / ".cache/cooldown-kev/onnx-b3e/model_q4.onnx_data")))
            weights = destination.with_name("model_q4.onnx_data")
            if not weights.exists() and base.exists():
                os.link(base, weights)
            if not weights.exists():
                download(model, "onnx/model_q4.onnx_data", directory)
            if sha256(weights) != TOKENIZER_HASHES[model]["onnx/model_q4.onnx_data"]:
                raise ValueError("Qwen base weights do not match the pinned upstream revision")
            entries += [{"path": str(p.relative_to(directory)), "bytes": p.stat().st_size, "sha256": sha256(p)} for p in [destination, weights]]
        manifest[model] = {"repository": REPOSITORIES[model][0], "revision": REPOSITORIES[model][1], "files": entries}
    (cache / "models.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def input_digest(snapshot, model):
    content = json.dumps(texts(snapshot, model), ensure_ascii=False, separators=(",", ":")).encode()
    return hashlib.sha256(content).hexdigest()


def texts(snapshot, model):
    result = []
    for lang, docs in snapshot["docs"].items():
        for doc in docs:
            if model.startswith("gemma"):
                content = doc["text"] if model == "gemma-full" else doc["text"][:600]
                text = f"title: {doc['title']} | text: {content}"
            else:
                text = PROMPTS[lang].format(doc["title"] + "\n" + doc["text"][:600])
            result.append({"key": f"doc:{lang}:{doc['id']}", "text": text, "kind": "doc"})
    for index, row in enumerate(snapshot["rows"]):
        text = f"task: search result | query: {row['q']}" if model.startswith("gemma") else PROMPTS[row["searchLang"]].format(row["q"])
        result.append({"key": f"query:{index}", "text": text, "kind": "query"})
    return result


def normalize(vector):
    vector = np.asarray(vector, dtype=np.float32).reshape(-1)
    norm = np.linalg.norm(vector)
    if not np.isfinite(norm) or norm <= 0:
        raise ValueError("Invalid embedding")
    return vector / norm


class Encoder:
    def __init__(self, directory, model):
        self.model = "gemma" if model.startswith("gemma") else model
        self.tokenizer = Tokenizer.from_file(str(directory / "tokenizer.json"))
        self.tokenizer.enable_truncation(max_length=2048 if model == "gemma-full" else 512)
        options = ort.SessionOptions()
        options.intra_op_num_threads = 4
        options.inter_op_num_threads = 1
        options.log_severity_level = 3
        start = time.perf_counter()
        self.session = ort.InferenceSession(str(directory / "onnx/model_q4.onnx"), options, providers=["CPUExecutionProvider"])
        self.load_seconds = time.perf_counter() - start
        self.inputs = self.session.get_inputs()
        self.outputs = [item.name for item in self.session.get_outputs()]
        self.schema = {"inputs": [{"name": i.name, "shape": i.shape, "type": i.type} for i in self.inputs], "outputs": self.outputs}

    def token_ids(self, text):
        return self.tokenizer.encode(text, add_special_tokens=self.model == "gemma").ids

    def feed(self, ids):
        feed = {}
        for item in self.inputs:
            if item.name == "input_ids":
                value = np.array([ids], dtype=np.int64)
            elif item.name == "attention_mask":
                value = np.ones((1, len(ids)), dtype=np.int64)
            elif item.name == "position_ids":
                value = np.arange(len(ids), dtype=np.int64)[None, :]
            elif item.name == "num_logits_to_keep":
                value = np.array(1, dtype=np.int64)
            elif item.name.endswith("_scale"):
                value = np.array(float(item.name == "embed_scale"), dtype=np.float32)
            elif self.model == "gemma" and item.name in {"image_features", "video_features", "audio_features"}:
                value = np.empty((0, 512), dtype=np.float32)
            elif item.name.startswith("past_"):
                shape = [1 if d == "batch_size" else 0 if isinstance(d, str) else d for d in item.shape]
                value = np.zeros(shape, dtype=np.float16 if item.type == "tensor(float16)" else np.float32)
            else:
                raise ValueError(f"Unsupported graph input: {item.name}")
            feed[item.name] = value
        return feed

    def encode(self, text):
        start = time.perf_counter()
        ids = self.token_ids(text)
        output = "sentence_embedding" if self.model == "gemma" else "hidden"
        vector = self.session.run([output], self.feed(ids))[0]
        if self.model == "qwen":
            vector = vector[0, -1]
        return normalize(vector), time.perf_counter() - start, ids


if __name__ == "__main__":
    import sys
    cache = Path(sys.argv[1]).resolve()
    snapshot = json.loads((cache / "snapshot.json").read_text())
    manifest = prepare_models(cache, snapshot)
    for name in REPOSITORIES:
        encoder = Encoder(cache / name, name)
        vector, seconds, ids = encoder.encode(texts(snapshot, name)[-1]["text"])
        print(json.dumps({"model": name, "loadSeconds": encoder.load_seconds, "sampleSeconds": seconds, "dim": len(vector), "tokens": len(ids), "schema": encoder.schema}), flush=True)
        del encoder
