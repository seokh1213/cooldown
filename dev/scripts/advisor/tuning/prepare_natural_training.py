"""Build semantic QA training with document-isolated paraphrases and negatives."""
import json
from pathlib import Path
import random
from artifact_io import atomic_json, sha256
from natural_training_facts import FACTS
from prepare_qa import partition
from qa_context import select_context

FORMS = ["{stem}은 얼마야?", "{stem} 알려줘.", "자료에서 {stem}이 어떻게 돼?", "{stem} 숫자와 단위만 말해줘."]


def fact_rows(documents):
    rows = []
    for index, (document_id, needle, answer, stem) in enumerate(FACTS):
        doc = documents[document_id]
        lines = [line for line in doc["text"].splitlines() if needle in line]
        if len(lines) != 1 or answer not in lines[0]:
            raise ValueError(f"Annotation does not uniquely match evidence: {document_id} / {needle}")
        split = partition(document_id)
        if split == "test": raise ValueError("Held-out document entered training annotations")
        for form_index, form in enumerate(FORMS):
            question = form.format(stem=stem)
            context = select_context(doc["title"] + "\n" + doc["text"], question)
            if lines[0] not in context: raise ValueError("Question-only window omitted training evidence")
            rows.append({"id": f"natural-{index:03d}-{form_index}", "docId": document_id,
                         "contextDocId": document_id, "question": question, "context": context,
                         "answer": answer, "answerable": True, "sourceSentence": lines[0],
                         "factGroup": f"natural-{index:03d}", "split": split})
    return rows


def add_negatives(rows, documents):
    rng = random.Random(20261006)
    result = list(rows)
    for row in rows:
        if not row["id"].endswith("-0"): continue
        candidates = [doc for doc in documents.values() if partition(doc["id"]) == row["split"]
                      and doc["id"] != row["docId"] and doc["title"] not in row["question"]
                      and row["answer"] not in doc["text"]]
        if not candidates: continue
        doc = rng.choice(candidates)
        result.append({**row, "id": row["id"] + "-wrong-context", "answer": "NOT_FOUND",
                       "answerable": False, "contextDocId": doc["id"], "sourceSentence": "",
                       "context": select_context(doc["title"] + "\n" + doc["text"], row["question"])})
    return result


def prepare(root):
    root = Path(root)
    documents = {row["id"]: row for row in json.loads((root / "dev/data/corpus-ko_KR.json").read_text())}
    rows = add_negatives(fact_rows(documents), documents)
    rng = random.Random(20261006)
    counts = {}
    for split in ["train", "dev"]:
        selected = [row for row in rows if row["split"] == split]; rng.shuffle(selected)
        file = root / f"dev/data/natural-{split}.jsonl"
        file.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in selected))
        counts[split] = {"rows": len(selected), "positive": sum(row["answerable"] for row in selected),
                         "facts": len({row["factGroup"] for row in selected}),
                         "documents": len({row["docId"] for row in selected}), "sha256": sha256(file)}
    heldout = [json.loads(line) for line in (root / "dev/data/qa-followup.jsonl").read_text().splitlines()]
    used = {row[key] for row in rows for key in ["docId", "contextDocId"]}
    if used & {row["docId"] for row in heldout}: raise ValueError("Train/dev overlap held-out documents")
    summary = {"counts": counts, "heldoutQuestions": len(heldout), "heldoutSha256": sha256(root / "dev/data/qa-followup.jsonl"),
               "scope": "Manually annotated semantic facts with four template paraphrases and wrong-document negatives; not user traffic",
               "contextPolicy": "Question-only 1300-character window; no answer-aware crop"}
    atomic_json(root / "dev/data/natural-provenance.json", summary)
    return summary


if __name__ == "__main__":
    import sys
    print(json.dumps(prepare(sys.argv[1])))
