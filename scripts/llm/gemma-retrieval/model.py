"""Text-only EmbeddingGemma 2 with its official prompts and mean pooling."""
from pathlib import Path
import numpy as np
import torch
import torch.nn.functional as F

REVISION = '914f7f89142e33e77833254d9c9b90c3cef7303b'


def load(root, source=None):
    from transformers import AutoConfig, AutoModel, AutoTokenizer
    from peft import LoraConfig, PeftModel, get_peft_model
    directory = Path(root) / 'native'
    device = 'cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu'
    # T4 advertises emulated bf16 in recent torch. Native bf16 requires Ampere.
    dtype = torch.bfloat16 if device == 'cuda' and torch.cuda.get_device_capability()[0] >= 8 else torch.float32
    config = AutoConfig.from_pretrained(directory)
    config.vision_config = None
    config.audio_config = None
    base = AutoModel.from_pretrained(directory, config=config, dtype=dtype, attn_implementation='sdpa')
    if source:
        model = PeftModel.from_pretrained(base, source, is_trainable=True)
    else:
        model = get_peft_model(base, LoraConfig(r=8, lora_alpha=16, lora_dropout=0,
            target_modules=['q_proj', 'k_proj', 'v_proj', 'o_proj'], task_type='FEATURE_EXTRACTION'))
    model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={'use_reentrant': False})
    model.enable_input_require_grads()
    tokenizer = AutoTokenizer.from_pretrained(directory)
    return Encoder(model.to(device), tokenizer, device)


class Encoder:
    def __init__(self, model, tokenizer, device):
        self.model, self.tokenizer, self.device = model, tokenizer, device

    def encode(self, texts, limit=512):
        tokens = self.tokenizer(texts, padding=True, truncation=True, max_length=limit, return_tensors='pt').to(self.device)
        output = self.model(**tokens).last_hidden_state.float()
        mask = tokens['attention_mask'].unsqueeze(-1)
        return F.normalize((output * mask).sum(1) / mask.sum(1).clamp(min=1), dim=-1)

    @torch.no_grad()
    def vectors(self, texts, batch=8):
        self.model.eval()
        result = [self.encode(texts[i:i + batch]).cpu().numpy() for i in range(0, len(texts), batch)]
        return np.concatenate(result) if result else np.empty((0, 768), dtype=np.float32)


def query_text(row):
    return 'task: search result | query: ' + row['q']


def doc_text(doc):
    return f"title: {doc['title']} | text: {doc['text'][:600]}"
