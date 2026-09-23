"""판정 특징을 끊어 넣기로 뽑는다 — judge/features.py 와 같은 값, 긴 state 에서 수십 배 빠르다

features.py 는 입력 전체의 logits 를 받은 뒤 필요한 위치(선택지 끝·<decide>)만 고른다.
갈래 판정처럼 짧은 질문에는 문제가 없지만 검증(재료 1천 토큰)에서는 [L, 248320] 이 한 문장에
1GB 가 넘어 dev 124문장에 7분을 넘겼다. 필요한 위치에서 입력을 끊어 넣고 과거 상태
(DeltaNet conv/recurrent, 어텐션 KV)를 이어 가면 위치마다 logits 한 줄만 받는다.
브라우저 워커가 하는 방식과 같다(advisor.worker.ts judge).

    python features_chunked.py in.jsonl out.npy
"""
import importlib.util
import json
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("judge_features", os.path.join(HERE, "..", "judge", "features.py"))
F = importlib.util.module_from_spec(spec)
spec.loader.exec_module(F)  # 토크나이저·세션·row() 를 그대로 쓴다

# Colab T4 에서는 CUDA 로 돈다(onnxruntime-gpu[cuda,cudnn]). 1천 토큰에 CPU 16초 → 0.76초, 로짓 차 0.
if os.environ.get("JUDGE_CUDA"):
    import onnxruntime as ort

    # pip 판 CUDA 13·cuDNN 라이브러리(nvidia-*)는 먼저 적재해야 CUDA EP 가 잡힌다
    ort.preload_dlls()
    F.sess = ort.InferenceSession(F.MODEL, providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
    print("providers", F.sess.get_providers(), flush=True)
    # 조용히 CPU 로 떨어지면 20배 느린 채로 한 시간을 쓴다. 바로 멈춘다.
    if "CUDAExecutionProvider" not in F.sess.get_providers():
        raise SystemExit("CUDA EP 를 잡지 못했다")
# 샤드를 여러 프로세스로 나눠 돌릴 때는 스레드를 줄인다. 8스레드 하나보다 3스레드 셋이 빨랐다.
elif os.environ.get("JUDGE_THREADS"):
    import onnxruntime as ort

    so = ort.SessionOptions()
    so.intra_op_num_threads = int(os.environ["JUDGE_THREADS"])
    F.sess = ort.InferenceSession(F.MODEL, so, providers=["CPUExecutionProvider"])

OUTPUTS = [o.name for o in F.sess.get_outputs()]


def present_name(past: str) -> str:
    return past.replace("past_key_values", "present").replace("past_", "present_")


def logits_at(ids, positions):
    state = dict(F.EMPTY)
    start = 0
    rows = []
    for pos in positions:
        chunk = ids[start : pos + 1]
        feeds = dict(state)
        feeds["input_ids"] = np.array([chunk], dtype=np.int64)
        feeds["attention_mask"] = np.ones((1, pos + 1), dtype=np.int64)
        feeds["num_logits_to_keep"] = np.array(1, dtype=np.int64)
        out = dict(zip(OUTPUTS, F.sess.run(None, feeds)))
        rows.append(out["logits"][0, -1][F.SUBSET])
        state = {name: out[present_name(name)] for name in F.EMPTY}
        start = pos + 1
    return np.stack(rows)


def main(src, dst, shard="0/1"):
    """shard="i/n" 이면 n줄마다 i번째 줄만 맡는다. 합칠 때는 merge_shards 로 원래 순서를 되돌린다."""
    index, count = (int(x) for x in shard.split("/"))
    out = []
    t = time.time()
    for n, line in enumerate(open(src)):
        if n % count != index:
            continue
        rec = json.loads(line)
        for qid, q in rec["questions"].items():
            if q.get("label") is None:
                continue
            ids, ends, opts = F.row(rec["state"], q)
            f = logits_at(ids, ends + [len(ids) - 1])
            out.append({"qid": qid, "decide": f[-1], "opts": f[:-1], "label": opts.index(q["label"]), "lang": rec.get("lang"), "line": n})
        if n % 50 == 0:
            print(n, f"{time.time() - t:.0f}s", flush=True)
    np.save(dst, np.array(out, dtype=object), allow_pickle=True)


def merge_shards(parts, dst):
    rows = [r for p in parts for r in np.load(p, allow_pickle=True)]
    rows.sort(key=lambda r: r["line"])  # 같은 줄 안의 kind→mine 순서는 sort 가 지킨다(안정 정렬)
    np.save(dst, np.array(rows, dtype=object), allow_pickle=True)


if __name__ == "__main__":
    if sys.argv[1] == "merge":
        merge_shards(sys.argv[3:], sys.argv[2])
    else:
        main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "0/1")
