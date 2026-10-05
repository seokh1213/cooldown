"""부정문 few-shot 프롬프트가 기존의 11범위 질문도 처리하는지 확인한다."""
import hashlib
import importlib
import json

llm = importlib.import_module("evaluate-request-negation-llm")
common = llm.common


def main():
    fixture = common.read(common.HERE / "request-negation.json")
    examples = [{"role": role, "content": content}
                for scopes in fixture["training"].values() for label, texts in scopes.items()
                for role, content in [("user", texts[0]), ("assistant", json.dumps({"scope": label}))]]
    cases = [{"text": text, "expected": label, "language": lang}
             for lang, scopes in common.read(common.HERE / "request-challenge.json").items() for label, texts in scopes.items() for text in texts]
    rows = []
    for row in cases:
        rows.append(llm.classify(row, examples))
        if len(rows) % 20 == 0:
            print(f'{len(rows)}/{len(cases)}', flush=True)
    summary = {"correct": sum(row["correct"] for row in rows), "total": len(rows),
               "perLanguage": {lang: {"correct": sum(row["correct"] for row in rows if row["language"] == lang),
                   "total": sum(row["language"] == lang for row in rows)} for lang in ["ko_KR", "en_US", "zh_CN"]}}
    files = ["evaluate-request-negation-general-llm.py", "evaluate-request-negation-llm.py", "request-negation.json", "request-challenge.json"]
    report = {"model": llm.MODEL, "prompt": llm.PROMPT, "examples": examples, "summary": summary, "rows": rows,
              "settings": {"think": False, "temperature": 0, "seed": 42, "num_predict": 40},
              "sources": {file: hashlib.sha256((common.HERE / file).read_bytes()).hexdigest() for file in files},
              "limits": ["few-shot 프롬프트를 고정한 뒤 99개를 모두 평가, 결과로 프롬프트 변경하지 않음",
                         "예시 12개는 4범위만 포함, 전체 범위를 균형 있게 학습한 LLM 비교가 아님", "실제 대화·모바일 WebGPU는 미검증"]}
    (llm.OUT / "llm-general-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(summary, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
