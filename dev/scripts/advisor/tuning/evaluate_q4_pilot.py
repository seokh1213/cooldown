"""Evaluate actual browser-format graphs against their own unmodified q4 base."""
import json
from pathlib import Path
import time
from transformers import AutoTokenizer
from artifact_io import atomic_json, sha256
from evaluate_base_pilot import tasks
from generate_onnx import Generator
from qa_prompts import prompt_ids
from sft_scoring import error_kind, summarize, supported_scalar


def evaluate(metadata, specification):
    root = Path(metadata["work"]); key = specification["key"]
    output = root / "results" / key; output.mkdir(parents=True, exist_ok=True)
    fingerprint = {"dataset": sha256(root / "dev/data/qa-followup.jsonl"),
                   "baseGraph": sha256(Path(specification["baseGraph"])),
                   "candidateGraph": sha256(Path(specification["graph"])),
                   "model": specification["model"], "revision": specification["revision"]}
    if (output / "inputs.json").exists() and json.loads((output / "inputs.json").read_text()) != fingerprint:
        raise ValueError("Quantized evaluation inputs changed")
    atomic_json(output / "inputs.json", fingerprint)
    tokenizer = AutoTokenizer.from_pretrained(specification["model"], revision=specification["revision"])
    runtimes = {"base": Generator(specification["baseGraph"], "CPUExecutionProvider"),
                "trained": Generator(specification["graph"], "CPUExecutionProvider")}
    file = output / "answers.jsonl"
    results = [json.loads(line) for line in file.read_text().splitlines()] if file.exists() else []
    completed = {(row["id"], row["phase"], row["variant"]) for row in results}
    rows = tasks(root); started = time.monotonic()
    with file.open("a") as stream:
        for index, row in enumerate(rows):
            ids = prompt_ids(tokenizer, row) if row["context"] else []
            if len(ids) > 1900: raise ValueError("Quantized prompt exceeds common budget")
            for variant in (["base", "trained"] if index % 2 == 0 else ["trained", "base"]):
                if (row["id"], row["phase"], variant) in completed: continue
                gate = "qa_scale" if variant == "trained" else None
                tokens, seconds = runtimes[variant].generate(ids, {tokenizer.eos_token_id}, gate=gate, limit=24) if ids else ([], 0)
                answer = tokenizer.decode(tokens, skip_special_tokens=True).strip() if ids else "NOT_FOUND"
                result = {field: row.get(field) for field in ["id", "phase", "cohort", "kind", "factGroup", "docId",
                          "question", "answerable", "goldDocumentReached"]}
                result.update(variant=variant, gold=row["answer"], answer=answer, seconds=seconds,
                    correct=answer == row["answer"], error=error_kind(answer, row),
                    verbatimScalar=supported_scalar(answer, row["context"]))
                results.append(result); stream.write(json.dumps(result, ensure_ascii=False) + "\n"); stream.flush()
            if (index + 1) % 20 == 0:
                atomic_json(output / "progress.json", {"questions": index + 1, "total": len(rows),
                    "seconds": time.monotonic() - started})
    scores = {phase: {variant: {cohort: summarize([row for row in results if row["phase"] == phase
              and row["variant"] == variant and row["cohort"] == cohort])
              for cohort in sorted({row["cohort"] for row in results})}
              for variant in runtimes} for phase in ["provided", "app"]}
    summary = {"scores": scores, "specification": specification, "inputs": fingerprint,
               "scope": "Actual exported q4 graphs on Mac ORT CPU, 4 threads; no browser timing claim"}
    atomic_json(output / "summary.json", summary)
    return summary


if __name__ == "__main__":
    import sys
    print(json.dumps(evaluate(json.loads(Path(sys.argv[1]).read_text()), json.loads(Path(sys.argv[2]).read_text()))))
