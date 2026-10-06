"""Full paired WebGPU evaluation, with answer records flushed by the page."""
import json
from pathlib import Path
import subprocess
from artifact_io import atomic_json, sha256
from evaluate_base_pilot import tasks
from sft_scoring import error_kind, summarize, supported_scalar


def browser(*arguments):
    result = subprocess.run(["pnpm", "dlx", "agent-browser@0.38.2", "--session", "cooldown-base-pilot",
                             "--webgpu", *arguments], capture_output=True, text=True, timeout=90)
    if result.returncode: raise RuntimeError("Browser pilot command failed")


def score(records, rows):
    source = {(row["id"], row["phase"]): row for row in rows}; results = []; seen = set()
    for record in records:
        key = (record["id"], record["phase"])
        identity = (*key, record["gate"])
        if key not in source or identity in seen or record["gate"] not in [0, 1]:
            raise ValueError("Unexpected or duplicate browser answer")
        seen.add(identity); row = source[key]
        if record["gold"] != row["answer"]: raise ValueError("Browser gold answer changed")
        result = {field: row.get(field) for field in ["id", "phase", "cohort", "kind", "factGroup", "docId",
                                                    "question", "answerable", "goldDocumentReached"]}
        result.update(variant="trained" if record["gate"] else "base", gold=row["answer"],
                      answer=record["answer"], seconds=record["seconds"], correct=record["answer"] == row["answer"],
                      error=error_kind(record["answer"], row), verbatimScalar=supported_scalar(record["answer"], row["context"]))
        results.append(result)
    if len(seen) != len(rows) * 2: raise ValueError("Incomplete browser answer set")
    scores = {phase: {variant: {cohort: summarize([row for row in results if row["phase"] == phase
              and row["variant"] == variant and row["cohort"] == cohort])
              for cohort in sorted({row["cohort"] for row in results})}
              for variant in ["base", "trained"]} for phase in ["provided", "app"]}
    return results, scores


def evaluate(metadata, key):
    root = Path(metadata["work"]); output = root / "results" / (key + "-browser-full")
    output.mkdir(parents=True, exist_ok=True)
    specs = json.loads((root / "browser-specs.json").read_text())
    graph = root / "models" / specs["models"][key]["graph"].removeprefix("/models/")
    fingerprints = {"graph": sha256(graph), "dataset": sha256(root / "data/qa-followup.jsonl"),
                    "evidence": sha256(root / "data/app-evidence.json")}
    atomic_json(output / "inputs.json", fingerprints)
    port = json.loads((root / "browser-server.json").read_text())["port"]
    browser("open", f"http://127.0.0.1:{port}")
    browser("wait", "--fn", "typeof window.pilotLoad === 'function'")
    browser("eval", f"window.pilotLoad({json.dumps(key)}, 'full')")
    rows = tasks(root)
    for start in range(0, len(rows), 6):
        end = min(start + 6, len(rows))
        expression = f"(async()=>{{for(let i={start};i<{end};i++){{for(const gate of(i%2?[1,0]:[0,1])){{await window.pilotRun(i,gate)}}}}return window.pilotResults.length}})()"
        browser("eval", expression)
        atomic_json(output / "progress.json", {"questions": end, "total": len(rows)})
    data = json.loads((root / "results/browser-results.json").read_text())
    atomic_json(output / "browser-records.json", data)
    results, scores = score(data["results"], rows)
    (output / "answers.jsonl").write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in results))
    summary = {"scores": scores, "environment": data["environment"], "inputs": fingerprints,
               "scope": "Actual WebGPU browser q4, paired gate=0/1; baseline timing includes adapter computation overhead"}
    atomic_json(output / "summary.json", summary)
    print(json.dumps({"model": key, "completedRequests": len(results)}))


if __name__ == "__main__":
    import sys
    evaluate(json.loads(Path(sys.argv[1]).read_text()), sys.argv[2])
