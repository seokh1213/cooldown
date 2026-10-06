"""Grounded numeric-span pilot. Split by document across all translations."""
import hashlib
import json
from pathlib import Path
import random
import re

NUMBER = re.compile(r"(?<![\w.])\d+(?:\.\d+)?(?:\s*(?:%|초|분|시간|秒|分钟|小时|seconds?|minutes?|hours?|골드|金币|gold|회|次))?", re.I)
LANGS = ["ko_KR", "en_US", "zh_CN"]


def partition(document_id):
    bucket = int(hashlib.sha256(document_id.encode()).hexdigest()[:8], 16) % 10
    return "test" if bucket < 2 else "dev" if bucket == 2 else "train"


def span_rows(doc, lang):
    rows = []
    for sentence in doc["text"].splitlines():
        for match in NUMBER.finditer(sentence):
            prefix = sentence[max(0, match.start() - 50):match.start()].strip()
            if len(prefix) < 8 or len(sentence) > 800 or doc["text"].count(prefix) != 1: continue
            value = match.group(0)
            question = {
                "ko_KR": f"{doc['title']} 자료에서 «{prefix}» 바로 다음의 숫자와 단위를 원문 그대로 찾아줘.",
                "en_US": f"In {doc['title']}, copy the number and unit immediately after «{prefix}».",
                "zh_CN": f"在{doc['title']}资料中，原样提取«{prefix}»紧接着的数字和单位。",
            }[lang]
            rows.append({"id": hashlib.sha256((lang + doc["id"] + sentence + str(match.start())).encode()).hexdigest()[:16],
                         "lang": lang, "docId": doc["id"], "question": question, "anchor": prefix,
                         "context": f"{doc['title']}\n{doc['text']}", "answer": value,
                         "answerable": True, "sourceSentence": sentence})
    return rows


def build(documents):
    rng = random.Random(20261005)
    splits = {key: [] for key in ["train", "dev", "test"]}
    for lang, docs in documents.items():
        for doc in docs:
            split = partition(doc["id"])
            # Context documents, including negatives, stay in the same partition.
            negatives = [d for d in docs if d["id"] != doc["id"] and partition(d["id"]) == split]
            for row in span_rows(doc, lang):
                splits[split].append(row)
                eligible = [d for d in negatives if row["anchor"] not in d["text"]]
                if eligible and rng.random() < 0.5:
                    negative = rng.choice(eligible)
                    negative_id = hashlib.sha256(negative["id"].encode()).hexdigest()[:8]
                    splits[split].append({**row, "id": row["id"] + "-absent-" + negative_id, "contextDocId": negative["id"],
                        "context": negative["title"] + "\n" + negative["text"], "answerable": False, "answer": "NOT_FOUND"})
    for name, rows in splits.items():
        rng.shuffle(rows)
        splits[name] = rows[:900 if name == "train" else 120]
    return splits


def main(directory):
    directory = Path(directory)
    documents = {lang: json.loads((directory / f"corpus-{lang}.json").read_text()) for lang in LANGS}
    splits = build(documents)
    for name, rows in splits.items():
        (directory / f"qa-{name}.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows))
    metadata = {"scope": "Synthetic numeric-span copying with explicit anchors; not a general RAG accuracy benchmark",
                "split": "Document ID SHA256; translations and negative contexts remain in the same partition",
                "counts": {key: len(value) for key, value in splits.items()}}
    (directory / "qa-provenance.json").write_text(json.dumps(metadata, indent=2))
    print(json.dumps(metadata))


if __name__ == "__main__":
    import sys
    main(sys.argv[1])
