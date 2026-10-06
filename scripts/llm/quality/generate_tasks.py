"""Run exported QA prompts on Colab, preserving every completed generation."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import tarfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tuning"))
from artifact_io import atomic_json, sha256


def validate_packet(packet):
    encoded = json.dumps(packet["tasks"], sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()
    if packet["schema"] != 1 or hashlib.sha256(encoded).hexdigest() != packet["taskHash"]:
        raise ValueError("Task fingerprint mismatch")
    if len({row["id"] for row in packet["tasks"]}) != len(packet["tasks"]):
        raise ValueError("Duplicate tasks")


def generate_all(packet, output, generate, options):
    validate_packet(packet)
    identity, backup = options["model"], options.get("backup")
    artifact = {"schema": 1, "taskHash": packet["taskHash"], "model": identity, "rows": []}
    if output.exists():
        previous = json.loads(output.read_text())
        if previous["taskHash"] != packet["taskHash"] or previous["model"] != identity:
            raise ValueError("Resume tasks or model changed")
        artifact = previous
    completed = {row["id"] for row in artifact["rows"]}
    if len(completed) != len(artifact["rows"]) or not completed.issubset({row["id"] for row in packet["tasks"]}):
        raise ValueError("Invalid partial artifact")
    for task in packet["tasks"]:
        if task["id"] in completed:
            continue
        text, seconds = generate(task)
        artifact["rows"].append({"id": task["id"], "text": text, "seconds": seconds})
        atomic_json(output, artifact)
        if backup:
            backup(len(artifact["rows"]))
    return artifact


def native_generator(spec, adapter):
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer, Qwen3_5ForCausalLM
    if not torch.cuda.is_available():
        raise RuntimeError("A CUDA GPU is required for this Colab profile")
    tokenizer = AutoTokenizer.from_pretrained(spec["model"], revision=spec["revision"])
    cls = Qwen3_5ForCausalLM if spec["model"] == "Qwen/Qwen3.5-0.8B" else AutoModelForCausalLM
    model = cls.from_pretrained(spec["model"], revision=spec["revision"], dtype=torch.float16, attn_implementation="sdpa")
    if adapter:
        from peft import PeftModel
        model.model = PeftModel.from_pretrained(model.model, adapter, is_trainable=False)
    model.to("cuda").eval()

    def generate(task):
        messages = [{"role": "system", "content": task["system"]}, {"role": "user", "content": task["prompt"]}]
        ids = tokenizer.apply_chat_template(messages, tokenize=True, add_generation_prompt=True,
                                            enable_thinking=False, return_dict=False)
        if len(ids) > 1900:
            raise ValueError("Prompt exceeds the common token budget")
        tokens = torch.tensor([ids], device="cuda")
        torch.cuda.synchronize()
        started = time.monotonic()
        with torch.inference_mode():
            result = model.generate(input_ids=tokens, attention_mask=torch.ones_like(tokens),
                                    max_new_tokens=task["maxTokens"], do_sample=False,
                                    use_cache=True, pad_token_id=tokenizer.eos_token_id)
        torch.cuda.synchronize()
        return tokenizer.decode(result[0, len(ids):], skip_special_tokens=True).strip(), time.monotonic() - started
    return generate


def backup_publisher(root, output):
    from checkpoints import publish
    (root / "GPU_DONE").unlink(missing_ok=True)
    directory = root / "checkpoints/generation-native"
    directory.mkdir(parents=True, exist_ok=True)
    last = [0.0]

    def backup(step, force=False):
        if not force and time.monotonic() - last[0] < 60:
            return
        atomic_json(directory / "generation-artifact.json", json.loads(output.read_text()))
        archive = root / "checkpoints/generation-native.tar.gz"
        temporary = archive.with_suffix(".pending")
        with tarfile.open(temporary, "w:gz") as target:
            target.add(directory, arcname="checkpoints/generation-native")
        temporary.replace(archive)
        publish(root, "generation-native", archive, step)
        last[0] = time.monotonic()
    return backup


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("tasks", type=Path)
    parser.add_argument("models", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--key", default="qwen35")
    parser.add_argument("--adapter", type=Path)
    parser.add_argument("--backup-root", type=Path)
    args = parser.parse_args()
    packet = json.loads(args.tasks.read_text())
    validate_packet(packet)
    spec = json.loads(args.models.read_text())[args.key]
    identity = {"backend": "native-cuda", "name": spec["model"], "revision": spec["revision"]}
    if args.adapter:
        files = sorted(file for file in args.adapter.rglob("*") if file.is_file())
        identity["adapterHash"] = hashlib.sha256(json.dumps([(str(file.relative_to(args.adapter)), sha256(file)) for file in files]).encode()).hexdigest()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    backup = backup_publisher(args.backup_root, args.output) if args.backup_root else None
    artifact = generate_all(packet, args.output, native_generator(spec, args.adapter), {"model": identity, "backup": backup})
    if backup:
        backup(len(artifact["rows"]), force=True)
        (args.backup_root / "GPU_DONE").write_text("generation-native complete\n")
    print(f"Saved {len(artifact['rows'])} completed generations")


if __name__ == "__main__":
    main()
