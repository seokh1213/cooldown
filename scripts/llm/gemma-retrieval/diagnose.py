"""Explain frozen retrieval gaps without choosing a new production model."""
import argparse
import copy
import json
from pathlib import Path

import numpy as np

from data import digest, read_jsonl
from evaluate import partitions
from embeddinggemma_eval import calibrate, metrics, ranked_cases, validate_vectors
from embeddinggemma_runtime import sha256

MATRICES = {
    'qwen': 'qwen-embeddings.npz',
    'gemmaQ4': 'gemma-embeddings.npz',
    'gemmaBase': 'candidates/gemma/untuned.npz',
    'gemmaEpoch1': 'candidates/gemma/epoch-1.npz',
    'gemmaEpoch2': 'candidates/gemma/epoch-2.npz',
}


def gold_seen(row, seen):
    return any(key in seen.get(row['lang'], set()) for key in row['gold'])


def cohorts(snapshot, train, manifest):
    groups = partitions(snapshot['rows'], manifest)
    seen = {lang: {key for row in train if row['lang'] == lang for key in row['gold']}
            for lang in snapshot['docs']}
    legacy = [i for i in groups['legacyTestEligible'] if snapshot['rows'][i]['gold']]
    groups['legacySeen'] = [i for i in legacy if gold_seen(snapshot['rows'][i], seen)]
    groups['legacyUnseen'] = [i for i in legacy if not gold_seen(snapshot['rows'][i], seen)]
    return groups, seen


def retrieval_counts(rows, cases, indices):
    answerable = [i for i in indices if rows[i]['gold']]
    return {
        'questions': len(indices), 'answerable': len(answerable),
        'rawR1': sum(cases[i]['rawTop3'][0] in rows[i]['gold'] for i in answerable),
        'rawR3': sum(any(key in rows[i]['gold'] for key in cases[i]['rawTop3']) for i in answerable),
        'hybridR1': sum(cases[i]['top3'][0] in rows[i]['gold'] for i in answerable),
    }


def decision_flow(rows, cases, indices, threshold):
    correct_rank = [i for i in indices if rows[i]['gold'] and cases[i]['top3'][0] in rows[i]['gold']]
    return {
        'rankedCorrect': len(correct_rank),
        'acceptedCorrect': sum(cases[i]['score'] >= threshold for i in correct_rank),
        'rejectedCorrect': sum(cases[i]['score'] < threshold for i in correct_rank),
        'measured': metrics(rows, cases, indices, threshold),
    }


def pipeline_ablation(snapshot, vectors, groups):
    result = {}
    rows = snapshot['rows']
    for variant in ['raw', 'bm25', 'lexical', 'hybrid']:
        changed = copy.deepcopy(snapshot)
        if variant in ['raw', 'lexical']: changed['hybrid']['bm25'] = 0
        if variant in ['raw', 'bm25']:
            changed['hybrid']['lexical'] = dict.fromkeys(snapshot['hybrid']['lexical'], 0)
        cases = ranked_cases(changed, vectors)
        threshold, dev = calibrate(rows, cases, groups['dev'], wrong_cap=0)
        details = {'threshold': threshold, 'calibrationDev': dev}
        for name in ['legacyTestEligible', 'expandedTestEligible']:
            indices = groups[name]
            details[name] = {
                **retrieval_counts(rows, cases, indices),
                **decision_flow(rows, cases, indices, threshold),
                'demoted': [i for i in indices if rows[i]['gold']
                            and cases[i]['rawTop3'][0] in rows[i]['gold']
                            and cases[i]['top3'][0] not in rows[i]['gold']],
                'rescued': [i for i in indices if rows[i]['gold']
                            and cases[i]['rawTop3'][0] not in rows[i]['gold']
                            and cases[i]['top3'][0] in rows[i]['gold']],
            }
        result[variant] = details
    return result


def corpus_ablation(snapshot, vectors, groups, meta):
    shortened = copy.deepcopy(snapshot)
    blocks = []
    coverage = {}
    offset = 0
    for lang, docs in snapshot['docs'].items():
        keep = set(meta['languages'][lang]['ids'])
        selected = [j for j, doc in enumerate(docs) if doc['id'] in keep]
        coverage[lang] = {'shared': len(selected), 'deployed': len(keep),
                          'missingFromCurrent': sorted(keep - {doc['id'] for doc in docs})}
        shortened['docs'][lang] = [docs[j] for j in selected]
        blocks.append(vectors[offset + np.array(selected)])
        offset += len(docs)
    blocks.append(vectors[offset:])
    cases = ranked_cases(shortened, np.concatenate(blocks))
    return {**retrieval_counts(snapshot['rows'], cases, groups['legacyTestEligible']),
            'documents': coverage}


def dev_difference(snapshot, work, groups):
    def key(row): return (row['lang'], row['q'], tuple(row['gold']))
    frozen = read_jsonl(work / 'data/dev.jsonl')
    calibrated = {key(snapshot['rows'][i]) for i in groups['dev']}
    omitted = [row for row in frozen if key(row) not in calibrated]
    return {'trainerRows': len(frozen), 'calibrationRows': len(groups['dev']),
            'trainerAnswerable': sum(bool(row['gold']) for row in frozen),
            'omitted': omitted}


