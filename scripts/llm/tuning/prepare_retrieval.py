"""Use the existing test-half definition and document-level dev holdout."""
import hashlib
import json
from pathlib import Path
import zlib


def split_rows(training, testing):
    test_questions = {(r["lang"], r["q"]) for r in testing}
    splits = {"train": [], "dev": [], "test": []}
    for row in training:
        if not row["gold"] or (row["lang"], row["q"]) in test_questions: continue
        if any(zlib.crc32(doc.encode()) % 2 for doc in row["gold"]): continue
        dev = int(hashlib.sha256(row["gold"][0].encode()).hexdigest()[:8], 16) % 5 == 0
        splits["dev" if dev else "train"].append(row)
    splits["test"] = [r for r in testing if zlib.crc32((r["gold"][0] if r["gold"] else r["q"]).encode()) % 2]
    return splits


def main(source, output):
    source, output = Path(source), Path(output)
    read = lambda file: [json.loads(line) for line in (source / file).read_text().splitlines()]
    documents = {lang: {doc["id"] for doc in json.loads((output / f"corpus-{lang}.json").read_text())}
                 for lang in ["ko_KR", "en_US", "zh_CN"]}
    training = read("train.jsonl")
    valid = [row for row in training if all(doc in documents[row["lang"]] for doc in row["gold"])]
    splits = split_rows(valid, read("queries.jsonl"))
    for name, rows in splits.items():
        (output / f"retrieval-{name}.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows))
    (output / "retrieval-all.jsonl").write_text((source / "queries.jsonl").read_text())
    print("Retrieval split:", {name: len(rows) for name, rows in splits.items()}, "retired training rows excluded:", len(training) - len(valid))


if __name__ == "__main__":
    import sys
    main(*sys.argv[1:3])
