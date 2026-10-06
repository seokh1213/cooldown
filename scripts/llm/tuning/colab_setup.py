"""Run on the owned Colab runtime; emit no CLI runtime identifiers."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

root = Path("/content/cooldown-tuning")
root.mkdir(exist_ok=True)
subprocess.run([sys.executable, "-m", "pip", "install", "-q",
    "onnxruntime-gpu==1.30.0", "tokenizers==0.22.2", "huggingface-hub==1.2.3", "onnx==1.20.0"],
    check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
from huggingface_hub import hf_hub_download
import torch
import onnxruntime as ort
config = json.loads((root / "provenance.json").read_text())
weights = Path(hf_hub_download("onnx-community/Qwen3.5-0.8B-Text-ONNX", "onnx/model_q4.onnx_data"))
with weights.open("rb") as stream:
    if hashlib.file_digest(stream, "sha256").hexdigest() != config["weightsSha256"]:
        raise RuntimeError("Frozen baseline weight mismatch")
shutil.copyfile(weights, root / "model_q4.onnx_data")
status = {"gpu": torch.cuda.get_device_name(), "torch": torch.__version__, "onnxruntime": ort.__version__,
          "ready": True}
(root / "setup.json").write_text(json.dumps(status, indent=2))
print("TUNING_SETUP_OK", flush=True)
