"""Safe job status: report stages and error classes, never process/runtime IDs."""
import json
from pathlib import Path
import sys
import psutil


def progress(file):
    if not file.exists(): return {}
    rows = file.read_text().splitlines()
    result = {}
    for line in rows:
        try:
            value = json.loads(line)
            if isinstance(value, dict) and "stage" in value: result = value
        except ValueError: pass
    return {"progress": result, "traceback": any("Traceback" in line for line in rows)}


def status(root):
    active = set()
    for process in psutil.process_iter(["cmdline", "status"]):
        command = process.info["cmdline"] or []
        if process.info["status"] == psutil.STATUS_ZOMBIE: continue
        for name in ["train_retrieval.py", "train_quantized.py", "gpu_pipeline.py"]:
            if str(root / "scripts" / name) in command: active.add(name)
    state = {}
    for name, script, log in [("retrieval", "train_retrieval.py", "retrieval-resumed.log"),
                              ("quantized", "train_quantized.py", "quantized.log"),
                              ("pipeline", "gpu_pipeline.py", "pipeline-final.log")]:
        if name == "retrieval" and (root / "retrieval-exact-resume.log").exists(): log = "retrieval-exact-resume.log"
        state[name] = {"active": script in active, **progress(root / log)}
    state["gpuDone"] = (root / "GPU_DONE").exists()
    return state


if __name__ == "__main__":
    root = Path(sys.argv[1])
    (root / "training-status.json").write_text(json.dumps(status(root)))
