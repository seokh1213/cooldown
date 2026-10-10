"""Pair native base and trained LoRA on fixed held-out/app-selected evidence."""
from contextlib import nullcontext
import json
from pathlib import Path
import shutil
import tarfile
from artifact_io import atomic_json
from base_pilot_model import generate
from checkpoints import publish
from qa_context import select_context
from sft_scoring import error_kind, summarize, supported_scalar


def tasks(root):
    provided = [json.loads(line) for line in (root / "dev/data/qa-followup.jsonl").read_text().splitlines()]
    for row in provided: row["phase"] = "provided"
    file = root / "dev/data/app-evidence.json"
    if not file.exists(): return provided
    evidence = {row["id"]: row for row in json.loads(file.read_text())}
    app = [{**row, "phase": "app", "context": select_context(evidence[row["id"]].get("context", ""), row["question"]),
            "goldDocumentReached": evidence[row["id"]]["goldDocumentReached"]}
           for row in provided if row["id"] in evidence]
    return provided + app


def evaluate(model, tokenizer, root, key):
    model.eval(); rows = tasks(root)
    directory = root / "candidates" / ("sft-" + key); directory.mkdir(parents=True, exist_ok=True)
    file = directory / "answers.jsonl"
    results = [json.loads(line) for line in file.read_text().splitlines()] if file.exists() else []
    completed = {(row["id"], row["phase"], row["variant"]) for row in results}
    with file.open("a") as stream:
        for index, row in enumerate(rows):
            for variant in (["base", "trained"] if index % 2 == 0 else ["trained", "base"]):
                if (row["id"], row["phase"], variant) in completed: continue
                scope = model.model.disable_adapter() if variant == "base" else nullcontext()
                with scope: answer, seconds = generate(model, tokenizer, row)
                result = {field: row.get(field) for field in ["id", "phase", "cohort", "kind", "factGroup", "docId",
                          "question", "answerable", "goldDocumentReached"]}
                result.update(variant=variant, gold=row["answer"], answer=answer, seconds=seconds,
                    correct=answer == row["answer"], error=error_kind(answer, row),
                    verbatimScalar=supported_scalar(answer, row["context"]))
                results.append(result); stream.write(json.dumps(result, ensure_ascii=False) + "\n"); stream.flush()
            if (index + 1) % 20 == 0:
                atomic_json(root / "pilot-progress.json", {"model": key, "phase": "evaluation", "questions": index + 1,
                    "totalQuestions": len(rows), "completedRequests": len(results)})
    summary = {phase: {variant: {cohort: summarize([row for row in results if row["phase"] == phase
                        and row["variant"] == variant and row["cohort"] == cohort])
                        for cohort in sorted({row["cohort"] for row in results})}
                       for variant in ["base", "trained"]} for phase in ["provided", "app"]}
    atomic_json(directory / "evaluation.json", {"scores": summary,
        "scope": "Native FP32 weights with CUDA FP16 autocast; no q4/browser equivalence claim"})
    return summary


def publish_result(root, key, step):
    stage = "sft-" + key
    directory = root / "candidates" / stage
    for source in [root / "dev/data/models.json", root / "dev/data/natural-provenance.json", root / "environment.json"]:
        shutil.copyfile(source, directory / source.name)
    file = root / "checkpoints" / (stage + "-results.tar.gz")
    with tarfile.open(file.with_suffix(".pending"), "w:gz", compresslevel=1) as archive:
        archive.add(directory, arcname=str(directory.relative_to(root)))
    file.with_suffix(".pending").replace(file)
    publish(root, stage + "-results", file, step)
