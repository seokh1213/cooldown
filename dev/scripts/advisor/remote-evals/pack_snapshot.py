"""Archive only project inputs; credentials and execution caches never enter the snapshot."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[4]
COMMON = ["package.json", "package-lock.json", "tsconfig.json", "dev/config/tsconfig.scripts.json"]
INPUTS = ["src", "dev/scripts", "dev/data/knowledge", "public/data/26.19", "public/models/judge", "public/models/offline",
          "public/models/kev/b3e", "dev/research/llm-evals/kev-agent", "dev/research/llm-evals/vector-search", *COMMON]


def snapshot_files():
    files = set()
    for relative in INPUTS:
        path = ROOT / relative
        for file in [path] if path.is_file() else path.rglob("*"):
            if file.is_file() and "__pycache__" not in file.parts and not file.name.startswith(".") and file.suffix not in [".log", ".pyc"]:
                files.add(file)
    return sorted(files)


def main():
    latest = ROOT / "dev/research/.cache/remote-evals/latest.json"
    meta = json.loads(latest.read_text()) if latest.exists() else {"run": datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")}
    staging = ROOT / "dev/research/.cache/remote-evals" / meta["run"]
    staging.mkdir(parents=True, exist_ok=True)
    weight = Path.home() / ".cache/cooldown-kev/onnx-b3i/model_q4.onnx_data"
    with weight.open("rb") as stream:
        weight_hash = hashlib.file_digest(stream, "sha256").hexdigest()
    files = snapshot_files()
    provenance = {"run": meta["run"], "commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
                  "workingTreeIncluded": True, "weightsSha256": weight_hash,
                  "files": {str(file.relative_to(ROOT)): hashlib.sha256(file.read_bytes()).hexdigest() for file in files},
                  "scope": "Colab GPU jobs controlled by Wukong; browser WebGPU latency needs separate validation"}
    (staging / "provenance.json").write_text(json.dumps(provenance, ensure_ascii=False, indent=2))
    with tarfile.open(staging / "snapshot.tar.gz", "w:gz", compresslevel=1) as archive:
        for file in files:
            archive.add(file, arcname="repo/" + str(file.relative_to(ROOT)))
        archive.add(staging / "provenance.json", arcname="provenance.json")
        archive.add(ROOT / "public/models/kev/b3e/model_q4.onnx", arcname="models/model_q4.onnx")
    with tarfile.open(staging / "build-context.tar.gz", "w:gz", compresslevel=1) as archive:
        for relative in COMMON:
            archive.add(ROOT / relative, arcname=relative)
        archive.add(ROOT / "dev/scripts/advisor/remote-evals", arcname="dev/scripts/advisor/remote-evals",
                    filter=lambda member: None if "__pycache__" in member.name else member)
    meta.update({"staging": str(staging), "weight": str(weight)})
    latest.write_text(json.dumps(meta))
    print("Frozen snapshot:", len(files), "files")


if __name__ == "__main__":
    main()
