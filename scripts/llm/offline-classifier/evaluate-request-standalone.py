"""하이브리드와 같은 예시로 모든 요청을 0.8B에 직접 판정시킨다."""
import hashlib
import importlib
import json
import sys

hybrid = importlib.import_module("evaluate-request-hybrid")
common = hybrid.common


def predict(row, fixture, model):
    request = {"text": row["text"], "candidates": list(common.read(common.HERE / "request-training.json"))}
    return hybrid.bounded_choice(request, hybrid.balanced_examples(fixture, row["language"]), model)


def summarize(rows):
    return {"correct": sum(row["correct"] for row in rows), "total": len(rows), "llmCalls": len(rows),
            "perLanguage": {lang: {"correct": sum(row["correct"] for row in rows if row["language"] == lang),
                "total": sum(row["language"] == lang for row in rows)} for lang in ["ko_KR", "en_US", "zh_CN"]}}


def main():
    fixture = common.read(common.HERE / "request-negation.json")
    model = next(row for row in common.post("tags")["models"] if row["name"] == hybrid.llm.MODEL)
    if "--predict-stream" in sys.argv:
        for line in sys.stdin:
            row = json.loads(line)
            print(json.dumps(predict(row, fixture, model), ensure_ascii=False), flush=True)
        return
    groups = {"general": hybrid.flatten(common.read(common.HERE / "request-challenge.json")),
              "negation": hybrid.flatten(fixture["test"])}
    rows = []
    for group, cases in groups.items():
        for case in cases:
            result = predict(case, fixture, model)
            rows.append({**case, "group": group, **result, "correct": result["predicted"] == case["expected"]})
            if len(rows) % 30 == 0:
                print(f"{len(rows)}/135", flush=True)
    summary = {group: summarize([row for row in rows if row["group"] == group]) for group in groups}
    sources = ["evaluate-request-standalone.py", "evaluate-request-hybrid.py", "evaluate-request-negation-llm.py",
               "compare-request.py", "request-training.json", "request-negation.json", "request-challenge.json"]
    report = {"model": {"name": model["name"], "digest": model["digest"], "bytes": model["size"]},
        "policy": "모든 질문을 0.8B로 판정, 로지스틱 후보·점수·정답을 모델에 보내지 않음",
        "examples": {lang: hybrid.balanced_examples(fixture, lang) for lang in fixture["training"]},
        "summary": summary, "rows": rows,
        "sources": {file: hashlib.sha256((common.HERE / file).read_bytes()).hexdigest() for file in sources},
        "limits": ["하이브리드의 balanced-all과 같은 시스템 지시·11범위·언어별 예시 15개·설정",
                   "같은 요청 본문과 모델 digest의 기존 캐시를 재사용, 새 정답으로 프롬프트 조정 없음",
                   "수작업 시험 자료의 범위 판정이며, 독립된 실사용 일반화 정확도가 아님",
                   "로컬 Ollama Q8_0 실행이며 브라우저 Q4·kev LoRA 그래프와 다름"]}
    hybrid.OUT.mkdir(parents=True, exist_ok=True)
    (hybrid.OUT / "standalone.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(summary, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
