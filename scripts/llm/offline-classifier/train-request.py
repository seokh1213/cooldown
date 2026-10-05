"""문장 예시로 요청 범위와 노트 주제를 학습한다. 실행 중 단어 규칙을 만들지 않는다.

uv run --python 3.13 --with numpy==2.5.3 --with scikit-learn==1.9.1 python scripts/llm/offline-classifier/train-request.py
검증 문장은 별도 파일로 고정하며 학습에 사용하지 않는다.
"""
import json
import hashlib
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression

from train import matrix, normalize, parse_state

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
BUCKETS = 16384
TASK_INSTRUCTION = "Which response scope does this request need?"


def state(text):
    names = ["◇"] * min(2, text.count("◇"))
    return "Question: " + text + ("\nChampions named: " + ", ".join(names) if names else "")


def fit_task(states, labels, order, instruction):
    classifier = LogisticRegression(C=40, max_iter=500, solver="lbfgs", class_weight="balanced")
    classifier.fit(matrix(states, BUCKETS), [order.index(label) for label in labels])
    weights = classifier.coef_.T.astype("<f2")
    meta = {"instructions": instruction, "mode": "label", "labels": order,
            "bias": classifier.intercept_.tolist()}
    return meta, weights, classifier


def evaluate(classifier, holdout, order):
    rows = [(label, text) for label, texts in holdout.items() for text in texts]
    probabilities = classifier.predict_proba(matrix([state(text) for _, text in rows], BUCKETS))
    errors = []
    for (label, text), probabilities_row in zip(rows, probabilities):
        predicted = order[int(probabilities_row.argmax())]
        if predicted != label:
            errors.append({"text": text, "expected": label, "predicted": predicted,
                           "confidence": round(float(probabilities_row.max()), 3)})
    return {"total": len(rows), "correct": len(rows) - len(errors), "errors": errors}


def topic_examples(directory):
    training_path = Path(directory) / "topic-train.jsonl"
    test_path = Path(directory) / "topic-test.jsonl"
    for options in [["--n", "5000", "--out", str(training_path)], ["--test", str(test_path)]]:
        subprocess.run(["npx", "tsx", "scripts/llm/build-topic-train.ts", *options], cwd=ROOT,
                       check=True, stdout=subprocess.DEVNULL)
    rows = [json.loads(line) for line in training_path.read_text().splitlines()]
    tests = [json.loads(line) for line in test_path.read_text().splitlines()]
    def normalized_key(row):
        text, names = parse_state(row["state"])
        return normalize(text, names)
    held = {normalized_key(row) for row in tests}
    unique = {normalized_key(row): row for row in rows if normalized_key(row) not in held}
    return list(unique.values()), tests


def main():
    training = json.loads((HERE / "request-training.json").read_text())
    holdout = json.loads((HERE / "request-holdout.json").read_text())
    training_texts = {text for texts in training.values() for text in texts}
    overlap = training_texts & {text for texts in holdout.values() for text in texts}
    if overlap:
        raise ValueError(f"학습·검증 문장 중복: {sorted(overlap)}")
    order = list(training)
    rows = [(label, text) for label, texts in training.items() for text in texts]
    # 이름 개수는 답의 의미를 결정하지 않는다. 같은 문장을 세 개의 이름 수로 균형 학습한다.
    balanced = [(label, "Question: " + normalize(text, ["◇"]) +
                 ("\nChampions named: " + ", ".join(["◇"] * count) if count else ""))
                for label, text in rows for count in range(3)]
    meta, weights, classifier = fit_task([text for _, text in balanced],
                                       [label for label, _ in balanced], order, TASK_INSTRUCTION)
    meta["offset"] = 0
    with tempfile.TemporaryDirectory() as directory:
        topic_train, topic_tests = topic_examples(directory)
    topic_order = list(topic_train[0]["questions"]["topic"]["criteria"])
    topic_meta, topic_weights, topic_classifier = fit_task([row["state"] for row in topic_train],
        [row["questions"]["topic"]["label"] for row in topic_train], topic_order,
        "Which part of the game is this question about?")
    topic_meta["offset"] = weights.nbytes
    directory = ROOT / "public/models/offline"
    directory.mkdir(parents=True, exist_ok=True)
    source_files = [HERE / "request-training.json", HERE / "train-request.py", HERE / "train.py",
                    ROOT / "scripts/llm/build-topic-train.ts"]
    source_hashes = {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
                     for path in source_files}
    binary = weights.tobytes() + topic_weights.tobytes()
    model = {"version": 1, "hash": "fnv1a32", "buckets": BUCKETS, "ngram": [1, 3],
             "trainingSources": source_hashes, "weightsSha256": hashlib.sha256(binary).hexdigest(),
             "placeholder": " ◇ ", "dtype": "float16", "tasks": {"scope": meta, "topic": topic_meta}}
    (directory / "request-v1.json").write_text(json.dumps(model, ensure_ascii=False, indent=2) + "\n")
    (directory / "request-v1.bin").write_bytes(binary)
    topic_predictions = topic_classifier.predict(matrix([row["state"] for row in topic_tests], BUCKETS))
    topic_correct = sum(topic_order[int(pred)] == row["questions"]["topic"]["label"]
                        for pred, row in zip(topic_predictions, topic_tests))
    report = {"training": len(rows), "balancedTrainingRows": len(balanced), "scopeDevelopment": evaluate(classifier, holdout, order),
              "topicTraining": len(topic_train), "topicHoldout": {"correct": topic_correct, "total": len(topic_tests)},
              "weightsBytes": weights.nbytes + topic_weights.nbytes}
    report_path = ROOT / "research/llm-evals/request-classifier/report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
