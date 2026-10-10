"""Pinned text backbones and a common answer-only training objective."""
from pathlib import Path
import torch
import torch.nn.functional as F
from model_utils import autocast
from qa_prompts import prompt_ids


def load(specification, checkpoint=None):
    from transformers import AutoModelForCausalLM, AutoTokenizer, Qwen3_5ForCausalLM
    from peft import LoraConfig, PeftModel, get_peft_model
    name = specification["model"]; revision = specification["revision"]
    tokenizer = AutoTokenizer.from_pretrained(name, revision=revision)
    model_class = Qwen3_5ForCausalLM if name == "Qwen/Qwen3.5-0.8B" else AutoModelForCausalLM
    model = model_class.from_pretrained(name, revision=revision, dtype=torch.float32, attn_implementation="sdpa")
    if checkpoint:
        model.model = PeftModel.from_pretrained(model.model, str(Path(checkpoint) / "adapter"), is_trainable=True)
    else:
        model.model = get_peft_model(model.model, LoraConfig(task_type="FEATURE_EXTRACTION", r=16,
            lora_alpha=32, lora_dropout=0, target_modules="all-linear", bias="none"))
    model.model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
    model.model.enable_input_require_grads()
    model.config.use_cache = False
    for name, parameter in model.named_parameters(): parameter.requires_grad_("lora_" in name)
    return model.to("cuda"), tokenizer


def sequence(tokenizer, row):
    prompt = prompt_ids(tokenizer, row)
    answer = tokenizer.encode(row["answer"], add_special_tokens=False) + [tokenizer.eos_token_id]
    return prompt + answer, len(prompt)


def loss(model, example):
    tokens, start = example
    ids = torch.tensor([tokens], device="cuda")
    with autocast("cuda"):
        hidden = model.model(input_ids=ids, attention_mask=torch.ones_like(ids), use_cache=False).last_hidden_state
        logits = model.lm_head(hidden[:, start - 1:-1])
    return F.cross_entropy(logits.float().reshape(-1, logits.shape[-1]), ids[:, start:].reshape(-1))


@torch.no_grad()
def validation_loss(model, examples):
    model.eval()
    return sum(float(loss(model, example)) for example in examples) / len(examples)


@torch.no_grad()
def generate(model, tokenizer, row):
    import time
    if not row["context"]: return "NOT_FOUND", 0
    ids = prompt_ids(tokenizer, row)
    if len(ids) > 1900: raise ValueError("Evaluation prompt exceeds common budget")
    tokens = torch.tensor([ids], device="cuda"); torch.cuda.synchronize(); started = time.monotonic()
    with autocast("cuda"):
        output = model.generate(input_ids=tokens, attention_mask=torch.ones_like(tokens), max_new_tokens=24,
            do_sample=False, use_cache=True, pad_token_id=tokenizer.eos_token_id)
    torch.cuda.synchronize()
    return tokenizer.decode(output[0, len(ids):], skip_special_tokens=True).strip(), time.monotonic() - started
