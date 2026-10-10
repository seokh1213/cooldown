"""동일한 요청 범위 자료로 문자·임베딩 분류기를 비교한다. 앱 코드를 변경하지 않는다.

uv run --python 3.13 --with numpy==2.5.3 --with scikit-learn==1.9.1 python dev/scripts/advisor/offline-classifier/compare-request.py
설정 선택은 개발 자료만 사용한다. 최종 시험·추가 질문은 선택 이후 한 번 평가한다.
"""
import hashlib
import json
import pickle
import re
import time
import urllib.request
from pathlib import Path

import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import make_pipeline
from sklearn.svm import LinearSVC

from train import matrix, normalize

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
OUT = ROOT / "dev/research/llm-evals/request-classifier/comparison"
CACHE = ROOT / "dev/research/.cache/request-comparison/arctic-v2.json"
EMBED_MODEL = "snowflake-arctic-embed2:latest"
PREFIX = "query: "


def read(path):
    return json.loads(path.read_text())


def language(text):
    if re.search("[가-힣]", text):
        return "ko_KR"
    return "zh_CN" if re.search("[一-鿿]", text) else "en_US"


def cases(filename):
    return [{"text": text, "expected": label, "language": language(text)}
            for label, texts in read(HERE / filename).items() for text in texts]


def state(text):
    names = ["◇"] * min(text.count("◇"), 2)
    return "Question: " + text + ("\nChampions named: " + ", ".join(names) if names else "")


def softmax(logits):
    values = np.exp(logits - logits.max(axis=1, keepdims=True))
    return values / values.sum(axis=1, keepdims=True)


class ShippedClassifier:
    def __init__(self):
        meta = read(ROOT / "public/models/offline/request-v1.json")
        task = meta["tasks"]["scope"]
        self.classes_ = np.array(task["labels"])
        self.buckets = meta["buckets"]
        data = (ROOT / "public/models/offline/request-v1.bin").read_bytes()
        size = self.buckets * len(self.classes_)
        self.weights = np.frombuffer(data, dtype="<f2", count=size, offset=task["offset"]).reshape(self.buckets, -1).astype(np.float32)
        self.bias = np.array(task["bias"])

    def predict_proba(self, texts):
        return softmax(matrix([state(text) for text in texts], self.buckets) @ self.weights + self.bias)


class CosineCentroids:
    def fit(self, vectors, labels):
        self.classes_ = np.unique(labels)
        self.centroids = np.stack([vectors[np.array(labels) == label].mean(axis=0) for label in self.classes_])
        self.centroids /= np.linalg.norm(self.centroids, axis=1, keepdims=True)
        return self

    def predict_proba(self, vectors):
        # 분류에만 사용한다. 이 유사도 변환은 보정된 확률로 취급하지 않는다.
        return softmax(20 * vectors @ self.centroids.T)


