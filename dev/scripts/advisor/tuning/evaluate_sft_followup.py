"""Compare frozen base generation and independent SFT on provided/app evidence."""
import argparse
import hashlib
import json
from pathlib import Path
from transformers import AutoTokenizer
from branch_gates import GATES
from generate_onnx import Generator
from qa_context import select_context
from qa_prompts import exact_answer, prompt_ids
from sft_scoring import error_kind, summarize, supported_scalar


def tasks(root, phase):
    rows = [json.loads(line) for line in (root / "dev/data/qa-followup.jsonl").read_text().splitlines()]
    if phase == "provided": return rows
    evidence = {row["id"]: row for row in json.loads((root / "results/app-evidence.json").read_text())}
    return [{**row, "context": select_context(evidence[row["id"]].get("context", ""), row["question"]),
             "goldDocumentReached": evidence[row["id"]]["goldDocumentReached"],
             "appPlan": evidence[row["id"]]["plan"]}
            for row in rows if row["id"] in evidence]


def verify_inputs(root, metadata, phase):
    files = {"dataset": root / "dev/data/qa-followup.jsonl", "baseline": Path(metadata["baselineGraph"]),
             "candidate": Path(metadata["candidateGraph"])}
    if phase == "app": files["evidence"] = root / "results/app-evidence.json"
    hashes = {key: hashlib.sha256(file.read_bytes()).hexdigest() for key, file in files.items()}
    file = root / f"results/{phase}-inputs.json"
    if file.exists() and json.loads(file.read_text()) != hashes:
        raise ValueError("Evaluation inputs changed since saved results")
    file.write_text(json.dumps(hashes, indent=2))


def infer(runtime, tokenizer, row, gate):
    if not row["context"]: return "NOT_FOUND", 0
    ids = prompt_ids(tokenizer, row)
    if len(ids) > 1900: raise ValueError("Grounded generation exceeds app prompt budget")
    eos = {tokenizer.eos_token_id, tokenizer.convert_tokens_to_ids("<|im_end|>")}
    tokens, seconds = runtime.generate(ids, eos, gate=gate, limit=24)
    return exact_answer(tokenizer.decode(tokens, skip_special_tokens=True)), seconds


def collect_summary(rows, phase):
    summaries = {}
    for variant in ["current", "sft"]:
        selected = [row for row in rows if row["variant"] == variant]
        summaries[variant] = {cohort: summarize([row for row in selected if row["cohort"] == cohort])
                              for cohort in sorted({row["cohort"] for row in selected})}
        summaries[variant]["byKind"] = {kind: summarize([row for row in selected if row["kind"] == kind])
                                         for kind in sorted({row["kind"] for row in selected})}
        if phase == "app":
            summaries[variant]["groundedExact"] = sum(row["correct"] and row["goldDocumentReached"] for row in selected)
            summaries[variant]["sourceReached"] = sum(row["goldDocumentReached"] for row in selected)
    return {"phase": phase, "variants": summaries,
            "scope": "Provided-context exact number/unit generation" if phase == "provided" else
                     "Actual frozen single-turn app routing/retrieval + experimental exact number/unit generation; not existing app answer accuracy"}


def evaluate(metadata, phase):
    root = Path(metadata["work"]); (root / "results").mkdir(exist_ok=True)
    verify_inputs(root, metadata, phase); source = tasks(root, phase)
    tokenizer = AutoTokenizer.from_pretrained("Qwen/Qwen3.5-0.8B", local_files_only=True)
    variants = {"current": (Generator(metadata["baselineGraph"], "CPUExecutionProvider"), None),
                "sft": (Generator(metadata["candidateGraph"], "CPUExecutionProvider"), "qa_scale")}
    if not GATES <= variants["sft"][0].runtime.inputs: raise ValueError("Integrated graph is missing an adapter")
    file = root / f"results/{phase}-answers.jsonl"
    results = [json.loads(line) for line in file.read_text().splitlines()] if file.exists() else []
    completed = {(row["id"], row["variant"]) for row in results}
    with file.open("a") as target:
        for index, row in enumerate(source):
            order = list(variants) if index % 2 == 0 else list(reversed(variants))
            for variant in order:
                if (row["id"], variant) in completed: continue
                runtime, gate = variants[variant]; answer, seconds = infer(runtime, tokenizer, row, gate)
                result = {key: row.get(key) for key in ["id", "cohort", "kind", "factGroup", "docId", "question",
                    "answerable", "goldDocumentReached", "conflictingSource"]}
                result.update({"variant": variant, "gold": row["answer"], "answer": answer, "seconds": seconds,
                    "correct": answer == row["answer"], "error": error_kind(answer, row),
                    "goldVisible": row["answer"] in row["context"] if row["answerable"] else None,
                    "verbatimScalar": supported_scalar(answer, row["context"])})
                results.append(result); target.write(json.dumps(result, ensure_ascii=False) + "\n"); target.flush()
            if (index + 1) % 10 == 0:
                print(json.dumps({"phase": phase, "questions": index + 1, "total": len(source),
                    "currentCorrect": sum(row["correct"] for row in results if row["variant"] == "current"),
                    "sftCorrect": sum(row["correct"] for row in results if row["variant"] == "sft")}), flush=True)
    summary = collect_summary(results, phase)
    (root / f"results/{phase}-summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("metadata"); parser.add_argument("phase", choices=["provided", "app"])
    args = parser.parse_args(); evaluate(json.loads(Path(args.metadata).read_text()), args.phase)
