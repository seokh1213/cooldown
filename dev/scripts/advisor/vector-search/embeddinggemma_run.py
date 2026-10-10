"""Run the CPU comparison and retain small evidence, excluding downloaded weights."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import zlib

ROOT = Path(__file__).resolve().parents[4]
SCRIPTS = Path(__file__).parent
MODELS = ["qwenFresh", "qwenDeployed", "gemmaFresh", "gemma-fullFresh"]


def command(*args):
    subprocess.run([str(arg) for arg in args], cwd=ROOT, check=True)


def cpu(action, cache, model=None):
    args = ["uv", "run", "--script", SCRIPTS / "embeddinggemma_eval.py", action, cache]
    if model:
        args += ["--model", model]
    command(*args)


def compact_predictions(snapshot, cases, scores):
    expected = set(range(len(snapshot["rows"])))
    if any(len(items) != len(expected) or {item["index"] for item in items} != expected for items in cases.values()):
        raise ValueError("Cannot publish partial or duplicate prediction coverage")
    indexed = {model: {item["index"]: item for item in items} for model, items in cases.items()}
    output = []
    for index, row in enumerate(snapshot["rows"]):
        predictions = {}
        for model, items in indexed.items():
            item = items[index]
            threshold = scores["models"][model]["threshold"]
            pick = item["top3"][0] if threshold is not None and item["score"] >= threshold else None
            predictions[model] = {**{key: value for key, value in item.items() if key not in ["index", "ranking"]}, "calibrated": pick}
        key = row["gold"][0] if row["gold"] else row["q"]
        part = ("test" if zlib.crc32(key.encode()) % 2 else "dev") if row["bank"] == "main" else row["bank"]
        output.append({"index": index, **{key: value for key, value in row.items() if key != "bm25"}, "split": part, "predictions": predictions})
    return output


def publish(cache, output):
    output.mkdir(parents=True, exist_ok=True)
    scores = json.loads((cache / "scores.json").read_text())
    for name in ["models.json", "scores.json", "probe-scores.json", *[f"{model}-timings.json" for model in ["qwen", "gemma", "gemma-full"]]]:
        shutil.copyfile(cache / name, output / name)
    for name in ["snapshot.json", "probe-snapshot.json"]:
        with open(output / (name + ".gz"), "wb") as raw, gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as dest:
            dest.write((cache / name).read_bytes())
    for source, suffix in [("snapshot.json", ""), ("probe-snapshot.json", "-probe")]:
        snapshot = json.loads((cache / source).read_text())
        cases = {model: sorted(json.loads((cache / f"{model}{suffix}-predictions.json").read_text()), key=lambda item: item["index"]) for model in MODELS}
        rows = compact_predictions(snapshot, cases, scores)
        (output / ("predictions" + suffix + ".jsonl")).write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows))
    manifest(output)


def manifest(output):
    records = [{"file": file.name, "bytes": file.stat().st_size, "sha256": hashlib.sha256(file.read_bytes()).hexdigest()}
               for file in sorted(output.iterdir()) if file.is_file() and file.name != "retention-manifest.json"]
    (output / "retention-manifest.json").write_text(json.dumps({"files": records}, indent=2) + "\n")


def run(cache, output, probe):
    cpu("check", cache)
    prepare = SCRIPTS / "embeddinggemma_prepare.ts"
    command("node", "--import", "tsx", prepare, "prepare", cache / "snapshot.json")
    command("node", "--import", "tsx", prepare, "prepare-probe", probe, cache / "probe-snapshot.json")
    for model in ["qwen", "gemma", "gemma-full"]:
        cpu("embed", cache, model)
    for model in ["qwen", "gemma", "gemma-full"]:
        cpu("benchmark", cache, model)
    cpu("score", cache)
    cpu("probe", cache)
    for suffix, snapshot in [("", "snapshot.json"), ("-probe", "probe-snapshot.json")]:
        for model in MODELS:
            command("node", "--import", "tsx", prepare, "verify", cache / snapshot, cache / f"{model}{suffix}-predictions.json")
    publish(cache, output)
    gate = json.loads((cache / "scores.json").read_text())["gpuGate"]
    print(json.dumps({"output": str(output.relative_to(ROOT)) if output.is_relative_to(ROOT) else output.name, "webgpuEligible": gate["pass"], "checks": gate["checks"]}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, default=ROOT / "dev/research/.cache/embeddinggemma2")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--probe", type=Path, default=ROOT / "dev/research/llm-evals/workflow/reports/embeddinggemma2-20261008/new-document-probe.jsonl")
    args = parser.parse_args()
    run(args.cache.resolve(), args.out.resolve(), args.probe.resolve())
