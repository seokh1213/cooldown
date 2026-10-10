"""로컬 CPU에서 두 로지스틱 모델을 학습한다. test는 모델 선택에 사용하지 않는다."""
import json
import hashlib
import sys
import time
from pathlib import Path

import numpy as np
import sklearn
from scipy import sparse
from sklearn.feature_extraction import DictVectorizer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score

DIRECTORY = Path("dev/research/llm-evals/stat-query/ml")
CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"
JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"
JONG = " ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ"


def jamo(text):
    out = []
    for ch in text:
        offset = ord(ch) - 0xAC00
        if 0 <= offset <= 11171:
            out.append(CHO[offset // 588] + JUNG[(offset % 588) // 28] + JONG[offset % 28].strip())
        else:
            out.append(ch)
    return "".join(out)


def inputs(rows, kind):
    if kind == "context":
        return [r["features"] for r in rows]
    return [jamo(r["text"]) if kind == "jamo" else r["text"] for r in rows]


def channels_for(name, train, dev):
    vectors, train_parts, dev_parts = [], [], []
    for kind in (["char"] if name == "char" else ["char", "jamo", "context"]):
        vectorizer = DictVectorizer() if kind == "context" else TfidfVectorizer(analyzer="char", ngram_range=(2, 5), min_df=2, max_features=8192)
        train_parts.append(vectorizer.fit_transform(inputs(train, kind)))
        dev_parts.append(vectorizer.transform(inputs(dev, kind)))
        channel = {"kind": kind, "vocabulary": {key: int(value) for key, value in vectorizer.vocabulary_.items()}}
        if kind != "context":
            channel["idf"] = vectorizer.idf_.tolist()
        vectors.append((vectorizer, channel))
    return vectors, sparse.hstack(train_parts).tocsr(), sparse.hstack(dev_parts).tocsr()


def tune_rejection(probabilities, classes, labels):
    order = np.argsort(probabilities, axis=1)
    top = probabilities[np.arange(len(labels)), order[:, -1]]
    gap = top - probabilities[np.arange(len(labels)), order[:, -2]]
    raw = classes[order[:, -1]]
    choices = []
    for confidence in [0.0, 0.4, 0.5, 0.6, 0.7, 0.8]:
        for margin in [0.0, 0.1, 0.2]:
            pred = np.where((top >= confidence) & (gap >= margin), raw, "other")
            # 엉뚱한 질문을 조회로 확정하는 비용을 누락보다 크게 둔다.
            cost = sum(0 if p == y else 3 if y == "other" else 1 if p == "other" else 2 for p, y in zip(pred, labels))
            choices.append((cost, confidence, margin, float(np.mean(pred == labels))))
    cost, confidence, margin, accuracy = min(choices)
    return {"confidence": confidence, "margin": margin, "cost": cost, "accuracy": accuracy}


def train_one(name, train, dev):
    started = time.perf_counter()
    vectors, X, D = channels_for(name, train, dev)
    y = np.array([r["label"] for r in train])
    dy = np.array([r["label"] for r in dev])
    candidates = []
    for C in [0.3, 1.0, 3.0, 10.0, 40.0]:
        clf = LogisticRegression(C=C, max_iter=800, class_weight="balanced", random_state=42)
        clf.fit(X, y)
        f1 = f1_score(dy, clf.predict(D), average="macro")
        rejection = tune_rejection(clf.predict_proba(D), clf.classes_, dy)
        candidates.append((rejection["cost"], -f1, C, clf))
    _, negative_f1, C, clf = min(candidates, key=lambda row: row[:3])
    f1 = -negative_f1
    probabilities = clf.predict_proba(D)
    rejection = tune_rejection(probabilities, clf.classes_, dy)
    model = {"name": name, "labels": clf.classes_.tolist(), "channels": [channel for _, channel in vectors],
             "weights": clf.coef_.tolist(), "bias": clf.intercept_.tolist(),
             "confidence": rejection["confidence"], "margin": rejection["margin"]}
    target = DIRECTORY / f"{name}.json"
    target.write_text(json.dumps(model, ensure_ascii=False, separators=(",", ":")))
    # Python과 Node의 특징·계산이 일치하는지 확인할 fixture.
    fixture = [{"input": {"text": row["text"], "features": row["features"]}, "probabilities": p.tolist()}
               for row, p in zip(dev, probabilities)]
    (DIRECTORY / f"{name}-parity.json").write_text(json.dumps(fixture, ensure_ascii=False))
    return {"name": name, "C": C, "devMacroF1": f1, "rejection": rejection,
            "features": X.shape[1], "bytes": target.stat().st_size, "seconds": time.perf_counter() - started}


def main():
    rows = [json.loads(line) for line in (DIRECTORY / "questions.jsonl").read_text().splitlines()]
    train = [row for row in rows if row["split"] == "train"]
    dev = [row for row in rows if row["split"] == "dev"]
    if {row["family"] for row in train} & {row["family"] for row in dev}:
        raise ValueError("train/dev 표현 계열의 중복")
    results = [train_one(name, train, dev) for name in ["char", "context"]]
    report = {"python": sys.version.split()[0], "sklearn": sklearn.__version__, "numpy": np.__version__,
              "train": len(train), "dev": len(dev), "models": results,
              "trainingSources": {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in [
                  Path("dev/scripts/advisor/stat-classifier/train.py"), Path("dev/scripts/advisor/stat-classifier/build.ts"),
                  Path("dev/scripts/advisor/stat-classifier/noise.ts"), Path("dev/scripts/advisor/stat-classifier/seeds.ts"),
                  Path("dev/scripts/advisor/offline-classifier/request-training.json"), DIRECTORY / "questions.jsonl"]},
              "modelHashes": {name: hashlib.sha256((DIRECTORY / f"{name}.json").read_bytes()).hexdigest()
                              for name in ["char", "context"]}}
    (DIRECTORY / "training.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
