"""Finish GPU stages sequentially; stage archives are collected on the Mac."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import time
from export_graph import replace_branch
from checkpoints import publish
from training_budget import quantized_limit


def update(root, stage, status):
    file = root / "pipeline.json"
    state = json.loads(file.read_text()) if file.exists() else {}
    if status is None: state.pop(stage, None)
    else: state[stage] = status
    temporary = file.with_suffix(".tmp"); temporary.write_text(json.dumps(state)); temporary.replace(file)


def running(pid):
    file = Path(f"/proc/{pid}/stat")
    return file.exists() and file.read_text().split()[2] != "Z"


def wait_retrieval(root):
    pid = int((root / "retrieval.pid").read_text())
    update(root, "retrieval", "training")
    while not (root / "candidates/retrieval/summary.json").exists():
        if not running(pid): raise RuntimeError("Retrieval worker ended without checkpoint summary")
        time.sleep(5)


def wait_quantized(root):
    pid = int((root / "quantized.pid").read_text())
    update(root, "quantized", "training in parallel")
    while not (root / "candidates/quantized/summary.json").exists():
        if not running(pid): raise RuntimeError("Quantized worker ended without checkpoint summary")
        time.sleep(5)


def quantized_training_needed(root):
    file = root / "candidates/quantized/summary.json"
    if not file.exists(): return True
    summary = json.loads(file.read_text())
    available = summary.get("availableTrainingRows", summary["trainingRows"])
    return summary["trainingRows"] < quantized_limit(root, available)


def execute(root, script, arguments, log):
    with (root / log).open("w") as output:
        subprocess.run([sys.executable, str(root / "scripts" / script), *map(str, arguments)],
                       stdout=output, stderr=subprocess.STDOUT, check=True)


def graph(root, variant, branch):
    destination = root / "candidates" / variant / "model_q4.onnx"
    replace_branch(root / "model_q4.onnx", destination.parent / "last", destination, branch)
    shutil.copyfile(root / "model_q4.onnx_data", destination.parent / "model_q4.onnx_data")
    return destination


def checkpoint_archive(root, variant, directories):
    destination = root / (variant + "-results.tar.gz")
    with tarfile.open(destination.with_suffix(".tmp"), "w:gz", compresslevel=1) as archive:
        for directory in directories:
            archive.add(root / directory, arcname=directory,
                filter=lambda member: None if member.name.endswith("model_q4.onnx_data") else member)
    destination.with_suffix(".tmp").replace(destination)
    publish(root, variant + "-results", destination, 0)


def main(root):
    root = Path(root)
    try:
        update(root, "error", None)
        if not (root / "retrieval-results.tar.gz").exists():
            wait_retrieval(root)
            destination = graph(root, "retrieval", "retrieval")
            update(root, "retrieval", "exporting q4 vectors")
            execute(root, "embed_retrieval.py", [root, root / "model_q4.onnx", "current-rebuilt"], "vectors-current.log")
            execute(root, "embed_retrieval.py", [root, destination, "retrieval"], "vectors-retrieval.log")
            checkpoint_archive(root, "retrieval", ["candidates/retrieval", "vectors"])
        update(root, "retrieval", "complete")
        external_sft = (root / "external-sft").exists()
        if not external_sft and not (root / "candidates/sft/summary.json").exists():
            update(root, "sft", "training")
            execute(root, "train_sft.py", [root], "sft.log")
        if not external_sft:
            graph(root, "sft", "classifier")
            checkpoint_archive(root, "sft", ["candidates/sft"])
            update(root, "sft", "complete")
        if quantized_training_needed(root):
            update(root, "quantized", "training")
            if (root / "quantized.pid").exists(): wait_quantized(root)
            else: execute(root, "train_quantized.py", [root], "quantized.log")
        destination = graph(root, "quantized", "classifier")
        execute(root, "replay_features.py", [root, destination], "quantized-replay.log")
        checkpoint_archive(root, "quantized", ["candidates/quantized", "feature-cache-quantized"])
        update(root, "quantized", "complete")
        if external_sft:
            update(root, "sft", "external Mac GPU job; Colab no longer needed")
        (root / "GPU_DONE").write_text("complete")
    except Exception as error:
        update(root, "error", type(error).__name__)
        print("GPU pipeline failed: " + type(error).__name__, flush=True)
        raise


if __name__ == "__main__": main(sys.argv[1])