def token_coverage(snapshot, train, tokenizer_path):
    from tokenizers import Tokenizer
    tokenizer = Tokenizer.from_file(str(tokenizer_path))
    result = {}
    for lang, docs in snapshot['docs'].items():
        counts = {}
        tails = []
        for doc in docs:
            text = f"title: {doc['title']} | text: {doc['text'][:600]}"
            encoded = tokenizer.encode(text)
            counts[doc['id']] = len(encoded.ids)
            if len(encoded.ids) > 256:
                tails.append({'id': doc['id'], 'tokens': len(encoded.ids),
                              'omittedAtTraining': text[encoded.offsets[255][1]:]})
        rows = [row for row in train if row['lang'] == lang]
        result[lang] = {
            'documents': len(docs), 'documentsOver256': len(tails),
            'documentsOver512': sum(n > 512 for n in counts.values()),
            'trainRows': len(rows),
            'trainRowsWithTruncatedGold': sum(any(counts[key] > 256 for key in row['gold']) for row in rows),
            'truncatedDocuments': tails,
        }
    return result


def paired_gap(rows, current, candidate, indices):
    def hits(i, cases): return any(key in rows[i]['gold'] for key in cases[i]['rawTop3'])
    only_current = [i for i in indices if rows[i]['gold'] and hits(i, current) and not hits(i, candidate)]
    only_candidate = [i for i in indices if rows[i]['gold'] and hits(i, candidate) and not hits(i, current)]
    return {'qwenOnly': only_current, 'gemmaOnly': only_candidate,
            'netQwenAdvantage': len(only_current) - len(only_candidate)}


def analyze(work, output):
    snapshot = json.loads((work / 'snapshot.json').read_text())
    manifest = json.loads((work / 'data/manifest.json').read_text())
    if digest(snapshot['docs']) != manifest['corpusSha256']:
        raise ValueError('Frozen corpus changed')
    train = read_jsonl(work / 'data/train.jsonl')
    if digest(train) != manifest['trainSha256']: raise ValueError('Frozen training data changed')
    deployed = json.loads((work / 'frozen-deployed-doc-vectors.json').read_text())
    groups, seen = cohorts(snapshot, train, manifest)
    rows = snapshot['rows']
    output.mkdir(parents=True, exist_ok=True)
    result = {'purpose': 'Post-hoc causal diagnostics, not a new blind quality score or promotion.',
              'snapshotSha256': sha256(work / 'snapshot.json'),
              'deployedDocumentMetadataSha256': digest(deployed),
              'hybrid': snapshot['hybrid'], 'models': {}, 'paired': {},
              'devDifference': dev_difference(snapshot, work, groups),
              'trainingDocuments': {lang: len(ids) for lang, ids in seen.items()}}
    cases_by_model = {}
    for name, path in MATRICES.items():
        vectors = np.load(work / path)['vectors']
        expected = sum(map(len, snapshot['docs'].values())) + len(rows)
        validate_vectors(vectors, expected, 1024 if name == 'qwen' else 768)
        cases = ranked_cases(snapshot, vectors)
        cases_by_model[name] = cases
        result['models'][name] = {
            'vectorsSha256': sha256(work / path),
            'cohorts': {key: retrieval_counts(rows, cases, ids) for key, ids in groups.items()},
            'pipeline': pipeline_ablation(snapshot, vectors, groups),
            'legacySharedCorpusSameVectors': corpus_ablation(snapshot, vectors, groups, deployed),
        }
    for name in ['gemmaBase', 'gemmaEpoch1', 'gemmaEpoch2']:
        result['paired'][name] = {group: paired_gap(rows, cases_by_model['qwen'], cases_by_model[name], groups[group])
                                 for group in ['legacySeen', 'legacyUnseen', 'expandedTestEligible']}
    tokenizer = work / 'official/tokenizer.json'
    if tokenizer.exists(): result['tokenCoverage'] = token_coverage(snapshot, train, tokenizer)
    interesting = set(groups['dev']) | set(groups['expandedTestEligible'])
    for candidate in result['paired'].values():
        for details in candidate.values():
            interesting.update(details['qwenOnly'])
            interesting.update(details['gemmaOnly'])
    result['diagnosticCaseRows'] = len(interesting)
    (output / 'diagnosis.json').write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    (output / 'cases.jsonl').write_text(''.join(json.dumps({
        'index': i, 'lang': row['lang'], 'q': row['q'], 'qKo': row.get('qKo'), 'gold': row['gold'],
        'models': {name: {key: cases[i][key] for key in ['rawTop3', 'top3', 'score']} for name, cases in cases_by_model.items()},
    }, ensure_ascii=False) + '\n' for i, row in enumerate(rows) if i in interesting))
    print(json.dumps({'models': list(result['models']), 'questions': len(rows),
                      'trainingDocuments': result['trainingDocuments']}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('work', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    analyze(args.work, args.output)
