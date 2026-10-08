"""Freeze multilingual question families before any training or model selection."""
import csv
from collections import Counter
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[3]
BANK = ROOT / 'research/llm-evals/datasets/retrieval-v2'
LANGS = ['ko_KR', 'en_US', 'zh_CN']
FAMILY_SPLITS = {'cleansing': 'test', 'lifesteal': 'dev', 'resistances': 'test',
                 'cc-actions': 'train', 'movement': 'train', 'crit': 'train'}
FAMILY_SPLITS.update({
    'none:live-winrate': 'dev', 'none:future-patch': 'dev', 'none:elo-prediction': 'dev',
    'none:precise-wall': 'test', 'none:microseconds': 'test',
    'none:item-shield-unknown': 'test', 'none:unreleased-taunt': 'test',
    'none:account-history': 'train', 'none:current-optimal-build': 'train',
    'none:voice-preference': 'train', 'none:other-game': 'train',
})
ALTERNATIVES = {
    'mech:cleanse-suppression': ['rule:정화'],
    'mech:cleanse-airborne': ['rule:정화'],
    'mech:negative-resistances': ['mech:저항과-피해-감소'],
    'mech:resistance-effective-health': ['mech:저항과-피해-감소'],
    'mech:penetration-vs-reduction': ['mech:관통과-감소,-그리고-적용-순서'],
}


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def family(doc):
    key = doc['id']
    if any(s in key for s in ['cleanse', 'qss-', 'leesin-r-', 'rule:정화']): return 'cleansing'
    if 'lifesteal' in key: return 'lifesteal'
    if any(s in key for s in ['resistance', 'penetration', '관통과', '저항과', 'meta:lethality']): return 'resistances'
    if any(s in key for s in ['crit', '공격-속도,']): return 'crit'
    if any(s in key for s in ['cc-movement', 'move-speed', 'slow-', 'celerity', 'rule:기민함', 'rule:쾌속 접근']): return 'movement'
    if any(s in key for s in ['smite-', 'tenacity', '-actions', 'sleep-', 'nearsight', 'cc-labels', 'mech:강인함', 'rule:강타']): return 'cc-actions'
    if 'grievous-' in key: return 'grievous'
    if key.startswith('meta:monster-'): return 'monster-stats'
    if any(s in key for s in ['classification', '아이템-등급']): return 'classification'
    return key


def partition(name):
    if name in FAMILY_SPLITS: return FAMILY_SPLITS[name]
    bucket = int(hashlib.sha256(('retrieval-v2:20261008:' + name).encode()).hexdigest()[:8], 16) % 10
    return 'train' if bucket < 7 else 'dev' if bucket == 7 else 'test'


def read_jsonl(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line]


def validate_question_rows(snapshot, expected):
    actual = [row for row in snapshot['rows'] if row['bank'] == 'expanded']
    if len(actual) != len(expected): raise ValueError('Expanded question coverage changed')
    for row, frozen in zip(actual, expected):
        if {key: row.get(key) for key in frozen} != frozen:
            raise ValueError('Expanded question text, labels, or split changed after freeze')


def expand(snapshot):
    docs = {d['id']: d for d in snapshot['docs']['ko_KR']}
    facts = list(csv.DictReader((BANK / 'facts.tsv').open(), delimiter='\t'))
    rows = []
    for fact in facts:
        key = fact['id']
        if not key.startswith('none:') and key not in docs: raise ValueError('Unknown source: ' + key)
        group = family(docs[key]) if key in docs else key
        for lang in LANGS:
            rows.append({'id': key + ':' + lang, 'factId': key, 'family': group,
                'split': partition(group), 'lang': lang, 'q': fact[lang], 'qKo': fact['ko_KR'],
                'gold': [key, *ALTERNATIVES.get(key, [])] if key in docs else [], 'type': fact['type'],
                'expectedAnswerability': 'unknown' if fact['type'] == 'evidence-limit' else 'no' if key.startswith('none:') else 'yes',
                'sourceSha256': digest(docs[key]) if key in docs else None})
    return rows


def prepare(work):
    work = Path(work)
    snapshot = json.loads((work / 'snapshot-original.json').read_text())
    rows = expand(snapshot)
    groups = {d['id']: family(d) for d in snapshot['docs']['ko_KR']}
    raw = read_jsonl(ROOT / 'research/llm-evals/vector-search/train.jsonl')
    valid = set(groups)
    train = [dict(row, family=groups[row['gold'][0]]) for row in raw
        if row['gold'] and set(row['gold']).issubset(valid) and
        all(partition(groups[key]) == 'train' for key in row['gold'])]
    train += [row for row in rows if row['split'] == 'train' and row['gold']]
    validation = []
    for index, row in enumerate(snapshot['rows']):
        if row['bank'] != 'main' or not row['gold'] or not set(row['gold']).issubset(valid): continue
        group = groups[row['gold'][0]]
        if partition(group) == 'dev': validation.append(dict(row, id=f'legacy:{index}', family=group, split='dev'))
    validation += [row for row in rows if row['split'] == 'dev']
    destination = work / 'data'
    destination.mkdir(exist_ok=True)
    for name, content in [('train', train), ('dev', validation), ('expanded', rows)]:
        (destination / (name + '.jsonl')).write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in content))
    (destination / 'corpus.json').write_text(json.dumps(snapshot['docs'], ensure_ascii=False))
    manifest = {'version': 2, 'seed': 20261008, 'expandedQuestions': len(rows),
        'facts': len(rows) // 3, 'trainRows': len(train), 'devRows': len(validation),
        'expandedSplits': dict(Counter(r['split'] for r in rows)),
        'families': {name: partition(name) for name in sorted(set(groups.values()))},
        'documentFamilies': groups, 'corpusSha256': digest(snapshot['docs']),
        'questionsSha256': digest(rows), 'trainSha256': digest(train), 'devSha256': digest(validation),
        'protocol': 'Family split frozen before training. No test-family positive or negative in training. '
            'Dev alone chooses epoch and answer threshold. All 821 previous questions stay a regression bank. '
            'Three translations are one fact, not three independent observations. Synthetic authored questions, not traffic. '
            'Qwen was previously trained on old documents; unseen-family claims apply only to this Gemma tuning run.',
        'selection': {'metric': 'answerable dev Recall@3, tie Recall@1, tie earlier epoch',
            'epochs': 2, 'learningRate': 0.0001, 'batchQueries': 8, 'temperature': 0.05,
            'loraRank': 8, 'loraAlpha': 16, 'trainTokens': 256, 'evalTokens': 512,
            'negativeMining': 'untuned Gemma top 3, train-family documents only'}}
    (BANK / 'questions.jsonl').write_text((destination / 'expanded.jsonl').read_text())
    (BANK / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    (destination / 'manifest.json').write_text((BANK / 'manifest.json').read_text())
    print(json.dumps({k: manifest[k] for k in ['expandedQuestions', 'facts', 'trainRows', 'devRows', 'expandedSplits']}))


if __name__ == '__main__': prepare(sys.argv[1])
