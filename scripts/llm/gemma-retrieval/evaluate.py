"""Paired retrieval results; frozen dev labels alone calibrate every threshold."""
import gzip
import json
from pathlib import Path
import sys
import subprocess
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'vector-search'))
from embeddinggemma_eval import ranked_cases, metrics, calibrate, split, validate_vectors
from embeddinggemma_runtime import sha256


def partitions(rows, manifest):
    groups = manifest['documentFamilies']
    result = {'dev': [], 'expandedTrain': [], 'expandedDev': [], 'expandedTest': [],
              'legacyTest': [], 'legacyAll': []}
    for i, row in enumerate(rows):
        if row['bank'] == 'expanded':
            result['expanded' + row['split'].title()].append(i)
            if row['split'] == 'dev': result['dev'].append(i)
        else:
            if row['goldAvailable']: result['legacyAll'].append(i)
            if row['bank'] == 'main' and split(row) == 'test' and row['goldAvailable']:
                result['legacyTest'].append(i)
            if row['bank'] == 'main' and row['gold'] and row['goldAvailable'] and all(
                    manifest['families'][groups[key]] == 'dev' for key in row['gold']):
                result['dev'].append(i)
    for name, indices in list(result.items()):
        result[name + 'Eligible'] = [i for i in indices if rows[i]['eligible']]
    return result


def thresholds(rows, cases, indices):
    # A zero-error dev budget is frozen in the protocol, not chosen on test scores.
    threshold, measured = calibrate(rows, cases, indices, wrong_cap=0)
    return threshold, measured


def fact_metrics(rows, cases, indices, threshold):
    groups = {}
    for i in indices:
        row, item = rows[i], cases[i]
        pick = item['top3'][0] if item['score'] >= threshold else None
        groups.setdefault(row.get('factId', str(i)), []).append(
            pick in row['gold'] if row['gold'] else pick is None)
    return {'facts': len(groups), 'allLanguagesCorrect': sum(all(v) for v in groups.values()),
            'meanCorrectLanguageFraction': float(np.mean([np.mean(v) for v in groups.values()])) if groups else None}


def evaluate(work, output):
    work, output = Path(work), Path(output)
    snapshot = json.loads((work / 'snapshot.json').read_text())
    manifest = json.loads((work / 'data/manifest.json').read_text())
    summary = json.loads((work / 'candidates/gemma/summary.json').read_text())
    rows = snapshot['rows']
    indices = partitions(rows, manifest)
    expected = sum(len(d) for d in snapshot['docs'].values()) + len(rows)
    matrices = {'qwenFresh': work / 'qwen-embeddings.npz', 'gemmaQ4': work / 'gemma-embeddings.npz',
        'gemmaNative': work / 'candidates/gemma/untuned.npz',
        **{f'gemmaEpoch{epoch}': work / f'candidates/gemma/epoch-{epoch}.npz' for epoch in [1, 2]}}
    result = {'protocol': manifest, 'training': summary, 'models': {},
        'snapshotSha256': sha256(work / 'snapshot.json'),
        'thresholdProtocol': 'Maximize dev correct under zero dev wrong answers. Tie: higher threshold. '
            'Fixed 0.43 current deployment also reported. Three language variants are grouped by fact.',
        'selectedOnDev': f"gemmaEpoch{summary['selectedEpoch']}" if summary['selectedEpoch'] else 'gemmaNative',
        'limits': 'Retrieval document selection only. Legacy questions have been used before. '
            'Gemma native comparisons isolate LoRA from q4 quantization; production Qwen is q4. '
            'New questions are authored from project documents, not an independent human-labelled benchmark.'}
    model_cases = {}
    for name, file in matrices.items():
        vectors = np.load(file)['vectors']
        validate_vectors(vectors, expected, 1024 if name == 'qwenFresh' else 768)
        model_cases[name] = ranked_cases(snapshot, vectors)
        if name == 'qwenFresh': model_cases['qwenDeployed'] = ranked_cases(snapshot, vectors, deployed=True)
    predictions = []
    for name, cases in model_cases.items():
        parity = work / (name + '-parity.json')
        parity.write_text(json.dumps([{'index': i, 'ranking': item['ranking'], 'fixed': item['fixed']}
            for i, item in enumerate(cases)]))
        bridge = Path(__file__).resolve().parents[1] / 'vector-search/embeddinggemma_prepare.ts'
        subprocess.run(['node', '--import', 'tsx', str(bridge), 'verify', str(work / 'snapshot.json'), str(parity)], check=True)
        parity.unlink()
        threshold, dev = thresholds(rows, cases, indices['dev'])
        result['models'][name] = {'threshold': float(threshold) if np.isfinite(threshold) else None,
            'dev': dev, 'calibrated': {key: metrics(rows, cases, ids, threshold) for key, ids in indices.items()},
            'fixed': {key: metrics(rows, cases, ids, snapshot['hybrid']['answer']) for key, ids in indices.items()},
            'heldoutFacts': fact_metrics(rows, cases, indices['expandedTest'], threshold)}
        for i, case in enumerate(cases):
            predictions.append({'model': name, 'index': i, 'id': rows[i].get('id', f'legacy:{i}'),
                'bank': rows[i]['bank'], 'q': rows[i]['q'], 'qKo': rows[i].get('qKo'),
                'lang': rows[i]['lang'], 'gold': rows[i]['gold'], 'eligible': rows[i]['eligible'],
                'split': rows[i].get('split', split(rows[i])), 'rawTop3': case['rawTop3'],
                'top3': case['top3'], 'score': case['score'], 'fixed': case['fixed'],
                'calibrated': case['top3'][0] if case['score'] >= threshold else None})
    selected = result['models'][result['selectedOnDev']]
    current = result['models']['qwenDeployed']
    fresh = result['models']['qwenFresh']
    test = 'expandedTestEligible'
    candidate_metrics = selected['calibrated'][test]
    current_metrics = fresh['calibrated'][test]
    checks = {
        'learnedEpochSelected': summary['selectedEpoch'] > 0,
        'expandedCorrect': candidate_metrics['correct'] >= current_metrics['correct'],
        'expandedWrong': candidate_metrics['wrongAnswer'] <= current_metrics['wrongAnswer'],
        'expandedRecall3': candidate_metrics['recall3Hits'] >= current_metrics['recall3Hits'],
        'legacyRecall3': selected['calibrated']['legacyTestEligible']['recall3Hits'] >= current['fixed']['legacyTestEligible']['recall3Hits'],
    }
    result['exportGate'] = {'pass': all(checks.values()), 'checks': checks,
        'protocol': 'All checks required before q4 export and browser promotion checks. QwenFresh uses the same 192-doc corpus; '
            'legacy uses actual deployed Qwen as its regression baseline. Frozen before the training outcome.'}
    result['appHybridParityRows'] = len(rows) * len(model_cases)
    output.mkdir(parents=True, exist_ok=True)
    (output / 'scores.json').write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    (output / 'predictions.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in predictions))
    (output / 'snapshot.json.gz').write_bytes(gzip.compress((work / 'snapshot.json').read_bytes(), mtime=0))
    print(json.dumps({'selected': result['selectedOnDev'], 'exportGate': result['exportGate'],
        'newHeldout': {name: model['calibrated']['expandedTest'] for name, model in result['models'].items()}}, ensure_ascii=False))


if __name__ == '__main__': evaluate(*sys.argv[1:])
