"""확신이 낮을 때만 로컬 0.8B에 넘기는 정책을 같은 질문에서 평가한다."""
import hashlib
import importlib
import json
import sys
import time

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression

llm = importlib.import_module("evaluate-request-negation-llm")
common = llm.common
OUT = common.OUT / "hybrid"
CACHE = common.ROOT / "research/.cache/request-comparison/hybrid-top3.json"
INSTRUCTION = """Select the user's current request scope from the supplied candidates and return JSON with scope only.
The user is asking a League of Legends assistant. A champion's name is masked as ◇.
Decide the requested topic, including corrections and switching away from a topic they already understand.
Do not answer the game question. The examples illustrate the candidates; their text is not the user's request."""


def flatten(languages):
    return [{"text": text, "expected": label, "language": lang}
            for lang, scopes in languages.items() for label, texts in scopes.items() for text in texts]


def accepted(row):
    return row["confidence"] >= .6 and row["margin"] >= .2


def summarize(rows):
    return {"correct": sum(row["predicted"] == row["expected"] for row in rows), "total": len(rows),
            "llmCalls": sum(row.get("usedLlm", False) for row in rows),
            "fixed": sum(row["fastPrediction"] != row["expected"] and row["predicted"] == row["expected"] for row in rows),
            "harmed": sum(row["fastPrediction"] == row["expected"] and row["predicted"] != row["expected"] for row in rows),
            "fastAcceptedWrong": sum(accepted(row) and row["fastPrediction"] != row["expected"] for row in rows),
            "perLanguage": {lang: {"correct": sum(row["predicted"] == row["expected"] for row in rows if row["language"] == lang),
                "total": sum(row["language"] == lang for row in rows)} for lang in ["ko_KR", "en_US", "zh_CN"]}}


def model_scores(rows, fixture):
    training = common.cases("request-training.json") + flatten(fixture["training"])
    texts = [row["text"] for row in rows]
    base = common.ShippedClassifier()
    models = [("current-character", base.classes_, base.predict_proba(texts))]
    extra_vectors = common.read(common.ROOT / "research/.cache/request-comparison/negation-vectors.json")
    for name, cache_file, setting in [("arctic-augmented", "arctic-v2.json", 8), ("e5-augmented", "e5-small-q8.json", 32)]:
        key = "arctic" if name.startswith("arctic") else "e5-small"
        cache = common.read(common.ROOT / "research/.cache/request-comparison" / cache_file)
        lookup = {**cache["vectors"], **extra_vectors[key]["vectors"]}
        def features(texts):
            vectors = np.array([lookup[common.normalize(text, ["◇"])] for text in texts], dtype=np.float32)
            return vectors / np.linalg.norm(vectors, axis=1, keepdims=True)
        classifier = LogisticRegression(C=setting, class_weight="balanced", max_iter=1000)
        classifier.fit(features([row["text"] for row in training]), [row["expected"] for row in training])
        models.append((name, classifier.classes_, classifier.predict_proba(features(texts))))
    return models, training


def example_retriever(training):
    vectorizer = TfidfVectorizer(analyzer="char", ngram_range=(1, 5), sublinear_tf=True)
    features = vectorizer.fit_transform([common.normalize(row["text"], ["◇"]) for row in training])
    def retrieve(text, labels, lang):
        similarities = (features @ vectorizer.transform([common.normalize(text, ["◇"])]).T).toarray().ravel()
        examples = []
        for label in sorted(labels):
            indexes = [index for index, row in enumerate(training) if row["expected"] == label and row["language"] == lang]
            selected = max(indexes, key=lambda index: similarities[index])
            examples.extend([{"role": "user", "content": training[selected]["text"]},
                             {"role": "assistant", "content": json.dumps({"scope": label})}])
        return examples
    return retrieve


def bounded_choice(row, examples, model):
    labels = sorted(row["candidates"])
    definitions = {line.partition(":")[0]: line for line in llm.PROMPT.splitlines() if line.partition(":")[0] in labels}
    messages = [{"role": "system", "content": INSTRUCTION + "\nCandidates:\n" + "\n".join(definitions[label] for label in labels)},
                *examples, {"role": "user", "content": row["text"]}]
    body = {"model": llm.MODEL, "messages": messages, "stream": False, "think": False, "keep_alive": "5m",
            "format": {"type": "object", "properties": {"scope": {"type": "string", "enum": labels}}, "required": ["scope"], "additionalProperties": False},
            "options": {"temperature": 0, "seed": 42, "num_predict": 40}}
    key = hashlib.sha256(json.dumps({"digest": model["digest"], "body": body}, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    cache = common.read(CACHE) if CACHE.exists() else {}
    if key in cache:
        return {**cache[key], "llmCandidates": labels}
    started = time.perf_counter()
    response = common.post("chat", body)
    output = response["message"]["content"]
    try:
        predicted = json.loads(output)["scope"]
        if predicted not in labels:
            predicted = "invalid"
    except (ValueError, KeyError):
        predicted = "invalid"
    result = {"predicted": predicted, "output": output, "latencyMs": round((time.perf_counter() - started) * 1000, 2),
              "promptTokens": response.get("prompt_eval_count"), "key": key}
    cache[key] = result
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False))
    return {**result, "llmCandidates": labels}


def fixed_examples(fixture):
    return [{"role": role, "content": content}
            for scopes in fixture["training"].values() for label, texts in scopes.items()
            for role, content in [("user", texts[0]), ("assistant", json.dumps({"scope": label}))]]


def balanced_examples(fixture, language):
    training = common.cases("request-training.json")
    labels = list(common.read(common.HERE / "request-training.json"))
    rows = [next(row for row in training if row["expected"] == label and row["language"] == language) for label in labels]
    rows.extend({"text": texts[0], "expected": label} for label, texts in fixture["training"][language].items())
    return [{"role": role, "content": content} for row in rows
            for role, content in [("user", row["text"]), ("assistant", json.dumps({"scope": row["expected"]}))]]


