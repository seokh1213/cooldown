import json
import hashlib
import argparse
from pathlib import Path
from collections import defaultdict

import numpy as np
from scipy.sparse import csr_matrix
from sklearn.linear_model import LogisticRegression

ROOT = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser()
parser.add_argument("--cache", default="research/.cache/context-frames/20261007/training")
parser.add_argument("--out", default="research/llm-evals/workflow/models/context-selector.json")
options = parser.parse_args()
CACHE = ROOT / options.cache
DIMENSION = 4096 * 7 + 8


def load(split):
    rows = [json.loads(line) for line in (CACHE / f"{split}.jsonl").read_text().splitlines()]
    columns, values, pointers = [], [], [0]
    for row in rows:
        for column, value in row["features"]:
            columns.append(column)
            values.append(value)
        pointers.append(len(columns))
    matrix = csr_matrix((values, columns, pointers), shape=(len(rows), DIMENSION))
    return rows, matrix, np.array([row["y"] for row in rows])


def accuracy(rows, probabilities, confidence, margin):
    groups = defaultdict(list)
    for row, probability in zip(rows, probabilities):
        groups[row["id"]].append((row, probability))
    passed, kinds = 0, defaultdict(list)
    for entries in groups.values():
        entries.sort(key=lambda entry: -entry[1])
        best, probability = entries[0]
        expected = best["expected"]
        if probability < confidence:
            selected = []
        elif best["key"] == best["latest"]:
            selected = [best["key"]]
        elif len(entries) > 1 and probability - entries[1][1] < margin:
            selected = [row["key"] for row, score in entries if score >= confidence]
        else:
            selected = [best["key"]]
        correct = set(selected) == set(expected)
        passed += correct
        kinds[best["id"].split(":")[1]].append(correct)
    return float(np.mean([np.mean(values) for values in kinds.values()])), passed / len(groups)


train_rows, train_x, train_y = load("train")
dev_rows, dev_x, _ = load("dev")
best, trials = None, []
for regularization in [1, 10, 100]:
    model = LogisticRegression(C=regularization, max_iter=600, class_weight="balanced", random_state=7)
    model.fit(train_x, train_y)
    probabilities = model.predict_proba(dev_x)[:, 1]
    for confidence in [.4, .5, .6]:
        for margin in [.02, .05, .1, .2]:
            macro, exact = accuracy(dev_rows, probabilities, confidence, margin)
            trial = dict(C=regularization, confidence=confidence, margin=margin, macroAccuracy=macro, exactAccuracy=exact)
            trials.append(trial)
            if best is None or (macro, exact) > best[0]:
                best = ((macro, exact), model, trial, probabilities)
_, model, selection, probabilities = best
artifact = dict(featureVersion=1, weights=model.coef_[0].tolist(), intercept=float(model.intercept_[0]),
                confidence=selection["confidence"], margin=selection["margin"])
target = ROOT / options.out
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(artifact, separators=(",", ":")) + "\n")
parity = [{"features": row["features"], "probability": float(probability)}
          for row, probability in list(zip(dev_rows, probabilities))[::max(1, len(dev_rows) // 40)]]
(CACHE / "parity.json").write_text(json.dumps(parity))
templates = lambda rows: len(set(":".join(row["id"].split(":")[:3]) for row in rows))
report = dict(trainPairs=len(train_rows), devPairs=len(dev_rows), trainTemplates=templates(train_rows),
              devTemplates=templates(dev_rows), dimension=DIMENSION, selection=selection, trials=trials,
              bytes=target.stat().st_size, sha256=hashlib.sha256(target.read_bytes()).hexdigest())
(CACHE / "training.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({key: value for key, value in report.items() if key != "trials"}))
