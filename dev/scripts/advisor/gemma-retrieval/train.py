"""Contrastive attention LoRA; checkpoints and epoch selection use dev only."""
import json
from pathlib import Path
import random
import sys
import time
import numpy as np
import torch

from data import read_jsonl, digest
from model import load, query_text, doc_text

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tuning'))
from checkpoints import Checkpoints, publish
from artifact_io import atomic_json


def inputs(root):
    docs = json.loads((root / 'dev/data/corpus.json').read_text())
    train = read_jsonl(root / 'dev/data/train.jsonl')
    dev = read_jsonl(root / 'dev/data/dev.jsonl')
    manifest = json.loads((root / 'dev/data/manifest.json').read_text())
    return docs, train, dev, manifest


def dev_score(encoder, docs, rows):
    vectors = {lang: encoder.vectors([doc_text(d) for d in block]) for lang, block in docs.items()}
    queries = encoder.vectors([query_text(r) for r in rows])
    counts = {1: 0, 3: 0}
    eligible = 0
    for row, vector in zip(rows, queries):
        if not row['gold']: continue
        eligible += 1
        block = docs[row['lang']]
        order = np.argsort(-(vectors[row['lang']] @ vector))
        for k in counts: counts[k] += any(block[j]['id'] in row['gold'] for j in order[:k])
    return {'recall1': counts[1] / eligible, 'recall3': counts[3] / eligible, 'answerable': eligible}


def mine(encoder, docs, rows, manifest):
    candidates = {lang: [d for d in block if manifest['families'][manifest['documentFamilies'][d['id']]] == 'train']
        for lang, block in docs.items()}
    vectors = {lang: encoder.vectors([doc_text(d) for d in block]) for lang, block in candidates.items()}
    queries = encoder.vectors([query_text(row) for row in rows])
    mined = []
    for row, vector in zip(rows, queries):
        order = np.argsort(-(vectors[row['lang']] @ vector))
        negatives = [candidates[row['lang']][j]['id'] for j in order if candidates[row['lang']][j]['id'] not in row['gold']][:3]
        mined.append(dict(row, negatives=negatives))
    return mined


def batches(rows, size):
    result = []
    for epoch in range(2):
        for lang in ['ko_KR', 'en_US', 'zh_CN']:
            block = [r for r in rows if r['lang'] == lang]
            random.Random(20261008 + epoch).shuffle(block)
            result += [(epoch + 1, block[i:i + size]) for i in range(0, len(block), size)]
    return result


def train_step(encoder, batch, lookup, optimizer):
    lang = batch[0]['lang']
    ids = list(dict.fromkeys([key for r in batch for key in r['gold']] +
                            [key for r in batch for key in r['negatives'][:2]]))
    encoder.model.train()
    q = encoder.encode([query_text(r) for r in batch], limit=256)
    d = encoder.encode([doc_text(lookup[lang][key]) for key in ids], limit=256)
    logits = q @ d.T / 0.05
    positives = torch.tensor([[key in r['gold'] for key in ids] for r in batch], device=encoder.device)
    loss = (torch.logsumexp(logits, 1) - torch.logsumexp(logits.masked_fill(~positives, -1e4), 1)).mean()
    if not torch.isfinite(loss): raise ValueError('Non-finite loss')
    optimizer.zero_grad(set_to_none=True)
    loss.backward()
    torch.nn.utils.clip_grad_norm_([p for p in encoder.model.parameters() if p.requires_grad], 1)
    optimizer.step()
    optimizer.zero_grad(set_to_none=True)
    return float(loss.detach())


def write_vectors(encoder, root, label):
    snapshot = json.loads((root / 'eval-snapshot.json').read_text())
    values = [doc_text(d) for block in snapshot['docs'].values() for d in block]
    values += [query_text(r) for r in snapshot['rows']]
    start = time.monotonic()
    matrix = encoder.vectors(values)
    if not np.isfinite(matrix).all(): raise ValueError('Non-finite evaluation vector')
    np.savez_compressed(root / 'candidates/gemma' / (label + '.npz'), vectors=matrix, inputDigest=digest(values))
    print(json.dumps({'stage': 'vectors', 'label': label, 'rows': len(values),
        'seconds': round(time.monotonic() - start, 1)}), flush=True)


def finish(root, summary, step):
    import tarfile
    output = root / 'candidates/gemma'
    atomic_json(output / 'summary.json', summary)
    archive = root / 'gemma-results.tar.gz'
    with tarfile.open(archive, 'w:gz', compresslevel=1) as target:
        target.add(output, arcname='candidates/gemma')
    publish(root, 'gemma-results', archive, step)
    (root / 'GPU_DONE').write_text('Final archives published; collector verifies before releasing runtime.\n')


