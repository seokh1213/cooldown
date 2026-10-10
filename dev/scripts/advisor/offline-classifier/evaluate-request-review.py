"""두 판정이 다를 때만 같은 0.8B로 요청 범위를 재검토한다."""
import hashlib
import importlib
import json
import sys
import time

standalone = importlib.import_module("evaluate-request-standalone")
hybrid = standalone.hybrid
common = hybrid.common
CACHE = common.ROOT / "dev/research/.cache/request-comparison/dual-review.json"
EXAMPLES = common.HERE / "request-review-examples.json"
PROMPT = """Resolve a disagreement about a user's CURRENT request to a League of Legends assistant.
Choose one of the two candidate scopes, or clarify if neither fits or the request is ambiguous.
The candidates are unordered. Neither is trusted. Do not answer the game question.
Focus on what is requested now, not earlier topics that the user rejects or already understands.
A champion name is masked as ◇. Return JSON:
scope: one candidate, or clarify
slots: only explicitly requested ability slots, P/Q/W/E/R. Do not expand a whole-kit request into slots.
breadth: specific for a named skill or attribute; all for an entire kit or stat table;
mixed for champion profile plus kit; unspecified for other requests.
excludedScopes: topics explicitly rejected or finished, not topics simply absent.
evidence: an exact nonempty quote from the user question supporting the requested scope.
Do not invent an evidence quote. A single ability description differs from a whole-kit introduction."""


def review_pair(row, model):
    candidates = sorted({row["fastPrediction"], row["initialPrediction"]})
    labels = list(common.read(common.HERE / "request-training.json"))
    definitions = {line.partition(":")[0]: line for line in hybrid.llm.PROMPT.splitlines() if line.partition(":")[0] in candidates}
    examples = common.read(EXAMPLES)[row["language"]]
    messages = [{"role": "system", "content": PROMPT + "\nCandidates:\n" + "\n".join(definitions[label] for label in candidates)}]
    for example in examples:
        if example["result"]["scope"] in candidates:
            messages.extend([{"role": "user", "content": example["text"]},
                             {"role": "assistant", "content": json.dumps(example["result"], ensure_ascii=False)}])
    messages.append({"role": "user", "content": row["text"]})
    properties = {"scope": {"type": "string", "enum": candidates + ["clarify"]},
        "slots": {"type": "array", "items": {"type": "string", "enum": list("PQWER")}, "uniqueItems": True},
        "breadth": {"type": "string", "enum": ["specific", "all", "mixed", "unspecified"]},
        "excludedScopes": {"type": "array", "items": {"type": "string", "enum": labels}, "uniqueItems": True},
        "evidence": {"type": "string"}}
    body = {"model": hybrid.llm.MODEL, "messages": messages, "stream": False, "think": False, "keep_alive": "5m",
        "format": {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False},
        "options": {"temperature": 0, "seed": 42, "num_predict": 160}}
    key = hashlib.sha256(json.dumps({"digest": model["digest"], "body": body}, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    cache = common.read(CACHE) if CACHE.exists() else {}
    if key in cache:
        return cache[key]
    start = time.perf_counter()
    response = common.post("chat", body)
    output = response["message"]["content"]
    reason = ""
    try:
        result = json.loads(output)
        if set(result) != set(properties) or result["scope"] not in candidates + ["clarify"]:
            raise ValueError("invalid-schema")
        if result["breadth"] not in properties["breadth"]["enum"]:
            raise ValueError("invalid-breadth")
        for field, allowed in [("slots", list("PQWER")), ("excludedScopes", labels)]:
            if not isinstance(result[field], list) or not set(result[field]) <= set(allowed) or len(result[field]) != len(set(result[field])):
                raise ValueError("invalid-" + field)
        if not isinstance(result["evidence"], str) or not result["evidence"].strip() or result["evidence"] not in row["text"]:
            raise ValueError("unsupported-evidence")
        if result["scope"] in result["excludedScopes"]:
            raise ValueError("selected-excluded-scope")
        if result["scope"] == "clarify":
            reason = "model-clarify"
    except (ValueError, KeyError, TypeError) as error:
        reason = str(error)
        result = {"scope": "clarify"}
    value = {"predicted": result["scope"], "abstained": result["scope"] == "clarify", "reason": reason,
        "extraction": result, "output": output, "reviewKey": key, "reviewLatencyMs": round((time.perf_counter() - start) * 1000, 2),
        "reviewPromptTokens": response.get("prompt_eval_count")}
    cache[key] = value
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False))
    return value


