"""Score every fixed diagnostic arm without selecting or promoting a winner."""
import copy
import json
from pathlib import Path
import subprocess
import sys

import numpy as np

from data import digest, read_jsonl
from diagnose import cohorts, retrieval_counts, decision_flow
from embeddinggemma_eval import calibrate, ranked_cases, validate_vectors
from embeddinggemma_runtime import sha256, texts

VARIANTS = ['length-256', 'length-512', 'coverage-512']


def language_groups(rows, groups):
    result = dict(groups)
    for name in ['legacyTestEligible', 'expandedTestEligible', 'legacySeen', 'legacyUnseen']:
        for lang in ['ko_KR', 'en_US', 'zh_CN']:
            result[name + ':' + lang] = [i for i in groups[name] if rows[i]['lang'] == lang]
    return result


def matched_change(rows, before, after, indices):
    def hit(cases, i): return any(key in rows[i]['gold'] for key in cases[i]['rawTop3'])
    answerable = [i for i in indices if rows[i]['gold']]
    return {
        'gained': [i for i in answerable if not hit(before, i) and hit(after, i)],
        'lost': [i for i in answerable if hit(before, i) and not hit(after, i)],
    }


def verify_app(work, cases):
    parity = work / 'diagnostic-parity.json'
    parity.write_text(json.dumps([{'index': i, 'ranking': item['ranking'], 'fixed': item['fixed']}
                                 for i, item in enumerate(cases)]))
    bridge = Path(__file__).resolve().parents[1] / 'vector-search/embeddinggemma_prepare.ts'
    try:
        subprocess.run(['node', '--import', 'tsx', str(bridge), 'verify',
                        str(work / 'snapshot.json'), str(parity)], check=True)
    finally:
        parity.unlink(missing_ok=True)


def score(work, candidates, output):
    snapshot = json.loads((work / 'snapshot.json').read_text())
    manifest = json.loads((work / 'data/manifest.json').read_text())
    if digest(snapshot['docs']) != manifest['corpusSha256']: raise ValueError('Frozen corpus changed')
    groups, _ = cohorts(snapshot, read_jsonl(work / 'data/train.jsonl'), manifest)
    rows = snapshot['rows']
    groups = language_groups(rows, groups)
    expected = sum(map(len, snapshot['docs'].values())) + len(rows)
    input_digest = digest([item['text'] for item in texts(snapshot, 'gemma')])
    result = {'purpose': 'Matched diagnostic continuation, no model selection or deployment.',
              'snapshotSha256': sha256(work / 'snapshot.json'), 'models': {}, 'changes': {}}
    all_cases = {}
    for name in VARIANTS:
        directory = candidates / name
        stored = np.load(directory / 'vectors.npz')
        if str(stored['inputDigest']) != input_digest: raise ValueError('Embedding input changed')
        vectors = stored['vectors']
        validate_vectors(vectors, expected, 768)
        cases = ranked_cases(snapshot, vectors)
        all_cases[name] = cases
        verify_app(work, cases)
        model = {'training': json.loads((directory / 'summary.json').read_text()),
                 'vectorsSha256': sha256(directory / 'vectors.npz'),
                 'adapterSha256': sha256(directory / 'adapter/adapter_model.safetensors'),
                 'retrieval': {key: retrieval_counts(rows, cases, ids) for key, ids in groups.items()},
                 'pipelines': {}}
        for pipeline in ['raw', 'hybrid']:
            changed = copy.deepcopy(snapshot)
            if pipeline == 'raw':
                changed['hybrid']['bm25'] = 0
                changed['hybrid']['lexical'] = dict.fromkeys(snapshot['hybrid']['lexical'], 0)
            selected = ranked_cases(changed, vectors)
            threshold, dev = calibrate(rows, selected, groups['dev'], wrong_cap=0)
            model['pipelines'][pipeline] = {
                'threshold': threshold, 'dev': dev,
                'groups': {key: decision_flow(rows, selected, groups[key], threshold)
                           for key in ['legacyTestEligible', 'expandedTestEligible']},
            }
        result['models'][name] = model
    for before, after in [('length-256', 'length-512'), ('length-512', 'coverage-512')]:
        result['changes'][before + '→' + after] = {
            key: matched_change(rows, all_cases[before], all_cases[after], ids)
            for key, ids in groups.items()}
    result['appHybridParityRows'] = len(rows) * len(VARIANTS)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    print(json.dumps({'variants': VARIANTS, 'appHybridParityRows': result['appHybridParityRows']}))


if __name__ == '__main__': score(*(Path(value) for value in sys.argv[1:]))
