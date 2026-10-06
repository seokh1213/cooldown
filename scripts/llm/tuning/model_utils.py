"""Text-only loading and bounded fp16 autocast for a T4 pilot."""
from contextlib import nullcontext
from pathlib import Path
import torch

BASE = "Qwen/Qwen3.5-0.8B"
TARGETS = ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj",
           "in_proj_qkv", "in_proj_z", "in_proj_a", "in_proj_b", "out_proj"]


def load_text_model():
    from transformers import AutoTokenizer, Qwen3_5ForCausalLM
    tokenizer = AutoTokenizer.from_pretrained(BASE)
    # FP32 parameters with fp16 autocast follows the existing embedding trainer.
    model = Qwen3_5ForCausalLM.from_pretrained(BASE, dtype=torch.float32, attn_implementation="sdpa")
    model.config.use_cache = False
    return model, tokenizer


def adapter(model, *, source=None, device="cuda"):
    from peft import LoraConfig, PeftModel, get_peft_model
    if source:
        model = PeftModel.from_pretrained(model, str(source), is_trainable=True)
    else:
        model = get_peft_model(model, LoraConfig(task_type="FEATURE_EXTRACTION", r=16,
            lora_alpha=32, lora_dropout=0, target_modules=TARGETS, bias="none"))
    model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
    if hasattr(model, "enable_input_require_grads"): model.enable_input_require_grads()
    return model.to(device)


def token_batch(ids, pad):
    width = max(map(len, ids))
    tokens = torch.full((len(ids), width), pad, dtype=torch.long, device="cuda")
    mask = torch.zeros_like(tokens)
    for index, row in enumerate(ids):
        tokens[index, :len(row)] = torch.tensor(row, device="cuda"); mask[index, :len(row)] = 1
    return tokens, mask


def autocast(device="cuda"):
    return torch.autocast("cuda", dtype=torch.float16) if device == "cuda" else nullcontext()


def export_adapter(model, destination):
    """Normalize a CausalLM parent prefix to the text-model ONNX exporter keys."""
    import json
    from safetensors.torch import load_file, save_file
    destination = Path(destination); model.save_pretrained(destination)
    file = destination / "adapter_model.safetensors"
    tensors = load_file(file)
    normalized = {name.replace("base_model.model.model.layers.", "base_model.model.layers."): value.contiguous()
                  for name, value in tensors.items()}
    if len(normalized) != len(tensors): raise ValueError("Adapter key collision")
    save_file(normalized, file)
    config = json.loads((destination / "adapter_config.json").read_text())
    config["task_type"] = "FEATURE_EXTRACTION"
    (destination / "adapter_config.json").write_text(json.dumps(config, indent=2))
