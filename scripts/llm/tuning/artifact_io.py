"""Small, dependency-free helpers for atomic artifact manifests."""
import hashlib
import json
from pathlib import Path


def sha256(file):
    with Path(file).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def atomic_json(file, value):
    file = Path(file)
    temporary = file.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2))
    temporary.replace(file)