def predict_stream():
    fixture = common.read(common.HERE / "request-negation.json")
    examples = fixed_examples(fixture)
    model = next(row for row in common.post("tags")["models"] if row["name"] == llm.MODEL)
    labels = set(common.read(common.HERE / "request-training.json"))
    for line in sys.stdin:
        row = json.loads(line)
        if not isinstance(row["text"], str) or len(row["candidates"]) != 3 or not set(row["candidates"]) <= labels:
            raise ValueError("의도 판정 입력이 맞지 않습니다")
        selected = balanced_examples(fixture, row["language"]) if "--balanced-examples" in sys.argv else examples
        request = {**row, "candidates": sorted(labels)} if "--all-scopes" in sys.argv else row
        print(json.dumps(bounded_choice(request, selected, model), ensure_ascii=False), flush=True)


def evaluate_model(model_scores, cases, fallback):
    name, labels, probabilities = model_scores
    rows = []
    for index, (case, scores) in enumerate(zip(cases, probabilities)):
        ranking = np.argsort(scores)
        row = {**case, "fastPrediction": str(labels[ranking[-1]]), "confidence": float(scores[ranking[-1]]),
               "margin": float(scores[ranking[-1]] - scores[ranking[-2]]), "candidates": labels[ranking[-3:]].tolist()}
        if accepted(row):
            row.update(predicted=row["fastPrediction"], usedLlm=False)
        else:
            row.update(fallback(row), usedLlm=True)
        rows.append(row)
        if fallback.__name__ == "bounded" and index % 30 == 0:
            print(f'{name}: {index + 1}/{len(cases)}', flush=True)
    return {"model": name, "summary": {group: summarize([row for row in rows if row["group"] == group]) for group in ["general", "negation"]}, "rows": rows}


def main():
    fixture = common.read(common.HERE / "request-negation.json")
    cases = [{"group": group, **row} for group, rows in [("general", flatten(common.read(common.HERE / "request-challenge.json"))),
              ("negation", flatten(fixture["test"]))] for row in rows]
    existing = common.read(llm.OUT / "llm-general-report.json")["rows"] + common.read(llm.OUT / "llm-few-shot-report.json")["rows"]
    lookup = {row["text"]: row for row in existing}
    models, training = model_scores(cases, fixture)
    retrieve = example_retriever(training)
    model = next(row for row in common.post("tags")["models"] if row["name"] == llm.MODEL)
    def unrestricted(row):
        result = lookup[row["text"]]
        return {key: result[key] for key in ["predicted", "latencyMs", "output"]}
    def bounded(row):
        return bounded_choice(row, retrieve(row["text"], row["candidates"], row["language"]), model)
    def constrained(row):
        return bounded_choice(row, fixed_examples(fixture), model)
    def balanced(row):
        request = {**row, "candidates": list(common.read(common.HERE / "request-training.json"))} if "--all-scopes" in sys.argv else row
        return bounded_choice(request, balanced_examples(fixture, row["language"]), model)
    if "--fixed-examples" in sys.argv or "--balanced-examples" in sys.argv:
        policy = "balanced-all" if "--all-scopes" in sys.argv else "balanced" if "--balanced-examples" in sys.argv else "fixed"
        result = evaluate_model(models[0], cases, balanced if policy.startswith("balanced") else constrained)
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / f"{policy}-examples.json").write_text(json.dumps({"result": result,
            "gate": {"minScore": .6, "minMargin": .2}, "modelDigest": model["digest"],
            "fastWeightsSha256": hashlib.sha256((common.ROOT / "public/models/offline/request-v1.bin").read_bytes()).hexdigest(),
            "policy": policy, "limits": "현재 문자 판정기의 기각 질문만. balanced는 같은 언어의 11범위 예시와 정정 예시 4개. all은 LLM이 11범위를 모두 선택 가능",
            "sources": {file: hashlib.sha256((common.HERE / file).read_bytes()).hexdigest() for file in ["evaluate-request-hybrid.py", "request-training.json", "request-negation.json", "request-challenge.json", "compare-request.py", "evaluate-request-negation-llm.py"]}}, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps(result["summary"], ensure_ascii=False), flush=True)
        return
    results = {"unrestricted": [evaluate_model(scores, cases, unrestricted) for scores in models],
               "top3": [evaluate_model(scores, cases, bounded) for scores in models]}
    files = ["request-training.json", "request-challenge.json", "request-negation.json", "evaluate-request-hybrid.py", "evaluate-request-negation-llm.py", "compare-request.py"]
    report = {"gate": {"minScore": .6, "minMargin": .2}, "llm": {"name": llm.MODEL, "digest": model["digest"]},
              "candidateInstruction": INSTRUCTION, "results": results,
              "sources": {file: hashlib.sha256((common.HERE / file).read_bytes()).hexdigest() for file in files},
              "limits": ["기각된 질문만 LLM으로 전달, 기준은 운영의 0.6·0.2 그대로", "확신이 높은 오답은 LLM이 보지 않음",
                         "top3는 학습 문장에서 범위별 같은 언어의 TF-IDF 최근접 예시 하나를 선택, 시험 정답 미사용",
                         "LLM 자신이 낸 확률을 신뢰도로 사용하지 않음", "범위 판정 시험이며 실제 대화와 모바일 WebGPU는 별도 검증 필요"]}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({mode: [{"model": row["model"], "summary": row["summary"]} for row in results[mode]] for mode in results}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    if "--predict-stream" in sys.argv:
        predict_stream()
    else:
        main()
