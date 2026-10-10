"""Three matched Korean continuations isolate document length and training coverage."""
import json
from pathlib import Path
import random
import sys
import tarfile
import time

import numpy as np
import torch

from data import digest
from diagnostic_data import ordered_batches
from model import doc_text, load, query_text

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tuning'))
from checkpoints import Checkpoints, publish
from artifact_io import atomic_json


def mine_added(root, encoder):
    target = root / 'coverage-mined.json'
    if target.exists(): return json.loads(target.read_text())
    rows = json.loads((root / 'coverage-input.json').read_text())
    snapshot = json.loads((root / 'eval-snapshot.json').read_text())
    manifest = json.loads((root / 'dev/data/manifest.json').read_text())
    docs = snapshot['docs']['ko_KR']
    eligible = [i for i, doc in enumerate(docs)
                if manifest['families'][manifest['documentFamilies'][doc['id']]] == 'train']
    base = np.load(root / 'candidates/gemma/untuned.npz')['vectors'][:len(docs)]
    missing = [row for row in rows if 'negatives' not in row]
    with encoder.model.disable_adapter():
        vectors = encoder.vectors([query_text(row) for row in missing])
    for row, vector in zip(missing, vectors):
        order = np.argsort(-(base[eligible] @ vector), kind='stable')
        row['negatives'] = [docs[eligible[j]]['id'] for j in order
                            if docs[eligible[j]]['id'] not in row['gold']][:3]
    atomic_json(target, rows)
    return rows


def update(encoder, batch, lookup, training):
    optimizer, document_limit = training
    ids = list(dict.fromkeys([key for row in batch for key in row['gold']] +
                            [key for row in batch for key in row['negatives'][:2]]))
    encoder.model.train()
    queries = encoder.encode([query_text(row) for row in batch], limit=256)
    documents = encoder.encode([doc_text(lookup[key]) for key in ids], limit=document_limit)
    scores = queries @ documents.T / 0.05
    positives = torch.tensor([[key in row['gold'] for key in ids] for row in batch], device=encoder.device)
    loss = (torch.logsumexp(scores, 1) - torch.logsumexp(scores.masked_fill(~positives, -1e4), 1)).mean()
    if not torch.isfinite(loss): raise ValueError('Non-finite diagnostic loss')
    optimizer.zero_grad(set_to_none=True)
    loss.backward()
    torch.nn.utils.clip_grad_norm_([p for p in encoder.model.parameters() if p.requires_grad], 1)
    optimizer.step()
    optimizer.zero_grad(set_to_none=True)
    return float(loss.detach())


def export_vectors(root, encoder, output):
    snapshot = json.loads((root / 'eval-snapshot.json').read_text())
    values = [doc_text(doc) for block in snapshot['docs'].values() for doc in block]
    values += [query_text(row) for row in snapshot['rows']]
    vectors = encoder.vectors(values)
    if not np.isfinite(vectors).all(): raise ValueError('Non-finite diagnostic vector')
    np.savez_compressed(output / 'vectors.npz', vectors=vectors, inputDigest=digest(values))


def continuation(root, settings, rows):
    name, limit = settings
    torch.manual_seed(20261008)
    random.seed(20261008)
    np.random.seed(20261008)
    output = root / 'diagnostic-output' / name
    output.mkdir(parents=True, exist_ok=True)
    inputs = ['diagnostic-protocol.json', 'coverage-mined.json', 'mined.json',
              'dev/data/corpus.json', 'eval-snapshot.json', 'initial-adapter/adapter_model.safetensors',
              'dev/scripts/advisor/gemma-retrieval/diagnostic_train.py']
    checkpoints = Checkpoints(root, name, inputs, artifacts=['diagnostic-output', 'coverage-mined.json'])
    previous = checkpoints.latest()
    encoder = load(root, previous / 'adapter' if previous else root / 'initial-adapter')
    optimizer = torch.optim.AdamW([p for p in encoder.model.parameters() if p.requires_grad],
                                 lr=1e-4, weight_decay=0.01)
    scaler = torch.amp.GradScaler('cuda', enabled=False)
    progress = checkpoints.restore(optimizer, scaler)
    if not previous: checkpoints.save(encoder.model, (optimizer, scaler), 0, {})
    docs = json.loads((root / 'dev/data/corpus.json').read_text())['ko_KR']
    lookup = {doc['id']: doc for doc in docs}
    started = time.monotonic()
    plan = ordered_batches(rows)
    for step, batch in enumerate(plan, 1):
        if step <= progress['step']: continue
        loss = update(encoder, batch, lookup, (optimizer, limit))
        if checkpoints.due(step) or step == len(plan):
            checkpoints.save(encoder.model, (optimizer, scaler), step, {'loss': loss})
        if step == 1 or step % 10 == 0 or step == len(plan):
            print(json.dumps({'variant': name, 'step': step, 'steps': len(plan), 'loss': loss,
                              'seconds': round(time.monotonic() - started, 1)}), flush=True)
    encoder.model.save_pretrained(output / 'adapter')
    export_vectors(root, encoder, output)
    atomic_json(output / 'summary.json', {
        'variant': name, 'documentLimit': limit, 'queryLimit': 256,
        'trainRows': len(rows), 'trainDocuments': len({key for row in rows for key in row['gold']}),
        'steps': len(plan), 'device': encoder.device, 'torch': torch.__version__,
        'dtype': str(next(encoder.model.parameters()).dtype),
        'seconds': round(time.monotonic() - started, 1),
        'purpose': 'Matched diagnostic continuation with a fresh optimizer, not a deployment candidate.',
    })
    print(json.dumps({'variant': name, 'complete': True}), flush=True)
    del encoder, optimizer
    if torch.cuda.is_available(): torch.cuda.empty_cache()
    return len(plan)


def finish(root, steps):
    archive = root / 'diagnostic-results.tar.gz'
    with tarfile.open(archive, 'w:gz', compresslevel=1) as target:
        target.add(root / 'diagnostic-output', arcname='candidates/diagnostic')
        target.add(root / 'coverage-mined.json', arcname='candidates/diagnostic/coverage-mined.json')
    publish(root, 'diagnostic-results', archive, steps)
    (root / 'GPU_DONE').write_text('Diagnostic results published; verify local copies before release.\n')
    print('DIAGNOSTIC_COMPLETE', flush=True)


def run(root):
    root = Path(root)
    encoder = load(root, root / 'initial-adapter')
    coverage = mine_added(root, encoder)
    del encoder
    if torch.cuda.is_available(): torch.cuda.empty_cache()
    current = [row for row in json.loads((root / 'mined.json').read_text()) if row['lang'] == 'ko_KR']
    steps = 0
    for name, limit in [('length-256', 256), ('length-512', 512), ('coverage-512', 512)]:
        steps += continuation(root, (name, limit), coverage if name == 'coverage-512' else current)
    finish(root, steps)


if __name__ == '__main__': run(sys.argv[1])
