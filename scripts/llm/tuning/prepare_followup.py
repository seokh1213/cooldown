"""New test-only annotations and evidence windows selected without gold access."""
import argparse
import hashlib
import json
from pathlib import Path
import random
from followup_questions import ABSENT, FACTS
from prepare_qa import NUMBER, partition
from qa_context import select_context

CONFLICTS = {("rule:포탑", "125골드"), ("meta:plating", "120골드")}


def make_row(document, question, annotation):
    doc_id = document["id"]
    if partition(doc_id) != "test": raise ValueError("Follow-up document is not held-out")
    full = document["title"] + "\n" + document["text"]
    context = select_context(full, question)
    return {"id": hashlib.sha256((doc_id + question + annotation["kind"]).encode()).hexdigest()[:20],
            "lang": "ko_KR", "docId": doc_id, "question": question, "context": context,
            "cohort": "new", "answerVisible": annotation["answer"] in context,
            **annotation}


def build(documents):
    docs = {doc["id"]: doc for doc in documents}; rows = []
    for index, (doc_id, answer, phrase, *questions) in enumerate(FACTS):
        supporting = [line for line in docs[doc_id]["text"].splitlines() if answer in line and phrase in line]
        if not supporting: raise ValueError(f"Unverified follow-up annotation {index}")
        for question in questions:
            rows.append(make_row(docs[doc_id], question, {"answer": answer, "answerable": True,
                "kind": "supported", "factGroup": f"fact-{index:03}", "sourceSentence": supporting[0],
                "conflictingSource": (doc_id, answer) in CONFLICTS}))
    for index, (doc_id, question) in enumerate(ABSENT):
        rows.append(make_row(docs[doc_id], question, {"answer": "NOT_FOUND", "answerable": False,
            "kind": "missing-field", "factGroup": f"missing-{index:03}", "conflictingSource": False}))
    rng = random.Random(20261006)
    for row in rows[:len(FACTS) * 2:7]:
        candidates = [doc for doc in docs.values() if partition(doc["id"]) == "test"
                      and doc["id"] != row["docId"] and row["answer"] not in doc["text"]
                      and NUMBER.search(doc["text"])]
        wrong = rng.choice(candidates)
        annotation = {"answer": "NOT_FOUND", "answerable": False, "kind": "wrong-document",
                      "factGroup": row["factGroup"], "conflictingSource": False}
        negative = make_row(wrong, row["question"], annotation)
        negative["questionDocId"] = row["docId"]; rows.append(negative)
    return rows


def prepare(source, output):
    source = Path(source); output = Path(output); output.mkdir(parents=True, exist_ok=True)
    rows = build(json.loads((source / "corpus-ko_KR.json").read_text()))
    original = [json.loads(line) for line in (source / "qa-natural-test.jsonl").read_text().splitlines()]
    seen = {row["question"] for row in rows if row["kind"] != "wrong-document"}
    for row in original:
        if row["question"] in seen: continue
        rows.append({**row, "context": select_context(row["context"], row["question"]),
                     "cohort": "regression", "kind": "supported" if row["answerable"] else "wrong-document",
                     "factGroup": "original-" + row["id"].split("-absent")[0],
                     "conflictingSource": (row["docId"], row["answer"]) in CONFLICTS})
    for split in ["train", "dev"]:
        training = [json.loads(line) for line in (source / f"qa-{split}.jsonl").read_text().splitlines()]
        used = {id for row in training for id in [row["docId"], row.get("contextDocId", row["docId"])]}
        held = {id for row in rows for id in [row["docId"], row.get("contextDocId", row["docId"])]}
        if used & held: raise ValueError("Follow-up documents overlap training/dev")
    if len({row["id"] for row in rows}) != len(rows): raise ValueError("Duplicate follow-up ID")
    destination = output / "qa-followup.jsonl"
    destination.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows))
    summary = {"total": len(rows), "new": sum(row["cohort"] == "new" for row in rows),
               "regression": sum(row["cohort"] == "regression" for row in rows),
               "annotatedFacts": len(FACTS), "contextPolicy": "Question-only lexical window, 1300 characters",
               "sha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
               "split": "Original document-ID SHA256 split; no train/dev documents",
               "scope": "Provided frozen context; repeated paraphrases share fact groups"}
    (output / "followup-provenance.json").write_text(json.dumps(summary, indent=2))
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("source"); parser.add_argument("output")
    args = parser.parse_args(); print(json.dumps(prepare(args.source, args.output)))
