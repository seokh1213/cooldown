"""Install the pinned trainer in the dedicated runtime without printing identifiers."""
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path('/content/cooldown-tuning')
ROOT.mkdir(exist_ok=True)
subprocess.run([sys.executable, '-m', 'pip', 'uninstall', '-y', 'torchao'],
    check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
subprocess.run([sys.executable, '-m', 'pip', 'install', '-q',
    'transformers==5.19.0', 'peft==0.21.2', 'numpy==2.5.3',
    'safetensors==0.8.0', 'tokenizers==0.23.2'], check=True,
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
import torch
from huggingface_hub import snapshot_download

snapshot_download('google/embeddinggemma-2', revision='914f7f89142e33e77833254d9c9b90c3cef7303b',
    local_dir=ROOT / 'native', allow_patterns=[
        'config.json', 'model.safetensors', 'tokenizer.json', 'tokenizer_config.json'])
(ROOT / 'setup.json').write_text(json.dumps({
    'gpu': torch.cuda.get_device_name(), 'torch': torch.__version__,
    'nativeBf16Supported': torch.cuda.get_device_capability()[0] >= 8, 'ready': True}))
print('GEMMA_SETUP_OK', flush=True)