def post(path, body=None):
    request = urllib.request.Request("http://127.0.0.1:11434/api/" + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def embeddings(texts):
    tags = post("tags")
    model = next(row for row in tags["models"] if row["name"] == EMBED_MODEL)
    meta = {"model": EMBED_MODEL, "digest": model["digest"], "prefix": PREFIX}
    cache = read(CACHE) if CACHE.exists() else {}
    vectors = cache.get("vectors", {}) if cache.get("meta") == meta else {}
    missing = list(dict.fromkeys(text for text in texts if text not in vectors))
    started = time.perf_counter()
    for offset in range(0, len(missing), 32):
        batch = missing[offset:offset + 32]
        result = post("embed", {"model": EMBED_MODEL, "input": [PREFIX + text for text in batch],
                               "truncate": False, "keep_alive": "5m"})
        values = result["embeddings"]
        if len(values) != len(batch) or any(len(value) != 1024 for value in values):
            raise ValueError("임베딩 개수 또는 차원이 맞지 않습니다")
        vectors.update(zip(batch, values))
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        CACHE.write_text(json.dumps({"meta": meta, "vectors": vectors}))
        print(f"Embedding {min(offset + len(batch), len(missing))}/{len(missing)}", flush=True)
    data = np.array([vectors[text] for text in texts], dtype=np.float32)
    data /= np.linalg.norm(data, axis=1, keepdims=True)
    return data, {**meta, "engineBytes": model["size"], "cacheMisses": len(missing),
                  "encodeBatchSeconds": round(time.perf_counter() - started, 3)}


def select(options, train_x, train_y, development):
    dev_x, dev_y = development
    fitted = []
    for setting, classifier in options:
        classifier.fit(train_x, train_y)
        probabilities = classifier.predict_proba(dev_x)
        predicted = classifier.classes_[probabilities.argmax(axis=1)]
        score = f1_score(dev_y, predicted, average="macro")
        fitted.append((score, setting, classifier))
    score, setting, classifier = max(fitted, key=lambda row: row[0])
    return classifier, {"setting": setting, "developmentMacroF1": round(float(score), 4)}


def evaluate(classifier, features, rows, confidence=True):
    probabilities = classifier.predict_proba(features)
    predicted = classifier.classes_[probabilities.argmax(axis=1)]
    expected = np.array([row["expected"] for row in rows])
    sorted_probs = np.sort(probabilities, axis=1)
    accepted = (sorted_probs[:, -1] >= .6) & (sorted_probs[:, -1] - sorted_probs[:, -2] >= .2)
    errors = [{**row, "predicted": str(prediction), "score": round(float(probabilities[index].max()), 3)}
              for index, (row, prediction) in enumerate(zip(rows, predicted)) if prediction != row["expected"]]
    per_language = {}
    for lang in ["ko_KR", "en_US", "zh_CN"]:
        mask = np.array([row["language"] == lang for row in rows])
        per_language[lang] = {"correct": int((predicted[mask] == expected[mask]).sum()), "total": int(mask.sum())}
    return {"correct": int((predicted == expected).sum()), "total": len(rows),
            "macroF1": round(float(f1_score(expected, predicted, average="macro")), 4),
            "perLanguage": per_language,
            "accepted": int(accepted.sum()) if confidence else None,
            "acceptedWrong": int((accepted & (predicted != expected)).sum()) if confidence else None,
            "errors": errors}


def timing(predict, samples):
    predict(samples[0])
    durations = []
    for text in samples[:20]:
        start = time.perf_counter()
        predict(text)
        durations.append((time.perf_counter() - start) * 1000)
    return {"p50Ms": round(float(np.median(durations)), 3), "p95Ms": round(float(np.percentile(durations, 95)), 3)}


def classic_candidates():
    def vectorizer():
        return TfidfVectorizer(analyzer="char", ngram_range=(1, 5), sublinear_tf=True)
    logit = [(f"C={c}", make_pipeline(vectorizer(), LogisticRegression(C=c, class_weight="balanced", max_iter=1000)))
             for c in [.5, 2, 8, 32]]
    svm = [(f"C={c}, calibration=3fold", make_pipeline(vectorizer(), CalibratedClassifierCV(
        LinearSVC(C=c, class_weight="balanced", max_iter=3000), cv=3))) for c in [.5, 2, 8, 32]]
    knn = [(f"k={k}, cosine, distance", make_pipeline(vectorizer(), KNeighborsClassifier(
        n_neighbors=k, metric="cosine", weights="distance"))) for k in [1, 3, 5, 9]]
    return [("tfidf-logistic", logit), ("tfidf-svm", svm), ("tfidf-knn", knn)]


def record(name, classifier, setting, evaluation):
    groups, transform = evaluation["groups"], evaluation["transform"]
    semantic, confidence = evaluation.get("semantic", False), evaluation.get("confidence", True)
    result = {"name": name, **setting,
              "classifierBytes": len(pickle.dumps(classifier, protocol=5)), "requiresEmbedding": semantic}
    for key, rows in groups.items():
        result[key] = evaluate(classifier, transform([row["text"] for row in rows]), rows, confidence)
    samples = [row["text"] for row in groups["challenge"]]
    result["warmClassifierLatency"] = timing(lambda text: classifier.predict_proba(transform([text])), samples)
    return result


def export_head(name, classifier, embedding):
    OUT.mkdir(parents=True, exist_ok=True)
    weights = classifier.coef_.astype("<f4")
    binary = weights.tobytes() + classifier.intercept_.astype("<f4").tobytes()
    (OUT / f"{name}.bin").write_bytes(binary)
    (OUT / f"{name}.json").write_text(json.dumps({"version": 1, "embedding": embedding,
        "labels": classifier.classes_.tolist(), "dimensions": weights.shape[1], "dtype": "float32",
        "layout": "classes-first", "biasOffset": weights.nbytes, "weights": f"{name}.bin",
        "weightsSha256": hashlib.sha256(binary).hexdigest()}, ensure_ascii=False, indent=2) + "\n")


def main():
    training = cases("request-training.json")
    dev = cases("request-holdout.json")
    tests = cases("request-test.json")
    challenge = [{"text": text, "expected": label, "language": lang}
        for lang, scopes in read(HERE / "request-challenge.json").items() for label, texts in scopes.items() for text in texts]
    used = {normalize(row["text"], ["◇"]) for row in training}
    assert all(normalize(row["text"], ["◇"]) not in used for row in dev + tests + challenge), "학습·평가 중복"
    train_x = [normalize(row["text"], ["◇"]) for row in training]
    train_y = [row["expected"] for row in training]
    dev_x = [normalize(row["text"], ["◇"]) for row in dev]
    dev_y = [row["expected"] for row in dev]
    groups = {"development": dev, "test": tests, "challenge": challenge}
    normalize_all = lambda texts: [normalize(text, ["◇"]) for text in texts]
    shipped = ShippedClassifier()
    results = [record("shipped-hash-logistic", shipped, {"setting": "app fp16 weights"}, {"groups": groups, "transform": lambda texts: texts})]
    expected = read(ROOT / "dev/research/llm-evals/request-classifier/app-report.json")["scope"]
    assert results[0]["test"]["correct"] == expected["correct"], "Python·실제 앱 판정 불일치"
    for name, options in classic_candidates():
        classifier, setting = select(options, train_x, train_y, (dev_x, dev_y))
        results.append(record(name, classifier, setting, {"groups": groups, "transform": normalize_all}))
        print(f"Completed {name}: dev only settings {setting}", flush=True)
    all_texts = list(dict.fromkeys(train_x + dev_x + normalize_all([row["text"] for row in tests + challenge])))
    vectors, embedding_info = embeddings(all_texts)
    lookup = dict(zip(all_texts, vectors))
    vectorize = lambda texts: np.stack([lookup[text] for text in normalize_all(texts)])
    sem_train, sem_dev = vectorize(train_x), vectorize(dev_x)
    options = [(f"k={k}, cosine, distance", KNeighborsClassifier(n_neighbors=k, metric="cosine", weights="distance")) for k in [1, 3, 5, 9]]
    evaluation = {"groups": groups, "transform": vectorize, "semantic": True}
    classifier, setting = select(options, sem_train, train_y, (sem_dev, dev_y))
    results.append(record("embedding-knn", classifier, setting, evaluation))
    options = [(f"C={c}", LogisticRegression(C=c, class_weight="balanced", max_iter=1000)) for c in [.5, 2, 8, 32]]
    classifier, setting = select(options, sem_train, train_y, (sem_dev, dev_y))
    results.append(record("embedding-logistic", classifier, setting, evaluation))
    export_head("arctic-head", classifier, embedding_info)
    centroid = CosineCentroids().fit(sem_train, train_y)
    results.append(record("embedding-centroid", centroid, {"setting": "normalized mean per class"}, {**evaluation, "confidence": False}))
    embedding_info["warmSingleQueryLatency"] = timing(lambda text: post("embed", {"model": EMBED_MODEL, "input": PREFIX + normalize(text, ["◇"]), "truncate": False, "keep_alive": "5m"}), [row["text"] for row in challenge])
    files = ["request-training.json", "request-holdout.json", "request-test.json", "request-challenge.json", "compare-request.py"]
    report = {"training": len(training), "selection": "개발 73문항의 macro F1로만 설정 선택", "sources": {file: hashlib.sha256((HERE / file).read_bytes()).hexdigest() for file in files},
              "embedding": embedding_info, "models": results,
              "limits": ["수작업 문장 평가이며 실사용 전체 정확도를 뜻하지 않음", "추가 질문 99개 중 알려진 R 오분류 사례 1개 포함", "대상·조건 추출과 답변 품질은 별도 시험", "kNN 투표값은 보정된 확률이 아님", "임베딩 모델은 한 종류이며 LoRA·생성 LLM 비교는 포함하지 않음", "문자 분류 시간은 특징 추출 포함, 임베딩 분류 시간은 임베딩 계산을 별도 기록"]}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"embedding": embedding_info, "models": [{"name": row["name"], "test": row["test"]["correct"], "challenge": row["challenge"]["correct"], "latency": row["warmClassifierLatency"]} for row in results]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
