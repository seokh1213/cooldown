"""Qwen3.5-0.8B + LoRA 대조 학습(질문 <-> 정답 문서), Colab T4.

  python embed_lora_train.py --pool eol|mean --epochs 3 --amp
  이어 학습: --init_from <adapter> --ep_offset 1 --best_prev <그때 검증 R@1>   (무료 세션이 1~2시간이면 회수된다)
입력 /content/data: corpus-{ko_KR,en_US,zh_CN}.json, train.jsonl(학습·검증 9:1), queries.jsonl(시험 — 벡터만 만든다)
출력 /content/runs/<pool>: log.jsonl, ep<n>/·best/ (adapter), emb-pre.npz(학습 전), emb-ep<n>.npz(score.py 꼴)
에폭 고르기는 검증(train.jsonl 의 10%) R@1 로만 한다.
"""
import argparse, json, os, random, time
import numpy as np
import torch
import torch.nn.functional as F

ap = argparse.ArgumentParser()
ap.add_argument("--pool", default="eol")
ap.add_argument("--epochs", type=int, default=3)
ap.add_argument("--steps", type=int, default=0, help="에폭당 걸음 제한(시험용)")
ap.add_argument("--bq", type=int, default=32)
ap.add_argument("--nd", type=int, default=48)
ap.add_argument("--lr", type=float, default=1e-4)
ap.add_argument("--tau", type=float, default=0.05)
ap.add_argument("--amp", action="store_true")
ap.add_argument("--max_len", type=int, default=512)
ap.add_argument("--base", default="Qwen/Qwen3.5-0.8B")
ap.add_argument("--no_final", action="store_true")
ap.add_argument("--skip_pre", action="store_true")
ap.add_argument("--init_from", default="", help="이어 학습: 이 adapter 에서 시작(옵티마이저 상태는 새로)")
ap.add_argument("--ep_offset", type=int, default=0, help="이미 마친 에폭 수(학습률 일정을 이어 간다)")
ap.add_argument("--best_prev", type=float, default=-1)
a = ap.parse_args()

D = "/content/data"; OUT = f"/content/runs/{a.pool}"; os.makedirs(OUT, exist_ok=True)
LANGS = ["ko_KR", "en_US", "zh_CN"]; DOC_CHARS = 600
EOL = {"ko_KR": '이 글 "{}" 을 한 낱말로 줄이면:', "en_US": 'This text: "{}" means in one word:', "zh_CN": '这段话"{}"用一个词概括是：'}
docs = {l: json.load(open(f"{D}/corpus-{l}.json")) for l in LANGS}
dix = {l: {d["id"]: i for i, d in enumerate(docs[l])} for l in LANGS}
doc_text = lambda d: f"{d['title']}\n{d['text'][:DOC_CHARS]}"
train = [json.loads(x) for x in open(f"{D}/train.jsonl")]
test = [json.loads(x) for x in open(f"{D}/queries.jsonl")]
rng = random.Random(0)
idx = list(range(len(train))); rng.shuffle(idx)
nval = len(train) // 10
val = [train[i] for i in idx[:nval]]; tr = [train[i] for i in idx[nval:]]
tr_pos = [q for q in tr if q["gold"]]
print(f"학습 {len(tr)}(답 있음 {len(tr_pos)}) 검증 {len(val)}", flush=True)

from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig, get_peft_model
tok = AutoTokenizer.from_pretrained(a.base)
PAD = tok.pad_token_id if tok.pad_token_id is not None else tok.eos_token_id
lm = AutoModelForCausalLM.from_pretrained(a.base, dtype=torch.float32, attn_implementation="sdpa").model
targets = ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj",
           "in_proj_qkv", "in_proj_z", "in_proj_a", "in_proj_b", "out_proj"]
if a.init_from:
    from peft import PeftModel
    lm = PeftModel.from_pretrained(lm, a.init_from, is_trainable=True)
else:
    lm = get_peft_model(lm, LoraConfig(task_type="FEATURE_EXTRACTION", r=16, lora_alpha=32, lora_dropout=0.05, target_modules=targets))
lm.print_trainable_parameters()
dev = "cuda"; lm.to(dev)
lm.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
lm.enable_input_require_grads() if hasattr(lm, "enable_input_require_grads") else None

def ids_of(text, lang):
    s = EOL[lang].format(text) if a.pool == "eol" else text
    return tok.encode(s, add_special_tokens=False)[:a.max_len]

def encode(id_lists):
    L = max(len(x) for x in id_lists)
    inp = torch.full((len(id_lists), L), PAD, dtype=torch.long)
    att = torch.zeros((len(id_lists), L), dtype=torch.long)
    for i, x in enumerate(id_lists):   # 오른쪽 채움: 인과 모델이라 실제 토큰 자리는 채움의 영향을 안 받는다
        inp[i, :len(x)] = torch.tensor(x); att[i, :len(x)] = 1
    inp, att = inp.to(dev), att.to(dev)
    with torch.autocast("cuda", dtype=torch.float16, enabled=a.amp):
        h = lm(input_ids=inp, attention_mask=att).last_hidden_state.float()
    if a.pool == "eol":
        last = att.sum(1) - 1
        v = h[torch.arange(h.shape[0], device=dev), last]
    else:
        m = att.unsqueeze(-1).float()
        v = (h * m).sum(1) / m.sum(1)
    return F.normalize(v, dim=-1)

