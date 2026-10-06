"""Keep retrieval batches identical across checkpoint save and restart."""
import random

LANGS = ["ko_KR", "en_US", "zh_CN"]


def row_key(row):
    return row["lang"], row["q"], tuple(row["gold"])


def align_mined(rows, saved):
    if len(rows) != len(saved): raise ValueError("Mined checkpoint row count changed")
    lookup = {row_key(row): row for row in saved}
    if {row_key(row) for row in rows} != set(lookup):
        raise ValueError("Mined checkpoint questions changed")
    return [lookup[row_key(row)] for row in rows]


def retrieval_batches(mined):
    # Shuffle a copy; the checkpoint retains canonical training-file order.
    ordered = list(mined)
    random.Random(20261005).shuffle(ordered)
    batches = []
    for lang in LANGS:
        language_rows = [row for row in ordered if row["lang"] == lang]
        batches.extend(language_rows[i:i + 3] for i in range(0, len(language_rows), 3))
    random.Random(20261005).shuffle(batches)
    return batches
