"""Restore verified Mac checkpoints into a freshly prepared owned runtime."""
import argparse
import json
from pathlib import Path
import tempfile
from artifact_io import sha256
from backup_artifacts import latest_receipts
from colab_client import Colab
from collect_checkpoints import transfer


def upload_archive(metadata, archive, variant, block_size=8 * 1024 * 1024):
    """Contents API rejects large single requests; reassemble bounded chunks."""
    parts = []
    with tempfile.TemporaryDirectory(dir=metadata["work"]) as temporary, archive.open("rb") as source:
        while block := source.read(block_size):
            name = f"resume-{variant}.part-{len(parts):04d}"
            file = Path(temporary) / name
            file.write_bytes(block)
            transfer(metadata, "upload", {"remote": "/content/cooldown-tuning/" + name, "local": str(file)})
            parts.append(name)
    return parts


def restore(metadata, stages=None):
    root = Path(metadata["work"])
    (root / "results").mkdir(parents=True, exist_ok=True)
    receipts = latest_receipts(root)
    restored = []
    for variant in stages or metadata.get('resumeStages', ["retrieval", "sft", "quantized"]):
        entry = receipts.get(variant)
        if not entry: continue
        archive = Path(entry["restored"]).parent / "artifact.tar.gz"
        if sha256(archive) != entry["sha256"]: raise ValueError("Local checkpoint changed; refusing upload")
        parts = upload_archive(metadata, archive, variant)
        restored.append({"variant": variant, "step": entry["step"], "sha256": entry["sha256"], "parts": parts})
    script = root / "restore-verified.py"
    script.write_text("""import json,sys,tarfile,hashlib,shutil
from pathlib import Path
r=Path('/content/cooldown-tuning')
sys.path.insert(0,str(r/'scripts'))
sys.path.insert(0,str(r/'scripts/llm/tuning'))
from backup_artifacts import validate_members
entries=""" + repr(restored) + """
for entry in entries:
    file=r/('resume-'+entry['variant']+'.tar.gz')
    with file.open('wb') as target:
        for part in entry['parts']:
            with (r/part).open('rb') as source:shutil.copyfileobj(source,target)
    with file.open('rb') as stream:
        if hashlib.file_digest(stream,'sha256').hexdigest()!=entry['sha256']:
            raise ValueError('Uploaded checkpoint checksum mismatch')
    with tarfile.open(file) as archive:
        validate_members(archive,entry['variant'])
        archive.extractall(r,filter='data')
    for part in entry['parts']:(r/part).unlink()
(r/'resume-status.json').write_text(json.dumps([{'stage':e['variant'],'step':e['step']} for e in entries]))
""")
    Colab(metadata).execute(script, timeout=180)
    transfer(metadata, "download", {"remote": "/content/cooldown-tuning/resume-status.json",
                                    "local": str(root / "results/resume-status.json")})
    return json.loads((root / "results/resume-status.json").read_text())


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("metadata", type=Path)
    args = parser.parse_args()
    try: print(json.dumps({"restored": restore(json.loads(args.metadata.read_text()))}))
    except Exception as error: print(json.dumps({"error": type(error).__name__})); raise SystemExit(1)
