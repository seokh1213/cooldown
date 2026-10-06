"""Run independently on the Mac; back up published Colab files every minute."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import time
from backup_artifacts import install, latest_receipts
from artifact_io import atomic_json, sha256

CLI_PYTHON = Path.home() / ".local/share/uv/tools/google-colab-cli/bin/python"
BRIDGE = Path(__file__).with_name("colab_transport.py")
DEFAULT_STAGES = {"retrieval", "sft", "quantized", "retrieval-results", "sft-results", "quantized-results"}


def configured_stages(metadata):
    stages = set(metadata.get("checkpointStages", DEFAULT_STAGES))
    if not stages or any(not re.fullmatch(r"[a-z][a-z0-9-]{0,63}", stage) for stage in stages):
        raise ValueError("Invalid checkpoint stages")
    required = set(metadata.get("requiredResults", ["retrieval-results", "quantized-results"]))
    if not required or not required.issubset(stages):
        raise ValueError("Required results must be registered checkpoint stages")
    return stages, required


def transfer(metadata, operation, paths=None):
    request = {"metadata": metadata, "operation": operation, **(paths or {})}
    result = subprocess.run([str(CLI_PYTHON), str(BRIDGE)], input=json.dumps(request),
                            capture_output=True, text=True, timeout=150)
    if result.returncode:
        try: error = json.loads(result.stdout)["error"]
        except (ValueError, KeyError): error = "TransportError"
        raise ConnectionError(error)


def remote_path(path):
    parsed = PurePosixPath(path)
    if parsed.is_absolute() or ".." in parsed.parts: raise ValueError("Unsafe remote path")
    return "/content/cooldown-tuning/" + str(parsed)


def collect(metadata):
    stages, _ = configured_stages(metadata)
    root = Path(metadata["work"])
    incoming = root / "backups/.incoming"
    incoming.mkdir(parents=True, exist_ok=True)
    index_file = incoming / "index.json"
    try:
        transfer(metadata, "download", {"remote": "/content/cooldown-tuning/backup-index.json", "local": str(index_file)})
    except ConnectionError as error:
        if str(error) == "FileNotFoundError": return []
        raise
    index = json.loads(index_file.read_text())
    receipts = latest_receipts(root)
    completed = []
    for key, entry in index.items():
        if key not in stages:
            raise ValueError("Unknown checkpoint stage")
        if receipts.get(key, {}).get("sha256") == entry["sha256"]: continue
        pending = incoming / (key + ".partial")
        transfer(metadata, "download", {"remote": remote_path(entry["path"]), "local": str(pending)})
        install(root, key, entry, pending)
        completed.append({"stage": key, "step": entry["step"], "bytes": entry["bytes"]})
    return completed


def finish_if_collected(metadata):
    root = Path(metadata["work"])
    if (root / "HOLD_GPU").exists(): return False
    _, required = configured_stages(metadata)
    receipts = latest_receipts(root)
    if not required.issubset(receipts): return False
    try:
        transfer(metadata, "download", {"remote": "/content/cooldown-tuning/GPU_DONE",
                                        "local": str(root / "backups/.incoming/GPU_DONE")})
        final_index = root / "backups/.incoming/final-index.json"
        transfer(metadata, "download", {"remote": "/content/cooldown-tuning/backup-index.json",
                                        "local": str(final_index)})
    except ConnectionError: return False
    published = json.loads(final_index.read_text())
    # The final archive may have been published after collect() downloaded an earlier one.
    if any(published.get(key, {}).get("sha256") != receipts[key].get("sha256") for key in required):
        return False
    for key in sorted(required):
        entry = receipts[key]
        file = Path(entry["restored"]).parent / "artifact.tar.gz"
        if sha256(file) != entry["sha256"]: raise ValueError("Final local artifact checksum mismatch")
    transfer(metadata, "stop")
    atomic_json(root / "gpu-cleanup.json", {"ownedRuntimeStopped": True,
        "reason": "All final GPU artifacts were verified on Mac before stop"})
    return True


def run(metadata, interval):
    root = Path(metadata["work"])
    status_file = root / "backup-status.json"
    while not (root / "STOP_BACKUP").exists():
        started = time.monotonic()
        status = {"checkedAt": datetime.now(timezone.utc).isoformat(), "intervalSeconds": interval}
        try:
            transfer(metadata, "ping")
            status["downloaded"] = collect(metadata)
            status["healthy"] = True
            status["finished"] = finish_if_collected(metadata)
        except Exception as error:
            status.update(healthy=False, error=type(error).__name__)
        atomic_json(status_file, status)
        print(json.dumps(status), flush=True)
        if status.get("finished"): break
        time.sleep(max(0, interval - (time.monotonic() - started)))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("metadata", type=Path)
    parser.add_argument("--interval", type=int, default=60)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    if args.interval < 10: parser.error("Interval must be at least ten seconds")
    metadata = json.loads(args.metadata.read_text())
    if args.once:
        try: print(json.dumps({"downloaded": collect(metadata)}))
        except Exception as error: print(json.dumps({"error": type(error).__name__})); sys.exit(1)
    else: run(metadata, args.interval)
