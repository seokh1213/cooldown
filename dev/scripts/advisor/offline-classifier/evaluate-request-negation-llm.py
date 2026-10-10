"""새 부정문 36개와 이전 오류 3개를 로컬 0.8B에 독립 질문으로 판정시킨다."""
import hashlib
import importlib
import json
import sys
import time

import numpy as np

common = importlib.import_module("compare-request")
MODEL = "qwen3.5:0.8b"
OUT = common.OUT / "negation"
PROMPT = """Classify the user's current request to a League of Legends assistant. Output one JSON object with scope only.
overview: champion introduction, basic profile and kit together
statsAll: complete base stat table
stats: specific numeric champion attributes
skills: entire ability kit, passive through ultimate
ability: a named ability's description, effects, cooldown, range or mechanics
combo: order or sequence of attacks and spells
counterplay: responding to an enemy champion or ability
advice: gameplay tips, positioning, builds or using a champion
chat: greetings and thanks
identity: how to use this assistant, its functions or model
other: game rules, interactions, definitions, unrelated requests
Determine what the user wants now. They may mention an earlier topic that they already understand or explicitly reject.
Do not answer the game question. The symbol ◇ stands for a champion's name."""


def classify(row, examples):
    start = time.perf_counter()
    response = common.post("chat", {"model": MODEL, "stream": False, "think": False, "keep_alive": "5m",
        "messages": [{"role": "system", "content": PROMPT}, *examples, {"role": "user", "content": row["text"]}],
        "format": {"type": "object", "properties": {"scope": {"type": "string", "enum": list(common.read(common.HERE / "request-training.json"))}},
                   "required": ["scope"], "additionalProperties": False},
        "options": {"temperature": 0, "seed": 42, "num_predict": 40}})
    content = response["message"]["content"]
    try:
        predicted = json.loads(content)["scope"]
    except (ValueError, KeyError):
        predicted = "invalid"
    return {**row, "predicted": predicted, "correct": predicted == row["expected"], "output": content,
            "latencyMs": round((time.perf_counter() - start) * 1000, 2),
            "loadMs": round(response.get("load_duration", 0) / 1e6, 2), "tokens": response.get("eval_count")}


def main():
    fixture = common.read(common.HERE / "request-negation.json")
    few_shot = "--few-shot" in sys.argv
    examples = [{"role": role, "content": content}
                for scopes in fixture["training"].values() for label, texts in scopes.items()
                for role, content in [("user", texts[0]), ("assistant", json.dumps({"scope": label}))]] if few_shot else []
    fresh = [{"text": text, "expected": label, "language": lang}
             for lang, scopes in fixture["test"].items() for label, texts in scopes.items() for text in texts]
    previous = common.read(common.OUT / "report.json")
    errors = next(model for model in previous["models"] if model["name"] == "embedding-logistic")["challenge"]["errors"]
    cases = [("fresh", row) for row in fresh] + [("knownErrors", {key: row[key] for key in ["text", "expected", "language"]}) for row in errors]
    model = next(row for row in common.post("tags")["models"] if row["name"] == MODEL)
    rows = []
    for group, row in cases:
        rows.append({"group": group, **classify(row, examples)})
        print(f'{len(rows)}/{len(cases)} {group}: {rows[-1]["correct"]}', flush=True)
    summary = {}
    for group in ["fresh", "knownErrors"]:
        selected = [row for row in rows if row["group"] == group]
        summary[group] = {"correct": sum(row["correct"] for row in selected), "total": len(selected),
                          "perLanguage": {lang: {"correct": sum(row["correct"] for row in selected if row["language"] == lang),
                              "total": sum(row["language"] == lang for row in selected)} for lang in ["ko_KR", "en_US", "zh_CN"]}}
    sources = ["request-negation.json", "evaluate-request-negation-llm.py"]
    report = {"model": {"name": MODEL, "digest": model["digest"], "bytes": model["size"]}, "prompt": PROMPT, "examples": examples,
              "settings": {"think": False, "temperature": 0, "seed": 42, "num_predict": 40}, "summary": summary, "rows": rows,
              "warmLatencyMs": {"p50": float(np.median([row["latencyMs"] for row in rows[1:]])),
                                "p95": float(np.percentile([row["latencyMs"] for row in rows[1:]], 95))},
              "sources": {file: hashlib.sha256((common.HERE / file).read_bytes()).hexdigest() for file in sources},
              "limits": ["고정 프롬프트와 단일 실행 결과, LoRA 학습 없음", "few-shot은 학습 자료에서 범위별 첫 문장 12개를 사용, 시험 문장 미사용", "분류만 시험, 실제 대화 미연결",
                         "알려진 오류 3개와 새 문장 36개를 별도로 집계", "초기 1회는 warmLatencyMs 집계에서 제외"]}
    OUT.mkdir(parents=True, exist_ok=True)
    filename = "llm-few-shot-report.json" if few_shot else "llm-report.json"
    (OUT / filename).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"summary": summary, "warmLatencyMs": report["warmLatencyMs"]}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
