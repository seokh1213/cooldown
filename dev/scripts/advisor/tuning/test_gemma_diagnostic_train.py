import unittest
from pathlib import Path
import tarfile
import tempfile
import sys

import numpy as np
import torch
import torch.nn.functional as F

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'gemma-retrieval'))

from diagnostic_encode import rank_probes
from diagnostic_train import update, finish
from backup_artifacts import validate_members


class TinyEncoder:
    def __init__(self):
        self.model = torch.nn.Linear(2, 2, bias=False)
        with torch.no_grad(): self.model.weight.copy_(torch.tensor([[1., .5], [.5, 1.]]))
        self.device = 'cpu'
        self.limits = []

    def encode(self, texts, limit):
        self.limits.append(limit)
        features = torch.tensor([[1., 0.] if 'match' in text else [0., 1.] for text in texts])
        return F.normalize(self.model(features), dim=-1)


class DiagnosticTrainingTests(unittest.TestCase):
    def test_document_length_intervention_retains_query_length_and_trains_the_adapter(self):
        encoder = TinyEncoder()
        optimizer = torch.optim.AdamW(encoder.model.parameters(), lr=.01)
        batch = [{'q': 'match', 'gold': ['positive'], 'negatives': ['negative']}]
        docs = {'positive': {'title': 'match', 'text': 'match'},
                'negative': {'title': 'different', 'text': 'different'}}
        before = encoder.model.weight.detach().clone()
        loss = update(encoder, batch, docs, (optimizer, 512))
        self.assertTrue(np.isfinite(loss))
        self.assertGreater(loss, 0)
        self.assertEqual(encoder.limits, [256, 512])
        self.assertFalse(torch.equal(before, encoder.model.weight))

    def test_probe_ranking_preserves_input_order_and_alternative_gold(self):
        documents = [{'id': 'a'}, {'id': 'b'}, {'id': 'c'}]
        vectors = {'documents': np.array([[1., 0.], [0., 1.], [-1., 0.]]),
                   'queries': np.array([[0., 1.], [1., 0.]])}
        rows = [{'id': 'first', 'gold': ['a', 'b']}, {'id': 'second', 'gold': ['c']}]
        result = rank_probes(documents, vectors, rows)
        self.assertEqual([row['id'] for row in result], ['first', 'second'])
        self.assertEqual([row['goldRank'] for row in result], [1, 3])

    def test_final_archive_is_accepted_by_the_existing_backup_validator(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'diagnostic-output/length-256').mkdir(parents=True)
            (root / 'diagnostic-output/length-256/summary.json').write_text('{}')
            (root / 'coverage-mined.json').write_text('[]')
            finish(root, 56)
            with tarfile.open(root / 'diagnostic-results.tar.gz') as archive:
                validate_members(archive, 'diagnostic-results')
                self.assertIn('candidates/diagnostic/coverage-mined.json', archive.getnames())
            self.assertTrue((root / 'GPU_DONE').exists())


if __name__ == '__main__': unittest.main()
