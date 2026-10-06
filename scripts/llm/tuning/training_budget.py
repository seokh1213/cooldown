"""Bound a pilot without losing the checkpoint needed to extend it later."""
import json


def quantized_limit(root, available):
    if available <= 0: raise ValueError("Empty quantized-training pool")
    file = root / "quantized-budget.json"
    if not file.exists(): return available
    requested = json.loads(file.read_text())["maxRows"]
    if type(requested) is not int or requested < 8 or requested % 8:
        raise ValueError("Quantized pilot budget must be a positive multiple of eight")
    return min(requested, available)
