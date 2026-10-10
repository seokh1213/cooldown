import json
from pathlib import Path
import random
import tempfile
import unittest
from unittest.mock import patch
import numpy as np
import torch
from backup_artifacts import install, latest_receipts
from checkpoints import Checkpoints


def export_model(model, destination):
    destination.mkdir(parents=True)
    torch.save(model.state_dict(), destination / "weights.pt")


def update(model, optimizer):
    x = torch.rand(3, 2) * random.random() * np.random.random()
    model(x).square().mean().backward()
    optimizer.step()
    optimizer.zero_grad(set_to_none=True)


class CheckpointsTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / "provenance.json").write_text(json.dumps({"weightsSha256": "base"}))
        (self.root / "train.json").write_text("fixed training rows")

    def test_resumed_training_matches_uninterrupted_optimizer_and_rng(self):
        torch.manual_seed(4); random.seed(4); np.random.seed(4)
        model = torch.nn.Linear(2, 1)
        optimizer = torch.optim.AdamW(model.parameters(), lr=.01)
        scaler = torch.amp.GradScaler("cuda", enabled=False)
        update(model, optimizer)
        checkpoints = Checkpoints(self.root, "retrieval", ["train.json"])
        with patch("checkpoints.export_adapter", export_model):
            checkpoints.save(model, (optimizer, scaler), 1, {})
        for _ in range(3): update(model, optimizer)
        expected = {key: value.clone() for key, value in model.state_dict().items()}
        resumed = torch.nn.Linear(2, 1)
        resumed.load_state_dict(torch.load(checkpoints.latest() / "adapter/weights.pt", weights_only=True))
        resumed_optimizer = torch.optim.AdamW(resumed.parameters(), lr=.01)
        self.assertEqual(checkpoints.restore(resumed_optimizer, scaler)["step"], 1)
        for _ in range(3): update(resumed, resumed_optimizer)
        for key, value in resumed.state_dict().items(): torch.testing.assert_close(value, expected[key], rtol=0, atol=0)

    def test_changed_inputs_refuse_resume(self):
        checkpoints = Checkpoints(self.root, "retrieval", ["train.json"])
        model = torch.nn.Linear(2, 1)
        optimizer = torch.optim.AdamW(model.parameters())
        scaler = torch.amp.GradScaler("cuda", enabled=False)
        with patch("checkpoints.export_adapter", export_model):
            checkpoints.save(model, (optimizer, scaler), 1, {})
        (self.root / "train.json").write_text("other rows")
        with self.assertRaisesRegex(ValueError, "inputs differ"):
            Checkpoints(self.root, "retrieval", ["train.json"]).latest()

    def test_corrupt_download_does_not_replace_verified_backup(self):
        checkpoints = Checkpoints(self.root, "retrieval", ["train.json"])
        model = torch.nn.Linear(2, 1)
        scaler = torch.amp.GradScaler("cuda", enabled=False)
        with patch("checkpoints.export_adapter", export_model):
            checkpoints.save(model, (torch.optim.AdamW(model.parameters()), scaler), 1, {})
        entry = json.loads((self.root / "backup-index.json").read_text())["retrieval"]
        pending = self.root / "pending.tar.gz"
        pending.write_bytes((self.root / entry["path"]).read_bytes())
        install(self.root, "retrieval", entry, pending)
        pending.write_bytes(b"partial download")
        with self.assertRaisesRegex(ValueError, "checksum"):
            install(self.root, "retrieval", entry, pending)
        self.assertTrue(latest_receipts(self.root)["retrieval"]["verified"])

    def test_selected_candidate_survives_runtime_loss_with_optimizer(self):
        selected = self.root / 'candidates/gemma/selected'
        selected.mkdir(parents=True)
        (selected / 'adapter.bin').write_bytes(b'earlier best epoch')
        checkpoints = Checkpoints(self.root, 'gemma', ['train.json'], artifacts=['candidates/gemma'])
        model = torch.nn.Linear(2, 1)
        optimizer = torch.optim.AdamW(model.parameters())
        scaler = torch.amp.GradScaler('cuda', enabled=False)
        with patch('checkpoints.export_adapter', export_model):
            checkpoints.save(model, (optimizer, scaler), 1, {'selectedEpoch': 0})
        import shutil
        shutil.rmtree(self.root / 'candidates')
        self.assertEqual(checkpoints.restore(optimizer, scaler)['extra']['selectedEpoch'], 0)
        self.assertEqual((selected / 'adapter.bin').read_bytes(), b'earlier best epoch')

    def test_artifact_path_cannot_escape_checkpoint(self):
        with self.assertRaisesRegex(ValueError, 'Unsafe'):
            Checkpoints(self.root, 'gemma', ['train.json'], artifacts=['../credentials'])

    def test_unpublished_pending_directory_never_becomes_latest(self):
        checkpoints = Checkpoints(self.root, 'gemma', ['train.json'])
        pending = checkpoints.directory / 'step-000999.pending'
        pending.mkdir()
        (pending / 'checkpoint.json').write_text(json.dumps({'step': 999, 'signature': checkpoints.signature}))
        self.assertIsNone(checkpoints.latest())

    def test_missing_best_candidate_refuses_incomplete_restore(self):
        selected = self.root / 'candidates/gemma'
        selected.mkdir(parents=True)
        checkpoints = Checkpoints(self.root, 'gemma', ['train.json'], artifacts=['candidates/gemma'])
        model = torch.nn.Linear(2, 1)
        optimizer = torch.optim.AdamW(model.parameters())
        scaler = torch.amp.GradScaler('cuda', enabled=False)
        with patch('checkpoints.export_adapter', export_model):
            checkpoints.save(model, (optimizer, scaler), 1, {})
        import shutil
        shutil.rmtree(checkpoints.latest() / 'artifacts')
        with self.assertRaisesRegex(ValueError, 'missing a required artifact'):
            checkpoints.restore(optimizer, scaler)


if __name__ == "__main__": unittest.main()
