"""동일한 학습·개발·시험을 작은 다국어 ONNX 모델로 다시 평가한다."""
import hashlib
import importlib
import json

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.neighbors import KNeighborsClassifier

common = importlib.import_module("compare-request")


def main():
    cache = common.read(common.ROOT / "research/.cache/request-comparison/e5-small-q8.json")
    lookup = cache["vectors"]
    training = common.cases("request-training.json")
    dev = common.cases("request-holdout.json")
    tests = common.cases("request-test.json")
    challenge = [{"text": text, "expected": label, "language": lang}
        for lang, scopes in common.read(common.HERE / "request-challenge.json").items() for label, texts in scopes.items() for text in texts]
    def vectorize(texts):
        vectors = np.array([lookup[common.normalize(text, ["◇"])] for text in texts], dtype=np.float32)
        if vectors.shape[1] != 384:
            raise ValueError("E5 차원이 맞지 않습니다")
        return vectors / np.linalg.norm(vectors, axis=1, keepdims=True)
    train_x = vectorize([row["text"] for row in training])
    train_y = [row["expected"] for row in training]
    dev_x = vectorize([row["text"] for row in dev])
    dev_y = [row["expected"] for row in dev]
    groups = {"development": dev, "test": tests, "challenge": challenge}
    options = [(f"k={k}, cosine, distance", KNeighborsClassifier(n_neighbors=k, metric="cosine", weights="distance")) for k in [1, 3, 5, 9]]
    evaluation = {"groups": groups, "transform": vectorize, "semantic": True}
    knn, setting = common.select(options, train_x, train_y, (dev_x, dev_y))
    results = [common.record("e5-knn", knn, setting, evaluation)]
    options = [(f"C={c}", LogisticRegression(C=c, class_weight="balanced", max_iter=1000)) for c in [.5, 2, 8, 32]]
    classifier, setting = common.select(options, train_x, train_y, (dev_x, dev_y))
    results.append(common.record("e5-logistic", classifier, setting, evaluation))
    common.export_head("e5-small-head", classifier, cache["meta"])
    centroid = common.CosineCentroids().fit(train_x, train_y)
    results.append(common.record("e5-centroid", centroid, {"setting": "normalized mean per class"}, {**evaluation, "confidence": False}))
    files = ["request-training.json", "request-holdout.json", "request-test.json", "request-challenge.json", "compare-request.py", "compare-request-small.py", "embed-request-small.ts"]
    report = {"training": len(training), "selection": "개발 73문항의 macro F1로만 설정 선택",
              "sources": {file: hashlib.sha256((common.HERE / file).read_bytes()).hexdigest() for file in files},
              "embedding": cache["meta"], "models": results,
              "limits": ["903문장의 동일 입력·동일 분할", "ONNX q8·Node CPU에서 측정, 모바일 브라우저 속도는 아직 미측정", "kNN 투표값은 보정된 확률이 아님"]}
    (common.OUT / "e5-small-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"embedding": cache["meta"], "models": [{"name": row["name"], "test": row["test"]["correct"], "challenge": row["challenge"]["correct"]} for row in results]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
