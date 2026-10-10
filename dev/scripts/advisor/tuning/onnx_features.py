"""Use the exact deployed graph, LoRA gates, and pointer token positions."""
import hashlib
import json
from pathlib import Path
import re
import time
import numpy as np
import onnxruntime as ort
from branch_gates import GATES, cache_suffix, feeds as branch_feeds


def request_key(ids, positions):
    payload = json.dumps([ids, positions], separators=(",", ":")).encode()
    return hashlib.sha256(payload).hexdigest()


def encode_row(tokenizer, row, question):
    special = [tokenizer.token_to_id(name) for name in [
        "<|fim_prefix|>", "<|fim_middle|>", "<|box_start|>", "<|box_end|>", "<|fim_suffix|>"]]
    def encode(text):
        return tokenizer.encode(re.sub(r"<\|(\w+)\|>", r"<¦\1¦>", text), add_special_tokens=False).ids
    ids = [special[0], *encode(row["state"]), special[1], *encode(question["instructions"])]
    positions = []
    for name, description in question["criteria"].items():
        ids.extend([special[2], *encode(f"{name}: {description}" if description else name), special[3]])
        positions.append(len(ids) - 1)
    ids.append(special[4]); positions.append(len(ids) - 1)
    return ids, positions


class Features:
    def __init__(self, graph, *, provider="CPUExecutionProvider", cache=None, threads=4):
        if provider == "CUDAExecutionProvider":
            ort.preload_dlls()
        options = ort.SessionOptions(); options.intra_op_num_threads = threads
        self.session = ort.InferenceSession(str(graph), options,
            providers=[provider, "CPUExecutionProvider"] if provider != "CPUExecutionProvider" else [provider])
        if provider not in self.session.get_providers():
            raise RuntimeError("Requested ONNX provider unavailable")
        self.inputs = {item.name for item in self.session.get_inputs()}
        self.empty = {
            item.name: np.zeros([1 if dim == "batch_size" else 0 if isinstance(dim, str) else dim
                                for dim in item.shape], dtype=np.float32)
            for item in self.session.get_inputs()
            if item.name not in {"input_ids", "attention_mask", "position_ids", "num_logits_to_keep"} | GATES
        }
        self.cache = Path(cache) if cache else None
        if self.cache: self.cache.mkdir(parents=True, exist_ok=True)
        self.durations = []

    def hidden(self, ids, positions, *, gate="lora_scale"):
        gates = branch_feeds(self.inputs, gate)
        key = request_key(ids, positions) + cache_suffix(gate)
        file = self.cache / (key + ".npy") if self.cache else None
        if file and file.exists(): return np.load(file).astype(np.float32)
        feeds = {**self.empty, "input_ids": np.array([ids], dtype=np.int64),
                 "attention_mask": np.ones((1, len(ids)), dtype=np.int64),
                 "num_logits_to_keep": np.array(len(ids), dtype=np.int64)}
        feeds.update(gates)
        started = time.monotonic()
        output = self.session.run(["hidden"], feeds)[0][0][positions]
        self.durations.append(time.monotonic() - started)
        if not np.isfinite(output).all(): raise ValueError("Non-finite ONNX features")
        if file:
            temp = file.with_suffix(".tmp.npy")
            np.save(temp, output); temp.replace(file)
        return output