def predict(row, fixture, model):
    first = standalone.predict(row, fixture, model)
    result = {"initialPrediction": first["predicted"], "initialKey": first["key"], "reviewed": False,
              "predicted": first["predicted"], "abstained": False}
    if first["predicted"] == "invalid":
        return {**result, "predicted": "clarify", "abstained": True, "reason": "invalid-initial"}
    if first["predicted"] != row["fastPrediction"]:
        result.update(review_pair({**row, "initialPrediction": first["predicted"]}, model), reviewed=True)
    return result


def summarize(rows):
    return {"correct": sum(row["correct"] for row in rows), "total": len(rows),
        "reviewCalls": sum(row["reviewed"] for row in rows), "initialCalls": len(rows),
        "abstained": sum(row["abstained"] for row in rows),
        "fastWrongFixed": sum(row["fastPrediction"] != row["expected"] and row["correct"] for row in rows),
        "fastCorrectLost": sum(row["fastPrediction"] == row["expected"] and not row["correct"] for row in rows),
        "hybridWrongFixed": sum(row["hybridPrediction"] != row["expected"] and row["correct"] for row in rows),
        "hybridCorrectLost": sum(row["hybridPrediction"] == row["expected"] and not row["correct"] for row in rows)}


def main():
    fixture = common.read(common.HERE / "request-negation.json")
    model = next(row for row in common.post("tags")["models"] if row["name"] == hybrid.llm.MODEL)
    if "--predict-stream" in sys.argv:
        for line in sys.stdin:
            row = json.loads(line)
            result = standalone.predict(row, fixture, model) if row.get("operation") == "initial" else predict(row, fixture, model)
            print(json.dumps(result, ensure_ascii=False), flush=True)
        return
    baseline = common.read(hybrid.OUT / "balanced-all-examples.json")
    expected_digest = common.read(hybrid.OUT / "standalone.json")["model"]["digest"]
    if model["digest"] != expected_digest:
        raise ValueError("기존 비교와 모델 digest가 다릅니다")
    actual_hash = hashlib.sha256((common.ROOT / "public/models/offline/request-v1.bin").read_bytes()).hexdigest()
    if actual_hash != baseline["fastWeightsSha256"]:
        raise ValueError("기존 문자 판정기의 가중치가 바뀌었습니다")
    rows = []
    for case in baseline["result"]["rows"]:
        request = {key: case[key] for key in ["text", "language", "fastPrediction"]}
        result = predict(request, fixture, model)
        rows.append({**request, "expected": case["expected"], "group": case["group"], "confidence": case["confidence"],
            "margin": case["margin"], "hybridPrediction": case["predicted"], **result, "correct": result["predicted"] == case["expected"]})
        if len(rows) % 30 == 0:
            print(f"{len(rows)}/135", flush=True)
    sources = ["evaluate-request-review.py", "request-review-examples.json", "evaluate-request-standalone.py",
               "evaluate-request-hybrid.py", "request-training.json", "request-negation.json", "request-challenge.json"]
    report = {"model": {"name": model["name"], "digest": model["digest"], "bytes": model["size"]}, "prompt": PROMPT,
        "policy": "두 판정이 같으면 채택, 다르면 점수와 판정기 이름을 가린 두 후보만 재판정. 불명확·형식 실패는 되묻기",
        "summary": {group: summarize([row for row in rows if row["group"] == group]) for group in ["general", "negation"]},
        "rows": rows, "sources": {file: hashlib.sha256((common.HERE / file).read_bytes()).hexdigest() for file in sources},
        "limits": ["되묻기는 정답 수에 포함하지 않음", "인용이 실제 질문에 있는지만 검사하며 인용의 의미적 타당성을 보장하지 않음",
                   "기존 질문을 본 뒤 설계한 회귀 시험. 독립적인 실사용 정확도가 아님", "실제 동시 실행 속도·브라우저 Q4는 미측정",
                   "최초 0.8B 판정은 이전과 동일한 요청 캐시를 재사용. 같은 모델에 다른 프롬프트로 재판정"]}
    (hybrid.OUT / "dual-review.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report["summary"], ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
