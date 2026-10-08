"""Restore historical document coverage while keeping the Korean row count fixed."""
import random


def restore_coverage(current, historical):
    seen = {key for row in current for key in row['gold']}
    additions = [dict(row) for row in historical if any(key not in seen for key in row['gold'])]
    protected = {i for i, row in enumerate(current) if 'factId' in row}
    covered = {key for i in protected for key in current[i]['gold']}
    for i, row in enumerate(current):
        if any(key not in covered for key in row['gold']):
            protected.add(i)
            covered.update(row['gold'])
    removable = [i for i in range(len(current)) if i not in protected]
    if len(additions) > len(removable):
        raise ValueError('Not enough redundant rows to restore historical coverage')
    removed = set(random.Random(20261008).sample(removable, len(additions)))
    result = [dict(row) for i, row in enumerate(current) if i not in removed] + additions
    return result


def ordered_batches(rows):
    shuffled = list(rows)
    random.Random(20261009).shuffle(shuffled)
    return [shuffled[i:i + 8] for i in range(0, len(shuffled), 8)]
