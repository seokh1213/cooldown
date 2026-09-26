"""질문 목록을 검색 LoRA 벡터로(앱과 같은 그래프·같은 계산, CPU). 앱 흐름 시험(app_flow.ts)이 읽는다.

  uv run --python 3.13 --with onnxruntime --with tokenizers --with huggingface_hub --with numpy \\
    python scripts/llm/vector-search/embed_questions.py <그래프> <질문.jsonl(lang,q)> <출력.npz>
"""
import json, os, sys
import numpy as np, onnxruntime as ort
from tokenizers import Tokenizer
from huggingface_hub import hf_hub_download
graph, src, dst = sys.argv[1:4]
tok = Tokenizer.from_file(hf_hub_download("onnx-community/Qwen3.5-0.8B-Text-ONNX", "tokenizer.json"))
so = ort.SessionOptions(); so.intra_op_num_threads = int(os.environ.get("THREADS", 4))
sess = ort.InferenceSession(graph, so, providers=["CPUExecutionProvider"])
E = {}
for i in sess.get_inputs():
    if i.name in ("input_ids", "attention_mask", "num_logits_to_keep", "lora_scale", "embed_scale"): continue
    E[i.name] = np.zeros([1 if d == "batch_size" else (0 if isinstance(d, str) else d) for d in i.shape], dtype=np.float32)
EOL = {"ko_KR": '이 글 "{}" 을 한 낱말로 줄이면:', "en_US": 'This text: "{}" means in one word:', "zh_CN": '这段话"{}"用一个词概括是：'}
rows = [json.loads(l) for l in open(src)]
out = []
for r in rows:
    ids = tok.encode(EOL[r["lang"]].format(r["q"]), add_special_tokens=False).ids[:512]
    f = dict(E, input_ids=np.array([ids], dtype=np.int64), attention_mask=np.ones((1, len(ids)), dtype=np.int64),
             num_logits_to_keep=np.array(1, dtype=np.int64), lora_scale=np.array(0.0, dtype=np.float32), embed_scale=np.array(1.0, dtype=np.float32))
    h = sess.run(["hidden"], f)[0][0, -1]
    out.append(h / (np.linalg.norm(h) + 1e-9))
np.savez(dst, q=np.stack(out))
print("저장", dst, len(out))
