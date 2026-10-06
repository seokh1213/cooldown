"""Independent classification, retrieval, and grounded generation adapters."""
import numpy as np

GATES = frozenset({"lora_scale", "embed_scale", "qa_scale"})


def feeds(inputs, active=None):
    if active is not None and active not in inputs & GATES:
        raise ValueError("Requested adapter is absent from graph")
    return {name: np.array(float(name == active), dtype=np.float32)
            for name in inputs & GATES}


def cache_suffix(active):
    return {"lora_scale": "", "embed_scale": "-embed", "qa_scale": "-qa", None: "-base"}[active]
