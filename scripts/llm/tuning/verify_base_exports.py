"""Verify retained graph tensors and the shipped Qwen classification/search path."""
import json
from pathlib import Path
import numpy as np
from transformers import AutoTokenizer
from artifact_io import atomic_json
from onnx_features import Features
from verify_generation import tensor_proof


def verify(metadata):
    root = Path(metadata["work"]); results = {}
    for key in ["lfm25-q4", "lfm25-q4f32", "qwen25-q4", "qwen35-q4"]:
        specification = json.loads((root / f"evaluate-{key}.json").read_text())
        results[key] = {"preservedInitializers": tensor_proof(specification["baseGraph"], specification["graph"])}
    specification = json.loads((root / "evaluate-qwen35-q4.json").read_text())
    original = Features(specification["baseGraph"]); candidate = Features(specification["graph"])
    tokenizer = AutoTokenizer.from_pretrained(specification["model"], revision=specification["revision"])
    prompts = ["강타 충전 주기는 몇 초야?", "바론 버프 지속시간은?", "닷지 두 번째 대기시간은?",
               "포탑 예열의 최대 피해 증가율은?", "감전이 발동하기까지 지연 시간은?", "기민함의 이동 속도 비율은?"]
    probes = []
    for text in prompts:
        ids = tokenizer.encode(text, add_special_tokens=False)
        for gate in [None, "lora_scale", "embed_scale"]:
            before = original.hidden(ids, [0, len(ids) - 1], gate=gate)
            after = candidate.hidden(ids, [0, len(ids) - 1], gate=gate)
            exact = bool(np.array_equal(before, after))
            if not exact: raise ValueError("Existing Qwen classification/search features changed")
            probes.append({"gate": gate, "exact": exact, "maxAbsDifference": float(np.max(np.abs(before - after)))})
    results["qwen35-q4"]["features"] = probes
    results["scope"] = "Original serialized tensor equality for four graphs; 18 real Qwen feature probes with QA disabled"
    atomic_json(root / "results/export-preservation.json", results)
    return {"modelsVerified": 4, "exactFeatureProbes": len(probes)}


if __name__ == "__main__":
    import sys
    print(json.dumps(verify(json.loads(Path(sys.argv[1]).read_text()))))