def finish_epoch(encoder, root, docs, dev, extra):
    epoch = extra['pendingEpoch']
    output = root / 'candidates/gemma'
    measured = dev_score(encoder, docs, dev)
    extra['epochs'].append(dict(epoch=epoch, **measured))
    previous_score = extra['selectedDev']
    if (measured['recall3'], measured['recall1']) > (previous_score['recall3'], previous_score['recall1']):
        encoder.model.save_pretrained(output / 'selected')
        extra.update(selectedEpoch=epoch, selectedDev=measured)
    encoder.model.save_pretrained(output / f'epoch-{epoch}')
    write_vectors(encoder, root, f'epoch-{epoch}')
    print(json.dumps({'stage': 'epoch', **extra['epochs'][-1], 'selectedEpoch': extra['selectedEpoch']}), flush=True)
    del extra['pendingEpoch']


def train(root):
    root = Path(root)
    torch.manual_seed(20261008)
    random.seed(20261008)
    np.random.seed(20261008)
    docs, rows, dev, manifest = inputs(root)
    lookup = {lang: {d['id']: d for d in block} for lang, block in docs.items()}
    output = root / 'candidates/gemma'
    output.mkdir(parents=True, exist_ok=True)
    checkpoints = Checkpoints(root, 'gemma', ['dev/data/train.jsonl', 'dev/data/dev.jsonl',
        'dev/data/corpus.json', 'dev/data/manifest.json', 'eval-snapshot.json', 'training-config.json',
        'dev/scripts/advisor/gemma-retrieval/model.py', 'dev/scripts/advisor/gemma-retrieval/train.py'],
        artifacts=['candidates/gemma'])
    previous = checkpoints.latest()
    encoder = load(root, previous / 'adapter' if previous else None)
    optimizer = torch.optim.AdamW([p for p in encoder.model.parameters() if p.requires_grad], lr=1e-4, weight_decay=0.01)
    scaler = torch.amp.GradScaler('cuda', enabled=False)
    progress = checkpoints.restore(optimizer, scaler)
    extra = progress['extra']
    print(json.dumps({'stage': 'start', 'device': encoder.device, 'dtype': str(next(encoder.model.parameters()).dtype),
        'trainableParameters': sum(p.numel() for p in encoder.model.parameters() if p.requires_grad),
        'resumeStep': progress['step']}), flush=True)
    if not previous:
        extra = {'baseline': dev_score(encoder, docs, dev), 'mined': mine(encoder, docs, rows, manifest), 'epochs': []}
        write_vectors(encoder, root, 'untuned')
        encoder.model.save_pretrained(output / 'selected')
        extra['selectedEpoch'] = 0
        extra['selectedDev'] = extra['baseline']
        checkpoints.save(encoder.model, (optimizer, scaler), 0, extra)
    if 'pendingEpoch' in extra:
        finish_epoch(encoder, root, docs, dev, extra)
        checkpoints.save(encoder.model, (optimizer, scaler), progress['step'], extra)
    plan = batches(extra['mined'], 8)
    started = time.monotonic()
    for step, (epoch, batch) in enumerate(plan, 1):
        if step <= progress['step']: continue
        loss = train_step(encoder, batch, lookup, optimizer)
        last = step == len(plan) or plan[step][0] != epoch
        if last:
            extra['pendingEpoch'] = epoch
            checkpoints.save(encoder.model, (optimizer, scaler), step, extra)
            finish_epoch(encoder, root, docs, dev, extra)
        if step == 1 or checkpoints.due(step) or last:
            checkpoints.save(encoder.model, (optimizer, scaler), step, extra)
        if step % 10 == 0 or step == 1:
            print(json.dumps({'stage': 'training', 'step': step, 'steps': len(plan), 'loss': loss,
                'seconds': round(time.monotonic() - started, 1)}), flush=True)
    summary = {k: v for k, v in extra.items() if k != 'mined'}
    summary.update(trainRows=len(rows), devRows=len(dev), steps=len(plan),
        device=encoder.device, torch=torch.__version__,
        dtype=str(next(encoder.model.parameters()).dtype),
        trainableParameters=sum(p.numel() for p in encoder.model.parameters() if p.requires_grad))
    finish(root, summary, len(plan))
    print(json.dumps({'stage': 'complete', **summary}), flush=True)


if __name__ == '__main__': train(sys.argv[1])
