"""Compare direct, routed, and SFT generation on the same held-out spans."""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from transformers import AutoTokenizer
from generate_onnx import Generator
from qa_prompts import exact_answer, prompt_ids


def predict(generator, tokenizer, row, variant):
    eos = {tokenizer.eos_token_id, tokenizer.convert_tokens_to_ids("<|im_end|>")}
    seconds = 0; route = None
    if variant == "routing":
        ids, seconds = generator.generate(prompt_ids(tokenizer, row, "route"), eos, limit=8)
        route = tokenizer.decode(ids, skip_special_tokens=True).strip().upper()
        if route != "YES": return "NOT_FOUND", seconds, route
    task = "extract" if variant == "routing" else "answer"
    ids, duration = generator.generate(prompt_ids(tokenizer, row, task), eos,
                                       gate="lora_scale" if variant == "sft" else None, limit=24)
    answer = tokenizer.decode(ids, skip_special_tokens=True)
    return exact_answer(answer), seconds + duration, route


def summarize(rows):
    positive = [r for r in rows if r["answerable"]]
    negative = [r for r in rows if not r["answerable"]]
    times = [r["seconds"] for r in rows]
    return {"correct": sum(r["correct"] for r in rows), "total": len(rows),
            "positiveCorrect": sum(r["correct"] for r in positive), "positiveTotal": len(positive),
            "negativeCorrect": sum(r["correct"] for r in negative), "negativeTotal": len(negative),
            "medianSeconds": float(np.median(times)), "p95Seconds": float(np.percentile(times, 95)),
            "routeCorrect": sum(r["route"] == ("YES" if r["answerable"] else "NO") for r in rows)}


def evaluate(root, variant, graph, options):
    root = Path(root); results = root / "results"; results.mkdir(exist_ok=True)
    provider = options["provider"]; prefix = options.get("prefix", "qa")
    graph = Path(graph)
    tokenizer = AutoTokenizer.from_pretrained("Qwen/Qwen3.5-0.8B")
    generator = Generator(graph, provider)
    source = [json.loads(line) for line in (root / "data" / options.get("dataset", "qa-test.jsonl")).read_text().splitlines()]
    file = results / f"{prefix}-{variant}.jsonl"
    rows = [json.loads(line) for line in file.read_text().splitlines()] if file.exists() else []
    completed = {r["id"] for r in rows}
    with file.open("a") as target:
        for row in source:
            if row["id"] in completed: continue
            answer, seconds, route = predict(generator, tokenizer, row, variant)
            result = {"id": row["id"], "lang": row["lang"], "docId": row["docId"],
                      "gold": row["answer"], "answerable": row["answerable"], "answer": answer,
                      "correct": answer == row["answer"], "seconds": seconds, "route": route}
            rows.append(result); target.write(json.dumps(result, ensure_ascii=False) + "\n"); target.flush()
            if len(rows) % 20 == 0: print(json.dumps({"variant": variant, **summarize(rows)}), flush=True)
    summary = {"variant": variant, **summarize(rows), "provider": provider,
               "graphSha256": hashlib.sha256(graph.read_bytes()).hexdigest(),
               "scope": ("Held-out natural Korean questions, provided context; not full RAG or browser latency"
                         if options.get("dataset") == "qa-natural-test.jsonl" else
                         "Held-out synthetic numeric-span copying; not general RAG or browser latency")}
    (results / f"{prefix}-{variant}.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("root"); parser.add_argument("variant")
    parser.add_argument("graph"); parser.add_argument("--provider", default="CPUExecutionProvider")
    parser.add_argument("--dataset", default="qa-test.jsonl"); parser.add_argument("--prefix", default="qa")
    args = parser.parse_args(); evaluate(args.root, args.variant, args.graph, vars(args))