@torch.no_grad()
def embed_all(texts_langs, bs=16):
    lm.eval(); out = []
    order = sorted(range(len(texts_langs)), key=lambda i: len(texts_langs[i][0]))
    res = [None] * len(texts_langs)
    for s in range(0, len(order), bs):
        chunk = order[s:s + bs]
        v = encode([ids_of(*texts_langs[i]) for i in chunk]).cpu().numpy()
        for i, x in zip(chunk, v): res[i] = x
    return np.stack(res)

def doc_embs():
    return {l: embed_all([(doc_text(d), l) for d in docs[l]]) for l in LANGS}

def val_metric(dv):
    qs = [q for q in val if q["gold"]]
    qv = embed_all([(q["q"], q["lang"]) for q in qs])
    r1 = r3 = 0
    for q, v in zip(qs, qv):
        s = dv[q["lang"]] @ v; order = np.argsort(-s)
        g = {dix[q["lang"]][x] for x in q["gold"] if x in dix[q["lang"]]}
        r1 += order[0] in g; r3 += bool(g & set(order[:3].tolist()))
    return r1 / len(qs), r3 / len(qs)

def save_npz(path, dv):
    qv = embed_all([(q["q"], q["lang"]) for q in test])
    np.savez(path, q=qv, **{f"d_{l}": dv[l] for l in LANGS})
    print("저장", path, qv.shape, flush=True)

log = open(f"{OUT}/log.jsonl", "a")
def rec(**k):
    print(json.dumps(k, ensure_ascii=False), flush=True); log.write(json.dumps(k, ensure_ascii=False) + "\n"); log.flush()

t0 = time.time()
with lm.disable_adapter():
    dv = doc_embs() if not (a.skip_pre or a.init_from) else None; r = val_metric(dv) if dv else (0, 0)
    if dv is not None and not a.no_final: save_npz(f"{OUT}/emb-pre.npz", dv)
rec(epoch=a.ep_offset, pre=not a.init_from, val_r1=r[0], val_r3=r[1], sec=round(time.time() - t0))
best = (r[0], 0) if not a.init_from else (a.best_prev, a.ep_offset)

params = [p for p in lm.parameters() if p.requires_grad]
opt = torch.optim.AdamW(params, lr=a.lr, weight_decay=0.01)
steps_per_ep = len(tr_pos) // a.bq if not a.steps else a.steps
total = steps_per_ep * a.epochs
sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1.0, (s + 1) / max(1, total // 10)) * max(0.0, (total - s) / total))
scaler = torch.amp.GradScaler("cuda", init_scale=1024.0, enabled=a.amp)
step = steps_per_ep * a.ep_offset
for _ in range(a.ep_offset): [sched.step() for _ in range(steps_per_ep)]
for ep in range(a.ep_offset + 1, a.epochs + 1):
    lm.train()
    # 언어별 묶음: 같은 언어 문서끼리만 겨룬다(검색도 질문 언어 문서 안에서 한다)
    batches = []
    for l in LANGS:
        ql = [q for q in tr_pos if q["lang"] == l]; rng.shuffle(ql)
        batches += [ql[i:i + a.bq] for i in range(0, len(ql) - a.bq + 1, a.bq)]
    rng.shuffle(batches)
    if a.steps: batches = batches[:a.steps]
    for b in batches:
        l = b[0]["lang"]
        gold = [[dix[l][x] for x in q["gold"] if x in dix[l]] for q in b]
        pos = sorted({g for gs in gold for g in gs})
        rest = [i for i in range(len(docs[l])) if i not in set(pos)]; rng.shuffle(rest)
        dsel = pos + rest[:max(0, a.nd - len(pos))]
        where = {d: j for j, d in enumerate(dsel)}
        qv = encode([ids_of(q["q"], l) for q in b])
        dvv = encode([ids_of(doc_text(docs[l][d]), l) for d in dsel])
        logits = qv @ dvv.T / a.tau
        mask = torch.zeros_like(logits, dtype=torch.bool)
        for i, gs in enumerate(gold):
            for g in gs: mask[i, where[g]] = True
        # 정답이 여럿이면 모두 양성: -log(sum_pos / sum_all)
        loss = (torch.logsumexp(logits, 1) - torch.logsumexp(logits.masked_fill(~mask, -1e4), 1)).mean()
        opt.zero_grad(set_to_none=True)
        scaler.scale(loss).backward()
        scaler.unscale_(opt); gn = torch.nn.utils.clip_grad_norm_(params, 1.0)
        scaler.step(opt); scaler.update(); sched.step(); step += 1
        if step % 10 == 0 or step <= 3 or a.steps:
            rec(step=step, loss=round(loss.item(), 4), gn=round(float(gn), 3), scale=scaler.get_scale() if a.amp else 1, lB=round(float(sum(p.detach().float().norm()**2 for n, p in lm.named_parameters() if 'lora_B' in n)**0.5), 4), sec=round(time.time() - t0), mem=round(torch.cuda.max_memory_allocated() / 1e9, 1))
    dv = doc_embs(); r = val_metric(dv)
    rec(epoch=ep, val_r1=r[0], val_r3=r[1], sec=round(time.time() - t0))
    lm.save_pretrained(f"{OUT}/ep{ep}")
    save_npz(f"{OUT}/emb-ep{ep}.npz", dv)
    if r[0] > best[0]:
        best = (r[0], ep)
        lm.save_pretrained(f"{OUT}/best")
rec(best_epoch=best[1], best_val_r1=best[0])
print("DONE", flush=True)
