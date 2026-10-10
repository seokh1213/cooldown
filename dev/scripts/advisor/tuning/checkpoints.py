"""Publish immutable, resumable checkpoints before advertising them for backup."""
from datetime import datetime, timezone
import fcntl
import json
from pathlib import Path
import random
import shutil
import tarfile
import time
import numpy as np
import torch
from model_utils import export_adapter
from artifact_io import atomic_json, sha256


def signature(root, inputs):
    provenance = json.loads((root / "provenance.json").read_text())
    return {"weights": provenance["weightsSha256"],
            "inputs": {name: sha256(root / name) for name in inputs}}


def publish(root, key, file, step):
    with (root / ".backup-index.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        index_file = root / "backup-index.json"
        index = json.loads(index_file.read_text()) if index_file.exists() else {}
        index[key] = {"path": str(file.relative_to(root)), "sha256": sha256(file),
                      "bytes": file.stat().st_size, "step": step,
                      "publishedAt": datetime.now(timezone.utc).isoformat()}
        atomic_json(index_file, index)


def capture_rng():
    state = {"python": random.getstate(), "numpy": np.random.get_state(), "torch": torch.get_rng_state()}
    if torch.cuda.is_available(): state["cuda"] = torch.cuda.get_rng_state_all()
    if torch.backends.mps.is_available(): state["mps"] = torch.mps.get_rng_state()
    return state


def restore_rng(state):
    random.setstate(state["python"])
    np.random.set_state(state["numpy"])
    torch.set_rng_state(state["torch"])
    if "cuda" in state and torch.cuda.is_available(): torch.cuda.set_rng_state_all(state["cuda"])
    if "mps" in state and torch.backends.mps.is_available(): torch.mps.set_rng_state(state["mps"])


class Checkpoints:
    def __init__(self, root, variant, inputs, *, artifacts=()):
        self.root = Path(root)
        self.variant = variant
        self.signature = signature(self.root, inputs)
        self.directory = self.root / "checkpoints" / variant
        self.directory.mkdir(parents=True, exist_ok=True)
        self.last_saved = time.monotonic()
        self.artifacts = tuple(Path(name) for name in artifacts)
        if any(name.is_absolute() or '..' in name.parts for name in self.artifacts):
            raise ValueError('Unsafe checkpoint artifact path')

    def latest(self):
        candidates = sorted(file for file in self.directory.glob("step-*/checkpoint.json")
                            if file.parent.name.removeprefix('step-').isdigit())
        if not candidates: return None
        file = candidates[-1]
        meta = json.loads(file.read_text())
        if meta["signature"] != self.signature: raise ValueError("Checkpoint inputs differ; refusing resume")
        return file.parent

    def restore(self, optimizer, scaler):
        folder = self.latest()
        if folder is None: return {"step": 0, "extra": {}}
        # Only our hash-verified archives enter this directory. RNG tuples
        # require trusted pickle loading; arbitrary uploaded checkpoints do not.
        state = torch.load(folder / "training.pt", map_location="cpu", weights_only=False)
        optimizer.load_state_dict(state["optimizer"])
        scaler.load_state_dict(state["scaler"])
        restore_rng(state["rng"])
        for name in self.artifacts:
            source, destination = folder / 'artifacts' / name, self.root / name
            if source.is_dir(): shutil.copytree(source, destination, dirs_exist_ok=True)
            elif source.is_file():
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, destination)
            else: raise ValueError('Checkpoint is missing a required artifact')
        return json.loads((folder / "checkpoint.json").read_text())

    def due(self, step):
        return step % 40 == 0 or time.monotonic() - self.last_saved >= 60

    def save(self, model, training, step, extra):
        """Call only after optimizer.step and zero_grad, never mid accumulation."""
        folder = self.directory / f"step-{step:06d}"
        temporary = folder.with_name(folder.name + ".pending")
        temporary.mkdir(exist_ok=True)
        export_adapter(model, temporary / "adapter")
        optimizer, scaler = training
        torch.save({"optimizer": optimizer.state_dict(), "scaler": scaler.state_dict(),
                    "rng": capture_rng()}, temporary / "training.pt")
        atomic_json(temporary / "checkpoint.json", {"step": step, "signature": self.signature, "extra": extra})
        for name in self.artifacts:
            source, destination = self.root / name, temporary / 'artifacts' / name
            if source.is_dir(): shutil.copytree(source, destination, dirs_exist_ok=True)
            elif source.is_file():
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, destination)
            else: raise ValueError('Missing checkpoint artifact')
        if folder.exists(): shutil.rmtree(folder)
        temporary.replace(folder)
        archive = self.directory / f"step-{step:06d}.tar.gz"
        pending_archive = archive.with_suffix(".pending")
        with tarfile.open(pending_archive, "w:gz", compresslevel=1) as target:
            target.add(folder, arcname=str(folder.relative_to(self.root)))
        pending_archive.replace(archive)
        publish(self.root, self.variant, archive, step)
        self.last_saved = time.monotonic()
        # Bound remote storage; the latest complete archive is never removed.
        for old in sorted(self.directory.glob("step-*.tar.gz"))[:-3]:
            old.unlink()
            shutil.rmtree(old.with_suffix("").with_suffix(""), ignore_errors=True)
