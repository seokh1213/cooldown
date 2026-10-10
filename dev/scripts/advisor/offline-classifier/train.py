#!/usr/bin/env python
"""
오프라인 판정기 학습 — 모델(0.8B)을 받지 않은 기기에서 판정 헤드 자리를 대신하는 작은 글 분류기

판정기(`src/features/advisor/model/judge.ts`)는 0.8B 의 속내에 헤드를 얹는다. 모델이 없는 기기는 한국어 낱말 목록
(`askWords.ts`, `conversation.ts` actFromWords …)으로 갈랐고 영어·중국어에서는 거의 아무것도 못 가렸다.
여기서는 같은 학습 자료(kev 헤드 자료, `dev/research/llm-evals/offline-classifier/data/`)로 과제마다
다항 로지스틱 회귀 하나를 학습해 `public/models/offline/judge.{json,bin}` 으로 내보낸다.
브라우저 쪽 계산은 `src/features/advisor/model/offlineJudge.ts` — **특징 뽑기·해시가 이 파일과 한 글자도 다르면 안 된다.**

특징(둘이 같아야 하는 것):
  1. 상태 글에서 첫 "Question: " / "New message: " 줄의 글이 메시지, "Champions named: " 또는
     "Champion named in the new message: " 줄이 이름 목록
  2. ASCII 만 소문자로 → 이름을 긴 것부터 " ◇ " 로 바꿈(내 챔피언 고르기는 후보 하나를 " ★ " 로) →
     공백([ \\t\\n\\r\\f\\v\\u00a0\\u3000]+)을 한 칸으로
  3. "^" + 글 + "$" 의 코드 포인트 1~3-gram ("c:" + gram), 공백으로 나눈 낱말 ("w:" + 낱말),
     깃발 "f:names=0|1|2", "f:script=hangul|han|latin|other"
  4. 키를 UTF-8 바이트로 FNV-1a 32비트 해시 → 버킷 = 해시 % B. 벡터는 있는 버킷마다 1/sqrt(버킷 수)
  5. 로짓 = W[버킷] 합 + 편향, softmax. W 는 fp16, 버킷-우선(row-major [B, C])

과제: 갈래 9칸(kind)·주제 8칸(topic)·대화 흐름 7칸(act, lookup 포함)은 라벨을 고르고, 내 챔피언(mine)은 후보
이름마다 "★ 가 내 챔피언인가"(no/yes)를 매겨 후보끼리 1 로 맞춘다(mode "option").

사용:
  uv run --python 3.13 --with numpy --with scikit-learn python dev/scripts/advisor/offline-classifier/train.py
    [--buckets 16384] [--out public/models/offline/judge] [--fixture dev/tests/fixtures/offline-judge.json]
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import time
from collections import Counter
from dataclasses import dataclass

import numpy as np
from scipy import sparse
from sklearn.linear_model import LogisticRegression

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
DATA = os.path.join(ROOT, "dev/research", "llm-evals", "offline-classifier", "data")
EVALS = os.path.join(ROOT, "dev/research", "llm-evals", "kev-agent")

PLACEHOLDER = " ◇ "
MARK = " ★ "
FNV_OFFSET = 2166136261
FNV_PRIME = 16777619
WS = re.compile("[ \t\n\r\f\v 　]+")

# 앱이 묻는 과제. 지시문으로 알아본다(`routeAsk.ts`, `topicJudge.ts`, `conversation.ts`).
TASKS = {
    "kind": "What is this League of Legends question asking for?",
    "topic": "Which part of the game is this question about?",
    "act": "What is the new message?",
    "mine": "Which champion does the user play? (The other one is the opponent.)",
}
MODES = {"kind": "label", "topic": "label", "act": "label", "mine": "option"}
MINE_LABELS = ["no", "yes"]
# 과제마다 쓰는 자료(kev 헤드 자료를 그대로). 학습·개발 나누기는 파일이 아니라 글 단위로 한다 — 같은 글이
# 여러 상성 쌍에 되풀이돼 들어 있어 파일로 나누면 개발 점수가 부풀었다(act 는 서로 다른 글이 300여 개뿐).
FILES = {
    "kind": ["head_train.jsonl", "head_train_rest.jsonl", "head_dev.jsonl", "kind_lookup.jsonl"],
    "topic": ["topic-train.jsonl", "head_train.jsonl", "head_train_rest.jsonl", "head_dev.jsonl"],
    "act": ["head_train.jsonl", "head_train_rest.jsonl", "head_dev.jsonl", "act_contrast.jsonl", "lookup_dev.jsonl"],
    "mine": ["head_train.jsonl", "head_train_rest.jsonl", "head_dev.jsonl"],
}
ALL_FILES = sorted({f for fs in FILES.values() for f in fs})


# ---------- 특징(offlineJudge.ts 와 같아야 한다) ----------
def fnv1a32(key: str) -> int:
    h = FNV_OFFSET
    for b in key.encode("utf-8"):
        h ^= b
        h = (h * FNV_PRIME) & 0xFFFFFFFF
    return h


def ascii_lower(text: str) -> str:
    return "".join(chr(ord(c) + 32) if "A" <= c <= "Z" else c for c in text)


def parse_state(state: str) -> tuple[str, list[str]]:
    message: str | None = None
    names: list[str] = []
    for line in state.split("\n"):
        if message is None and line.startswith("Question: "):
            message = line[len("Question: "):]
        elif message is None and line.startswith("New message: "):
            message = line[len("New message: "):]
        elif line.startswith("Champions named: "):
            names = [n for n in line[len("Champions named: "):].split(", ") if n]
        elif line.startswith("Champion named in the new message: "):
            names = [line[len("Champion named in the new message: "):]]
    return message or "", names


def normalize(message: str, names: list[str], mark: str | None = None) -> str:
    """이름은 ◇, 표시한 후보(mark)는 ★. 긴 이름부터, 같은 길이는 적힌 순서(이름 목록 뒤에 후보)."""
    text = ascii_lower(message)
    targets = list(names) + ([mark] if mark and mark not in names else [])
    for name in sorted(targets, key=len, reverse=True):
        if name:
            text = text.replace(ascii_lower(name), MARK if name == mark else PLACEHOLDER)
    return " ".join(w for w in WS.split(text) if w)


def script_of(text: str) -> str:
    if any("가" <= c <= "힣" or "ᄀ" <= c <= "ᇿ" or "㄰" <= c <= "㆏" for c in text):
        return "hangul"
    if any("一" <= c <= "鿿" or "㐀" <= c <= "䶿" for c in text):
        return "han"
    if any("a" <= c <= "z" for c in text):
        return "latin"
    return "other"


def feature_keys(message: str, names: list[str], mark: str | None = None) -> set[str]:
    text = normalize(message, names, mark)
    keys: set[str] = set()
    chars = list("^" + text + "$")
    for n in (1, 2, 3):
        for i in range(len(chars) - n + 1):
            keys.add("c:" + "".join(chars[i : i + n]))
    for w in text.split(" "):
        if w:
            keys.add("w:" + w)
    keys.add(f"f:names={min(len(names), 2)}")
    keys.add("f:script=" + script_of(text))
    return keys


def buckets_of(state: str, B: int, mark: str | None = None) -> list[int]:
    message, names = parse_state(state)
    return sorted({fnv1a32(k) % B for k in feature_keys(message, names, mark)})


def matrix(states: list[str], B: int, marks: list[str | None] | None = None) -> sparse.csr_matrix:
    rows, cols, vals = [], [], []
    for i, s in enumerate(states):
        b = buckets_of(s, B, marks[i] if marks else None)
        v = 1 / math.sqrt(len(b))
        rows.extend([i] * len(b))
        cols.extend(b)
        vals.extend([v] * len(b))
    return sparse.csr_matrix((vals, (rows, cols)), shape=(len(states), B), dtype=np.float32)


# ---------- 자료 ----------
def read_jsonl(path: str):
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


def test_messages() -> set[str]:
    """시험 문항의 글. 학습에서 뺀다(같은 글이 자료에 섞여 있었다: lookup-test 8, act-test 5)."""
    out: set[str] = set()
    with open(os.path.join(EVALS, "route-large3.json"), encoding="utf-8") as f:
        out.update(c["question"].strip() for c in json.load(f)["cases"])
    for name, key in [("act-test.jsonl", "text"), ("lookup-test.jsonl", "text")]:
        out.update(r[key].strip() for r in read_jsonl(os.path.join(EVALS, name)))
    for d in read_jsonl(os.path.join(EVALS, "a-set.jsonl")):
        out.update(t["text"].strip() for t in d["turns"])
    topic_cases = os.path.join(ROOT, "dev/scripts", "llm", "lib", "topicCases.ts")
    with open(topic_cases, encoding="utf-8") as f:
        out.update(m.group(1) for m in re.finditer(r'\["[a-z-]+", \[[^\]]*\], (?:"[a-z]+"|undefined), "([^"]+)"\]', f.read()))
    return out


KO_PARTICLE = "(?:으로는|으로|로는|로|는|은|이|가|를|을|의|한테는|한테|에게|이랑|랑|와|과|도|상대로|상대)?"
EN_BEFORE = r"(?:\b(?:as|vs\.?|versus|against|with|playing|play|into|facing|fighting|vs)\s+)?"
ZH_BEFORE = "(?:用|玩|对面是|对面|对线|对上|对|打|我是|我玩|我用|遇到|碰到)?"


def strip_names(message: str, names: list[str]) -> str | None:
    """이름(과 붙은 조사·전치사)을 떼어 이름 없는 이어 묻기 꼴로 만든다. 이름이 글에 없었으면 None.

    대화 270턴의 이어 묻기는 이렇게 만든 것이다("그레이브즈로 언제 진입해" → "언제 진입해"). 시험 문항과 같은 글이
    되면 `exclude` 가 거른다.
    """
    text = message
    for name in sorted(names, key=len, reverse=True):
        if not name:
            continue
        n = re.escape(name)
        text = re.sub(EN_BEFORE + n + r"(?:'s)?" + KO_PARTICLE + r"(?![가-힣A-Za-z])", " ", text, flags=re.I)
        text = re.sub(ZH_BEFORE + n, " ", text)
    text = " ".join(text.split())
    text = re.sub(r"^[\s,，、:：]+|[\s,，、]+(?=[?？!！.。]*$)", "", text)
    text = " ".join(text.split())
    if text == " ".join(message.split()) or len(text) < 4:
        return None
    return text


def borrowed(task: str, other: str, label: str, names: int) -> str | None:
    """다른 과제의 예를 이 과제의 라벨로 옮긴다. 특징은 메시지와 이름 수뿐이라 상태 글의 첫 줄 꼴은 상관없다.

    대화 흐름 자료의 이름 없는 이어 묻기("언제 진입해", "build path")가 갈래 자료에는 없어서 갈래 판정기가 잡담으로
    갈랐고, 앱이 그것을 앞 상성에서 떼어 냈다(대화 270턴 F 112 중 30턴). 반대로 갈래 자료의 공략 질문(이름 하나)은
    흐름의 "상대 바꾸기" 예가 된다(흐름 자료의 enemy·mine 은 서로 다른 글이 20여 개뿐).
    """
    if task == "kind" and other == "act":
        return {"followup": "guide", "enemy": "guide", "mine": "guide", "flip": "guide", "lookup": "spellStat"}.get(label)
    if task == "kind" and other == "topic":
        return "matchup" if names >= 2 else "guide" if names == 1 else None
    if task == "act" and other == "kind" and names <= 1:
        if label == "guide":
            return "enemy" if names == 1 else None
        if label == "spellStat":
            return "new" if names == 1 else "lookup"
        if label in ("skills", "item", "rune", "spell", "game", "chat"):
            return "new"
    if task == "act" and other == "topic" and names == 1:
        return "enemy"
    return None


@dataclass
class Example:
    state: str
    mark: str | None
    split_text: str
    label: str
    original: bool


class Pool:
    """(정규화 글, 이름 수) 마다 예 하나. 원래 과제의 예가 빌린 예보다 먼저다."""

    def __init__(self):
        self.entries: dict[tuple[str, int, str], Example] = {}
        self.by_text: dict[tuple[str, int], set[tuple[str, int, str]]] = {}

    def add(self, text: str, n: int, ex: Example):
        slot = self.by_text.setdefault((text, n), set())
        key = (text, n, ex.label)
        if not ex.original:
            if slot:
                return
        else:
            for k in [k for k in slot if not self.entries[k].original]:
                del self.entries[k]
                slot.discard(k)
        self.entries[key] = ex
        slot.add(key)


def load_task(task: str, exclude: set[str], dev_share: float, augment: bool):
    """(학습 예, 개발 예, 선택지 순서). 개발은 글의 해시로 뗀다 — 빌린 예도 같은 해시를 쓰므로 한 글이 갈라지지 않는다."""
    pool = Pool()
    criteria: list[str] | None = None
    for name in ALL_FILES if augment else FILES[task]:
        for row in read_jsonl(os.path.join(DATA, name)):
            message, names = parse_state(row["state"])
            if message.strip() in exclude:
                continue
            for other, q in row["questions"].items():
                if other not in TASKS or q["instructions"] != TASKS[other]:
                    continue
                if other == task and task == "mine":
                    options = list(q["criteria"].keys())
                    criteria = MINE_LABELS
                    for option in options:
                        label = "yes" if option == q["label"] else "no"
                        pool.add(normalize(message, names, option), min(len(names), 2), Example(row["state"], option, normalize(message, names), label, True))
                    continue
                if other == task:
                    order = list(q["criteria"].keys())
                    if criteria is None:
                        criteria = order
                    elif order != criteria:
                        raise SystemExit(f"{task}: 선택지 순서가 다르다 {name}: {order} vs {criteria}")
                    text = normalize(message, names)
                    pool.add(text, min(len(names), 2), Example(row["state"], None, text, q["label"], True))
                    continue
                if not augment or task == "mine":
                    continue
                label = borrowed(task, other, q["label"], len(names))
                if label is not None:
                    text = normalize(message, names)
                    state = f"Question: {message}" + ("\nChampions named: " + ", ".join(names) if names else "")
                    pool.add(text, min(len(names), 2), Example(state, None, text, label, False))
                # 이름을 뗀 꼴: 갈래는 공략(이름 없음), 흐름은 같은 상성의 이어 묻기
                stripped_label = {"kind": "guide", "act": "followup"}.get(task)
                if stripped_label and names and (other == "topic" or (other == "kind" and q["label"] in ("guide", "matchup"))):
                    stripped = strip_names(message, names)
                    if stripped and stripped.strip() not in exclude:
                        text = normalize(stripped, [])
                        pool.add(text, 0, Example(f"Question: {stripped}", None, text, stripped_label, False))
    assert criteria
    train, dev = [], []
    for ex in pool.entries.values():
        (dev if fnv1a32("split:" + ex.split_text) % 1000 < dev_share * 1000 else train).append(ex)
    return train, dev, criteria


# ---------- 학습 ----------
def softmax(z: np.ndarray) -> np.ndarray:
    z = z - z.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)


def predict(X: sparse.csr_matrix, W: np.ndarray, b: np.ndarray) -> np.ndarray:
    return softmax(np.asarray(X @ W) + b)


def mine_probs(state: str, options: list[str], W: np.ndarray, b: np.ndarray, B: int) -> list[float]:
    """후보마다 P(yes) 를 매겨 후보끼리 1 로 맞춘다(offlineJudge.ts answerOffline 의 option 모드와 같다)."""
    X = matrix([state] * len(options), B, list(options))
    yes = predict(X, W, b)[:, 1]
    total = float(yes.sum())
    return [float(p / total) if total > 0 else 1 / len(options) for p in yes]


def train_task(task: str, B: int, Cs: list[float], exclude: set[str], seed: int, dev_share: float, balanced: bool, augment: bool):
    train, dev, criteria = load_task(task, exclude, dev_share, augment)
    idx = {c: i for i, c in enumerate(criteria)}
    y_tr = np.array([idx[ex.label] for ex in train])
    y_dev = np.array([idx[ex.label] for ex in dev])
    X_tr = matrix([ex.state for ex in train], B, [ex.mark for ex in train])
    X_dev = matrix([ex.state for ex in dev], B, [ex.mark for ex in dev])
    print(f"[{task}] train {len(train)} dev {len(dev)} classes {criteria}")
    print(f"[{task}] train labels {dict(Counter(ex.label for ex in train))}")
    best = None
    for C in Cs:
        t0 = time.time()
        clf = LogisticRegression(C=C, max_iter=3000, tol=1e-6, random_state=seed, class_weight="balanced" if balanced else None)
        clf.fit(X_tr, y_tr)
        W = clf.coef_.T.astype(np.float32)  # [B, C]
        b = clf.intercept_.astype(np.float32)
        if W.shape[1] == 1:  # 이진(no/yes)은 sklearn 이 한 열로 낸다 → 두 열로
            W = np.concatenate([np.zeros_like(W), W], axis=1)
            b = np.concatenate([np.zeros_like(b), b])
        W16 = W.astype(np.float16).astype(np.float32)
        acc = (predict(X_dev, W16, b).argmax(1) == y_dev).mean()
        acc_tr = (predict(X_tr, W16, b).argmax(1) == y_tr).mean()
        print(f"[{task}] C={C:<5} dev {acc:.4f} ({int(round(acc * len(y_dev)))}/{len(y_dev)}) train {acc_tr:.4f} {time.time() - t0:.1f}s")
        if best is None or acc > best[0]:
            best = (acc, C, W16, b)
    acc, C, W, b = best
    pred = predict(X_dev, W, b).argmax(1)
    conf = Counter((criteria[g], criteria[p]) for g, p in zip(y_dev, pred) if g != p)
    print(f"[{task}] 고른 C={C} dev {acc:.4f}; 틀린 짝(정답→예측): {conf.most_common(12)}")
    return {"criteria": criteria, "W": W, "b": b, "C": C, "dev": float(acc), "dev_n": int(len(dev)), "train_n": int(len(train))}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--buckets", type=int, default=16384)
    ap.add_argument("--out", default=os.path.join(ROOT, "public", "models", "offline", "judge"))
    ap.add_argument("--fixture", default=os.path.join(ROOT, "dev/tests", "fixtures", "offline-judge.json"))
    ap.add_argument("--C", default="0.5,1,2,4,8,16")
    ap.add_argument("--tasks", default=",".join(TASKS))
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--dev-share", type=float, default=0.15)
    ap.add_argument("--no-balanced", dest="balanced", action="store_false", help="class_weight 없이(기본은 balanced — act 개발 73→78)")
    ap.add_argument("--no-augment", dest="augment", action="store_false", help="다른 과제의 예를 빌리지 않고(`borrowed`, `strip_names`)")
    args = ap.parse_args()
    B = args.buckets
    Cs = [float(c) for c in args.C.split(",")]
    exclude = test_messages()
    print(f"시험 문항 글 {len(exclude)}개는 학습에서 뺀다")

    results = {}
    for task in args.tasks.split(","):
        results[task] = train_task(task, B, Cs, exclude, args.seed, args.dev_share, args.balanced, args.augment)

    # ----- 내보내기: json(머리) + bin(fp16 가중치, 과제 순서대로 이어 붙임) -----
    meta = {
        "version": 1,
        "hash": "fnv1a32",
        "buckets": B,
        "ngram": [1, 3],
        "placeholder": PLACEHOLDER,
        "mark": MARK,
        "dtype": "float16",
        "tasks": {},
    }
    blob = bytearray()
    for task, r in results.items():
        W16 = r["W"].astype(np.float16)
        meta["tasks"][task] = {
            "instructions": TASKS[task],
            "mode": MODES[task],
            "labels": r["criteria"],
            "offset": len(blob),
            "bias": [float(x) for x in r["b"]],
            "C": r["C"],
            "balanced": args.balanced,
            "augment": args.augment,
            "dev": round(r["dev"], 4),
            "devCount": r["dev_n"],
            "trainCount": r["train_n"],
        }
        blob.extend(W16.tobytes(order="C"))
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out + ".json", "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    with open(args.out + ".bin", "wb") as f:
        f.write(blob)
    print(f"→ {args.out}.json ({os.path.getsize(args.out + '.json')} B), {args.out}.bin ({len(blob)} B)")

    # ----- TS 시험용 고정값: 해시·버킷·확률 -----
    hash_cases = ["", "a", "c:^가", "w:darius", "가렌 vs 다리우스", "\U0001f642 emoji", "f:names=2"]
    states = [
        "Question: 나 말파인데 아트록스 어케 상대함\nChampions named: 말파이트, 아트록스",
        "Question: How do I beat Darius as Garen?\nChampions named: Darius, Garen",
        "Question: 大龙多久刷新",
        "Earlier in this chat the user asked how to play Garen against Darius.\nNew message: why?",
        "Earlier in this chat the user asked how to play 가렌 against 다리우스.\nNew message: 야스오로 하면?\nChampion named in the new message: 야스오",
        "Question: 我是塞拉斯，对面维克托怎么打\nChampions named: 塞拉斯, 维克托",
    ]
    fixture = {"hashes": {k: fnv1a32(k) for k in hash_cases}, "buckets": B, "cases": []}
    for s in states:
        message, names = parse_state(s)
        X = matrix([s], B)
        probs = {task: [float(p) for p in predict(X, r["W"], r["b"])[0]] for task, r in results.items() if MODES[task] == "label"}
        case = {"state": s, "normalized": normalize(message, names), "buckets": buckets_of(s, B), "probs": probs}
        if "mine" in results and len(names) == 2:
            case["marked"] = [normalize(message, names, n) for n in names]
            case["mine"] = mine_probs(s, names, results["mine"]["W"], results["mine"]["b"], B)
        fixture["cases"].append(case)
    with open(args.fixture, "w", encoding="utf-8") as f:
        json.dump(fixture, f, ensure_ascii=False, indent=1)
    print(f"→ {args.fixture}")


if __name__ == "__main__":
    main()
