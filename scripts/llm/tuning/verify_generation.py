"""Numerical parity on the real q4 graph and preserved adapter tensors."""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
import onnx
from transformers import AutoTokenizer
from generate_onnx import Generator
from onnx_features import Features


def tensor_proof(original, integrated):
    before = onnx.load(str(original), load_external_data=False)
    after = onnx.load(str(integrated), load_external_data=False)
    tensors = {tensor.name: tensor.SerializeToString() for tensor in after.graph.initializer}
    preserved = all(tensors.get(tensor.name) == tensor.SerializeToString() for tensor in before.graph.initializer)
    if not preserved: raise ValueError("Existing q4 or adapter tensor was modified")
    return len(before.graph.initializer)


def verify(metadata):
    root = Path(metadata["work"]); baseline = Path(metadata["baselineGraph"]); candidate = Path(metadata["candidateGraph"])
    tokenizer = AutoTokenizer.from_pretrained("Qwen/Qwen3.5-0.8B", local_files_only=True)
    original = Features(baseline); integrated = Features(candidate)
    prompts = ["강타 충전 주기는 몇 초야?", "바론 버프 지속시간은?", "닷지 두 번째 대기시간은?",
               "포탑 예열의 최대 피해 증가율은?", "감전이 발동하기까지 지연 시간은?", "기민함의 이동 속도 비율은?"]
    checks = []
    for text in prompts:
        ids = tokenizer.encode(text, add_special_tokens=False)
        for gate in [None, "lora_scale", "embed_scale"]:
            before = original.hidden(ids, [0, len(ids) - 1], gate=gate)
            after = integrated.hidden(ids, [0, len(ids) - 1], gate=gate)
            checks.append({"gate": gate, "maxAbsDifference": float(np.max(np.abs(before - after))),
                           "exact": bool(np.array_equal(before, after))})
            np.testing.assert_allclose(before, after, atol=1e-5, rtol=1e-5)
    del original, integrated
    old_sft = Path(metadata["source"]) / "candidates/sft/model_q4.onnx"
    old = Generator(old_sft, "CPUExecutionProvider"); new = Generator(candidate, "CPUExecutionProvider")
    messages = [{"role": "system", "content": "Use only the document. Copy the requested number and unit exactly, with no explanation. If absent, output NOT_FOUND."},
                {"role": "user", "content": "Document:\n바론\n내셔 남작은 20분에 나오고 버프는 180초 동안 유지됩니다.\n\nQuestion: 바론 버프는 몇 초 동안 유지돼?"}]
    ids = tokenizer.apply_chat_template(messages, tokenize=True, add_generation_prompt=True,
                                        enable_thinking=False, return_dict=False)
    eos = {tokenizer.eos_token_id, tokenizer.convert_tokens_to_ids("<|im_end|>")}
    before, _ = old.generate(ids, eos, gate="lora_scale", limit=24)
    after, _ = new.generate(ids, eos, gate="qa_scale", limit=24)
    if before != after: raise ValueError("Independent generation branch changed greedy response")
    preserved = tensor_proof(baseline, candidate)
    result = {"preservedInitializers": preserved, "featureChecks": checks,
              "allExact": all(check["exact"] for check in checks), "greedyResponseParity": True,
              "response": tokenizer.decode(after, skip_special_tokens=True),
              "baselineSha256": hashlib.sha256(baseline.read_bytes()).hexdigest(),
              "integratedSha256": hashlib.sha256(candidate.read_bytes()).hexdigest(),
              "scope": "18 real q4 feature probes across 3 gates; one complete greedy cached-state response"}
    (root / "generation-parity.json").write_text(json.dumps(result, indent=2))
    return {key: value for key, value in result.items() if key != "featureChecks"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("metadata")
    args = parser.parse_args(); print(json.dumps(verify(json.loads(Path(args.metadata).read_text()))))
