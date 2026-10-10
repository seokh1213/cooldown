"""부정·정정 예시 보강만으로 개선되는지, 같은 새 문장에서 전후를 비교한다."""
import hashlib
import importlib
import json

import numpy as np
from sklearn.linear_model import LogisticRegression

common = importlib.import_module("compare-request")
OUT = common.OUT / "negation"


def flatten(languages):
    return [{"text": text, "expected": label, "language": lang}
            for lang, scopes in languages.items() for label, texts in scopes.items() for text in texts]


def scores(classifier, transform, groups):
    result = {}
    for name, rows in groups.items():
        features = transform([row["text"] for row in rows])
        probabilities = classifier.predict_proba(features)
        ranked = np.argsort(probabilities, axis=1)
        result[name] = {**common.evaluate(classifier, features, rows), "rows": [
            {**row, "predicted": str(classifier.classes_[ranked[index, -1]]),
             "confidence": float(probabilities[index, ranked[index, -1]]),
             "margin": float(probabilities[index, ranked[index, -1]] - probabilities[index, ranked[index, -2]])}
            for index, row in enumerate(rows)]}
    return result


def semantic_models(training, extra, groups, vectors):
    results = []
    for name, cache_name, setting in [("arctic", "arctic-v2.json", 8), ("e5-small", "e5-small-q8.json", 32)]:
        cache = common.read(common.ROOT / "dev/research/.cache/request-comparison" / cache_name)
        for key in ["model", "prefix", "digest" if name == "arctic" else "revision"]:
            assert cache["meta"][key] == vectors[name]["meta"][key], "임베딩 캐시 식별자 불일치"
        lookup = {**cache["vectors"], **vectors[name]["vectors"]}
        def transform(texts):
            values = np.array([lookup[common.normalize(text, ["◇"])] for text in texts], dtype=np.float32)
            return values / np.linalg.norm(values, axis=1, keepdims=True)
        stages = {}
        for stage, rows in [("before", training), ("after", training + extra)]:
            classifier = LogisticRegression(C=setting, class_weight="balanced", max_iter=1000)
            classifier.fit(transform([row["text"] for row in rows]), [row["expected"] for row in rows])
            stages[stage] = scores(classifier, transform, groups)
        results.append({"model": name, "embedding": cache["meta"], "C": setting, **stages})
    return results


def character_model(extra, groups):
    training = common.cases("request-training.json") + extra
    states = ["Question: " + common.normalize(row["text"], ["◇"]) +
              ("\nChampions named: " + ", ".join(["◇"] * count) if count else "")
              for row in training for count in range(3)]
    labels = [row["expected"] for row in training for _ in range(3)]
    classifier = LogisticRegression(C=40, class_weight="balanced", max_iter=500)
    classifier.fit(common.matrix(states, 16384), labels)
    transform = lambda texts: common.matrix([common.state(text) for text in texts], 16384)
    return {"model": "character", "before": scores(common.ShippedClassifier(), lambda texts: texts, groups),
            "after": scores(classifier, transform, groups), "limits": "보강 모델은 메모리의 float64 가중치이며 fp16으로 내보내지 않음"}


def main():
    fixture = common.read(common.HERE / "request-negation.json")
    extra, fresh = flatten(fixture["training"]), flatten(fixture["test"])
    training = common.cases("request-training.json")
    groups = {"regression": common.cases("request-test.json"),
              "challenge": flatten(common.read(common.HERE / "request-challenge.json")), "negation": fresh}
    normalize = lambda row: common.normalize(row["text"], ["◇"])
    used = {normalize(row) for row in training + extra}
    assert len(used) == len(training + extra), "학습 문장 중복"
    assert all(normalize(row) not in used for rows in groups.values() for row in rows), "학습·시험 중복"
    vectors = common.read(common.ROOT / "dev/research/.cache/request-comparison/negation-vectors.json")
    models = semantic_models(training, extra, groups, vectors)
    models.append(character_model(extra, groups))
    files = ["request-training.json", "request-test.json", "request-challenge.json", "request-negation.json",
             "compare-request-negation.py", "embed-request-negation.ts", "compare-request.py"]
    report = {"training": len(training), "addedTraining": len(extra), "freshTest": len(fresh), "models": models,
              "sources": {file: hashlib.sha256((common.HERE / file).read_bytes()).hexdigest() for file in files},
              "limits": ["임베딩 인코더를 고정하고 로지스틱 분류기만 재학습", "C는 이전 개발 시험의 설정 그대로, 이번 시험으로 선택하지 않음",
                         "기존 99개는 오류 분석 후 예시를 보강한 회귀 시험이며 독립 평가가 아님", "새 36개는 학습과 문장 중복 없음, 같은 작성자가 만든 작은 모음",
                         "운영 코드·학습 파일·모델 가중치는 변경하지 않음", "판정 시험이며 실제 대화 답변 전체를 검증하지 않음"]}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    for model in models:
        print(model["model"], {stage: {name: f'{group["correct"]}/{group["total"]}' for name, group in model[stage].items()} for stage in ["before", "after"]}, flush=True)


if __name__ == "__main__":
    main()
