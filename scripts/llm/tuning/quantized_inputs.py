"""Fail before loading the model if the frozen teacher/head inputs are absent."""


def validate_inputs(root):
    files = ["model_q4.onnx", "model_q4.onnx_data", "data/head-train.jsonl",
             "current-adapters/classifier/adapter_config.json", "current-adapters/classifier/adapter_model.safetensors"]
    files.extend(f"heads/kev-b3e-{family}.{suffix}"
                 for family in ["route", "topic", "act"] for suffix in ["json", "bin"])
    if any(not (root / name).is_file() for name in files):
        raise FileNotFoundError("Required frozen quantized-training input is absent")
    if not list((root / "features/head-train").glob("part-*.npz")):
        raise FileNotFoundError("Quantized-training teacher features are absent")
