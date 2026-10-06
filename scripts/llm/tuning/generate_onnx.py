"""Greedy generation from current/candidate q4, including recurrent/KV state."""
import time
import numpy as np
from onnx_features import Features
from branch_gates import feeds as branch_feeds


def state_input(output):
    if output.startswith("present_conv."): return output.replace("present_conv.", "past_conv.", 1)
    if output.startswith("present_recurrent."): return output.replace("present_recurrent.", "past_recurrent.", 1)
    if output.startswith("present."): return output.replace("present.", "past_key_values.", 1)
    return None


def generation_feeds(state, ids, length, inputs):
    feeds = {**state, "input_ids": np.array([ids], dtype=np.int64),
             "attention_mask": np.ones((1, length), dtype=np.int64)}
    if "num_logits_to_keep" in inputs:
        feeds["num_logits_to_keep"] = np.array(1, dtype=np.int64)
    if "position_ids" in inputs:
        feeds["position_ids"] = np.arange(length - len(ids), length, dtype=np.int64)[None, :]
    return feeds


class Generator:
    def __init__(self, graph, provider="CUDAExecutionProvider"):
        self.runtime = Features(graph, provider=provider)
        self.outputs = [item.name for item in self.runtime.session.get_outputs() if item.name != "hidden"]

    def generate(self, ids, eos, *, gate=None, limit=32):
        state = dict(self.runtime.empty)
        gates = branch_feeds(self.runtime.inputs, gate)
        input_ids = list(ids); generated = []; elapsed = []; length = len(ids)
        for _ in range(limit):
            feeds = generation_feeds(state, input_ids, length, self.runtime.inputs)
            feeds.update(gates)
            started = time.monotonic()
            values = self.runtime.session.run(self.outputs, feeds)
            elapsed.append(time.monotonic() - started)
            outputs = dict(zip(self.outputs, values))
            token = int(outputs["logits"][0, -1].argmax())
            if token in eos: break
            generated.append(token); input_ids = [token]; length += 1
            state = {state_input(name): value for name, value in outputs.items() if state_input(name)}
        return generated, sum(elapsed)
