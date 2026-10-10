"""Verify and install downloaded artifacts without accepting unsafe tar members."""
import json
from pathlib import Path, PurePosixPath
import shutil
import tarfile
from artifact_io import atomic_json, sha256


def validate_members(archive, key):
    prefixes = ([f"checkpoints/{key}/"] if not key.endswith("-results") else
                [f"candidates/{key.removesuffix('-results')}/", "vectors/"])
    if key == "quantized-results": prefixes.append("feature-cache-quantized/")
    for member in archive.getmembers():
        path = PurePosixPath(member.name)
        if path.is_absolute() or ".." in path.parts or member.issym() or member.islnk():
            raise ValueError("Unsafe checkpoint archive")
        if not (member.isdir() or member.isfile()): raise ValueError("Unsupported archive member")
        name = member.name.rstrip("/") + "/"
        if not any(name.startswith(prefix) for prefix in prefixes):
            raise ValueError("Unexpected checkpoint archive path")


def install(root, key, entry, pending):
    root = Path(root)
    if pending.stat().st_size != entry["bytes"] or sha256(pending) != entry["sha256"]:
        raise ValueError("Downloaded checkpoint checksum mismatch")
    backup = root / "backups" / key / entry["sha256"]
    backup.mkdir(parents=True, exist_ok=True)
    file = backup / "artifact.tar.gz"
    with tarfile.open(pending) as archive:
        validate_members(archive, key)
        archive.extractall(backup / "restored", filter="data")
    pending.replace(file)
    atomic_json(backup / "receipt.json", {**entry, "verified": True})
    prune(root / "backups" / key)
    return backup


def prune(directory, keep=3):
    receipts = sorted(directory.glob("*/receipt.json"),
                      key=lambda file: json.loads(file.read_text())["publishedAt"])
    for file in receipts[:-keep]: shutil.rmtree(file.parent)


def latest_receipts(root):
    receipts = {}
    for file in (Path(root) / "backups").glob("*/*/receipt.json"):
        key = file.parent.parent.name
        entry = json.loads(file.read_text())
        if not entry.get("verified"): continue
        if key not in receipts or entry["publishedAt"] > receipts[key]["publishedAt"]:
            receipts[key] = {**entry, "restored": str(file.parent / "restored")}
    return receipts
