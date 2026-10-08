"""Change input length and wording with frozen weights and document embeddings."""
from contextlib import nullcontext
import json
import os
from pathlib import Path
import shutil
import sys

import numpy as np
import torch

from data import read_jsonl
from diagnose import cohorts, retrieval_counts
from model import doc_text, load, query_text
from embeddinggemma_eval import ranked_cases
from embeddinggemma_runtime import Encoder as OnnxEncoder, PROMPTS, download, sha256


@torch.no_grad()
def encode_at_limit(encoder, texts, limit):
    encoder.model.eval()
    return np.concatenate([encoder.encode(texts[i:i + 8], limit=limit).cpu().numpy()
                           for i in range(0, len(texts), 8)])


def rank_probes(documents, vectors, queries):
    result = []
    ids = [doc['id'] for doc in documents]
    for row, query in zip(queries, vectors['queries']):
        scores = vectors['documents'] @ query
        order = np.argsort(-scores, kind='stable')
        gold_indices = [j for j, key in enumerate(ids) if key in row['gold']]
        result.append({**row, 'top3': [ids[j] for j in order[:3]],
                       'goldRank': min(int(np.where(order == j)[0][0]) + 1 for j in gold_indices),
                       'goldScore': max(float(scores[j]) for j in gold_indices)})
    return result


def native_inputs(work, snapshot, queries):
    encoder = load(work, work / 'initial-adapter')
    documents = [doc for block in snapshot['docs'].values() for doc in block]
    texts = [doc_text(doc) for doc in documents]
    lengths = [len(encoder.tokenizer(text)['input_ids']) for text in texts]
    indices = [i for i, length in enumerate(lengths) if length > 256]
    changed_texts = [texts[i] for i in indices]
    count = len(documents)
    manifest = json.loads((work / 'data/manifest.json').read_text())
    groups, _ = cohorts(snapshot, read_jsonl(work / 'data/train.jsonl'), manifest)
    result = {'changedDocuments': len(indices), 'models': {}}
    arrays = {'documentIndices': np.array(indices)}
    for name, source in [('gemmaBase', 'untuned'), ('gemmaEpoch1', 'epoch-1')]:
        frozen = np.load(work / f'candidates/gemma/{source}.npz')['vectors']
        context = encoder.model.disable_adapter() if name == 'gemmaBase' else nullcontext()
        with context:
            full = encode_at_limit(encoder, changed_texts, 512)
            short = encode_at_limit(encoder, changed_texts, 256)
            probe_vectors = encode_at_limit(encoder, [query_text(row) for row in queries], 512)
        maximum_delta = float(np.max(np.abs(full - frozen[indices])))
        minimum_cosine = float(np.min(np.sum(full * frozen[indices], axis=1)))
        if maximum_delta > 1e-4 or minimum_cosine < .99999:
            raise ValueError('Native device replay disagrees with frozen vectors')
        changed = frozen.copy()
        changed[indices] = short
        cases = ranked_cases(snapshot, changed)
        details = {'maxReplayDelta': maximum_delta, 'minReplayCosine': minimum_cosine,
                   'inference256': {group: retrieval_counts(snapshot['rows'], cases, ids)
                                    for group, ids in groups.items()},
                   'wordingProbes': rank_probes(snapshot['docs']['ko_KR'],
                       {'documents': frozen[:len(snapshot['docs']['ko_KR'])], 'queries': probe_vectors}, queries)}
        result['models'][name] = details
        arrays[name + 'Full'] = full
        arrays[name + 'Short'] = short
        arrays[name + 'Queries'] = probe_vectors
        print(json.dumps({'nativeInputVariant': name, 'complete': True,
                          'replayDelta': maximum_delta}), flush=True)
    np.savez_compressed(work / 'native-input-interventions.npz', **arrays)
    return result


def qwen_inputs(work, snapshot, queries):
    root = Path(__file__).resolve().parents[3]
    directory = work / 'qwen'
    directory.mkdir(exist_ok=True)
    for name in ['tokenizer.json', 'tokenizer_config.json', 'config.json']:
        download('qwen', name, directory)
    target = directory / 'onnx/model_q4.onnx'
    target.parent.mkdir(exist_ok=True)
    graph = root / 'public' / snapshot['provenance']['model']['graph']
    files = json.loads((work / 'models.json').read_text())['qwen']['files']
    expected = next(item['sha256'] for item in files if item['path'].endswith('/model_q4.onnx'))
    if sha256(graph) != expected: raise ValueError('Frozen Qwen graph changed')
    shutil.copyfile(graph, target)
    base = Path.home() / '.cache/cooldown-kev/onnx-b3e/model_q4.onnx_data'
    weights = target.with_name('model_q4.onnx_data')
    if not weights.exists(): os.link(base, weights)
    encoder = OnnxEncoder(directory, 'qwen')
    vectors = np.stack([encoder.encode(PROMPTS['ko_KR'].format(row['q']))[0] for row in queries])
    frozen = np.load(work / 'qwen-embeddings.npz')['vectors']
    return rank_probes(snapshot['docs']['ko_KR'],
        {'documents': frozen[:len(snapshot['docs']['ko_KR'])], 'queries': vectors}, queries)


def run(work):
    work = Path(work)
    snapshot = json.loads((work / 'snapshot.json').read_text())
    queries = json.loads((work / 'diagnostic-queries.json').read_text())
    result = native_inputs(work, snapshot, queries)
    result['models']['qwen'] = {'wordingProbes': qwen_inputs(work, snapshot, queries)}
    result['purpose'] = 'Post-hoc input interventions. Rewrites are not runtime rules or blind quality evidence.'
    result['device'] = 'mps' if torch.backends.mps.is_available() else 'cpu'
    result['torch'] = torch.__version__
    result['vectorsSha256'] = sha256(work / 'native-input-interventions.npz')
    (work / 'input-interventions.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print('INPUT_DIAGNOSTICS_COMPLETE', flush=True)


if __name__ == '__main__': run(sys.argv[1])
