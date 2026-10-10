# /// script
# requires-python = "==3.13.*"
# dependencies = ["numpy==2.5.3", "onnxruntime==1.30.0", "tokenizers==0.23.2"]
# ///
"""Local retrieval comparison. Threshold selection never reads test labels."""
import argparse
import json
from pathlib import Path
import platform
import resource
import time
import zlib

import numpy as np
import onnxruntime as ort
import tokenizers
from embeddinggemma_runtime import Encoder, ROOT, input_digest, prepare_models, sha256, texts


def split(row):
    if row["bank"] != "main":
        return row["bank"]
    key = row["gold"][0] if row["gold"] else row["q"]
    return "test" if zlib.crc32(key.encode()) % 2 else "dev"


def atomic_json(path, value):
    temporary = path.with_suffix(path.suffix + ".partial")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(path)


def embed(cache, model):
    snapshot = json.loads((cache / "snapshot.json").read_text())
    prepare_models(cache, snapshot)
    signature = input_digest(snapshot, model) + sha256(cache / "models.json") + sha256(Path(__file__).with_name("embeddinggemma_runtime.py"))
    destination = cache / f"{model}-embeddings.npz"
    items = texts(snapshot, model)
    vectors, durations, token_ids = [], [], []
    if destination.exists():
        old = np.load(destination)
        if str(old["signature"]) != signature:
            raise ValueError("Stale embedding checkpoint; remove it before rerunning")
        vectors, durations = list(old["vectors"]), list(old["seconds"])
        token_ids = json.loads((cache / f"{model}-tokens.json").read_text())[:len(vectors)]
        if len(vectors) == len(items) and (cache / f"{model}-timings.json").exists():
            validate_vectors(np.stack(vectors), len(items), 1024 if model == "qwen" else 768)
            print(f"{model}: complete checkpoint reused", flush=True)
            return
    encoder = Encoder(cache / ("gemma" if model.startswith("gemma") else model), model)
    encoder.encode(items[0]["text"])
    start = time.perf_counter()
    for index in range(len(vectors), len(items)):
        vector, seconds, ids = encoder.encode(items[index]["text"])
        vectors.append(vector)
        durations.append(seconds)
        token_ids.append(ids)
        if (index + 1) % 25 == 0 or index + 1 == len(items):
            atomic_json(cache / f"{model}-tokens.json", token_ids)
            temporary = cache / f"{model}-checkpoint.npz"
            np.savez_compressed(temporary, vectors=np.stack(vectors), seconds=np.array(durations), signature=signature)
            temporary.replace(destination)
            print(f"{model}: {index + 1}/{len(items)}, elapsed {time.perf_counter() - start:.1f}s", flush=True)
    doc_count = sum(len(docs) for docs in snapshot["docs"].values())
    stats = {
        "loadSeconds": encoder.load_seconds,
        "querySeconds": percentiles(durations[doc_count:]), "documentSeconds": percentiles(durations[:doc_count]),
        "peakRssMiB": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1024 ** 2 if platform.system() == "Darwin" else 1024),
        "versions": {"python": platform.python_version(), "onnxruntime": ort.__version__, "numpy": np.__version__, "tokenizers": tokenizers.__version__},
        "provider": encoder.session.get_providers(), "threads": 4, "batch": 1,
        "schema": encoder.schema, "tokens": percentiles([len(ids) for ids in token_ids]),
    }
    atomic_json(cache / f"{model}-timings.json", stats)
    print(json.dumps({"model": model, **{key: stats[key] for key in ["loadSeconds", "querySeconds", "peakRssMiB"]}}), flush=True)


def percentiles(values):
    return {key: float(np.percentile(values, percentile)) for key, percentile in [("p50", 50), ("p90", 90), ("p99", 99), ("max", 100)]}


def validate_vectors(vectors, expected_rows, dimension):
    if vectors.shape != (expected_rows, dimension) or not np.isfinite(vectors).all():
        raise ValueError("Incomplete or invalid embedding checkpoint")
    if not np.allclose(np.linalg.norm(vectors, axis=1), 1, atol=1e-5):
        raise ValueError("Embeddings must be normalized")


def ranked_cases(snapshot, vectors, deployed=False):
    documents = {}
    offset = 0
    for lang, docs in snapshot["docs"].items():
        documents[lang] = ([d["id"] for d in docs], vectors[offset:offset + len(docs)])
        offset += len(docs)
    if deployed:
        base = ROOT / "public" / snapshot["provenance"]["model"]["retrieval"]["vectors"]
        meta = json.loads(base.with_suffix(".json").read_text())
        half = np.fromfile(base.with_suffix(".bin"), dtype=np.float16).astype(np.float32)
        documents = {lang: (block["ids"], half[block["offset"]:block["offset"] + len(block["ids"]) * meta["dim"]].reshape(-1, meta["dim"])) for lang, block in meta["languages"].items()}
    return [case(row, vectors[offset + index], documents[row["searchLang"]], snapshot["hybrid"]) for index, row in enumerate(snapshot["rows"])]


def case(row, vector, documents, hybrid):
    ids, matrix = documents
    cosine = matrix @ vector
    bm_max = max([0, *row["bm25"].values()])
    bm = np.array([row["bm25"].get(doc, 0) / bm_max if bm_max else 0 for doc in ids])
    lex = row.get("lexical")
    bonus = np.array([hybrid["lexical"][lex["step"]] if lex and lex["id"] == doc else 0 for doc in ids])
    scores = cosine + hybrid["bm25"] * bm + bonus
    order = np.argsort(-scores, kind="stable")
    raw_order = np.argsort(-cosine, kind="stable")
    return {
        "suggestThreshold": hybrid["suggest"],
        "rawTop3": [ids[j] for j in raw_order[:3]],
        "top3": [ids[j] for j in order[:3]], "score": float(scores[order[0]]),
        "fixed": ids[order[0]] if scores[order[0]] >= hybrid["answer"] else None,
        "ranking": [{"id": ids[j], "score": float(cosine[j])} for j in range(len(ids))],
    }


def metrics(rows, cases, indices, threshold):
    result = {"total": len(indices), "correct": 0, "wrongAnswer": 0, "missedAnswer": 0, "correctAbstention": 0,
              "recall1Hits": 0, "recall3Hits": 0, "answerable": 0, "noAnswer": 0,
              "relatedOffered": 0, "noAnswerRelated": 0, "rescuedByRelated": 0}
    for index in indices:
        row, item = rows[index], cases[index]
        pick = item["top3"][0] if item["score"] >= threshold else None
        gold = row["gold"]
        correct = pick in gold if gold else pick is None
        result["correct"] += int(correct)
        result["wrongAnswer"] += int(pick is not None and pick not in gold)
        result["missedAnswer"] += int(bool(gold) and pick is None)
        result["correctAbstention"] += int(not gold and pick is None)
        result["answerable"] += int(bool(gold))
        result["noAnswer"] += int(not gold)
        result["recall1Hits"] += int(bool(gold) and item["rawTop3"][0] in gold)
        result["recall3Hits"] += int(bool(gold) and any(doc in gold for doc in item["rawTop3"]))
        related = pick is None and item["score"] >= item.get("suggestThreshold", .35)
        result["relatedOffered"] += int(related)
        result["noAnswerRelated"] += int(related and not gold)
        result["rescuedByRelated"] += int(related and bool(gold) and any(doc in gold for doc in item["top3"]))
    return result


def calibrate(rows, cases, indices, wrong_cap):
    thresholds = [float("inf"), *sorted({item["score"] for i, item in enumerate(cases) if i in set(indices)})]
    options = [(metrics(rows, cases, indices, threshold), threshold) for threshold in thresholds]
    allowed = [(m, t) for m, t in options if m["wrongAnswer"] <= wrong_cap]
    chosen = max(allowed, key=lambda entry: (entry[0]["correct"], -entry[0]["wrongAnswer"], entry[1]))
    return chosen[1], chosen[0]


def gpu_gate(baseline, candidate, limits, footprint):
    checks = {
        "heldoutCorrect": candidate["testUsable"]["correct"] >= baseline["testUsable"]["correct"] + limits["minimumAdditionalCorrect"],
        "heldoutWrong": candidate["testUsable"]["wrongAnswer"] <= baseline["testUsable"]["wrongAnswer"] + limits["maximumAdditionalWrong"],
        "recall3": candidate["testUsable"]["recall3Hits"] >= baseline["testUsable"]["recall3Hits"] - limits["maximumRecall3Regression"],
        "directProbe": candidate["directEligible"]["correct"] >= baseline["directEligible"]["correct"] - limits["maximumDirectCorrectRegression"],
        "latency": footprint["querySeconds"]["p90"] <= limits["maximumQueryP90Seconds"],
        "memory": footprint["peakRssMiB"] <= limits["maximumPeakRssMiB"],
        "download": footprint["combinedMb"] <= limits["maximumCombinedDownloadMb"],
    }
    return {"pass": all(checks.values()), "checks": checks}


def score(cache):
    snapshot = json.loads((cache / "snapshot.json").read_text())
    rows = snapshot["rows"]
    indices = {name: [i for i, row in enumerate(rows) if split(row) == name] for name in ["dev", "test", "direct", "real"]}
    indices.update({f"{name}Eligible": [i for i in group if rows[i]["eligible"]] for name, group in list(indices.items())})
    indices.update({f"{name}Usable": [i for i in indices[f"{name}Eligible"] if rows[i]["goldAvailable"]] for name in ["dev", "test"]})
    for lang in snapshot["docs"]:
        indices[f"test_{lang}"] = [i for i in indices["test"] if rows[i]["lang"] == lang]
    indices["testParaphrase"] = [i for i in indices["test"] if rows[i]["type"] == "paraphrase"]
    model_cases = {}
    for model in ["qwen", "gemma", "gemma-full"]:
        vectors = np.load(cache / f"{model}-embeddings.npz")["vectors"]
        validate_vectors(vectors, sum(len(d) for d in snapshot["docs"].values()) + len(rows), 1024 if model == "qwen" else 768)
        model_cases[f"{model}Fresh"] = ranked_cases(snapshot, vectors)
        if model == "qwen":
            model_cases["qwenDeployed"] = ranked_cases(snapshot, vectors, deployed=True)
    fixed = snapshot["hybrid"]["answer"]
    baseline = {name: metrics(rows, model_cases["qwenDeployed"], group, fixed) for name, group in indices.items()}
    output = {"baseline": "qwenDeployed", "snapshotSha256": sha256(cache / "snapshot.json"), "protocol": snapshot["protocol"], "models": {}}
    for model, cases in model_cases.items():
        threshold, dev = calibrate(rows, cases, indices["devUsable"], baseline["devUsable"]["wrongAnswer"])
        variants = {
            "fixed": {name: metrics(rows, cases, group, fixed) for name, group in indices.items()},
            "calibrated": {name: metrics(rows, cases, group, threshold) for name, group in indices.items()},
        }
        output["models"][model] = {"threshold": threshold if np.isfinite(threshold) else None, "calibrationDev": dev, **variants}
        atomic_json(cache / f"{model}-predictions.json", [{"index": i, **item} for i, item in enumerate(cases)])
    sizes = json.loads((cache / "models.json").read_text())
    extra_mb = sum(item["bytes"] for item in sizes["gemma"]["files"]) / 1_000_000
    combined = snapshot["provenance"]["model"]["downloadMb"] + extra_mb
    candidates = ["gemmaFresh", "gemma-fullFresh"]
    winner = max(candidates, key=lambda name: (output["models"][name]["calibrationDev"]["correct"], -output["models"][name]["calibrationDev"]["wrongAnswer"], name == "gemmaFresh"))
    performance = json.loads((cache / ("gemma-full-timings.json" if winner == "gemma-fullFresh" else "gemma-timings.json")).read_text())
    output["selectedOnDev"] = winner
    output["gpuGate"] = gpu_gate(baseline, output["models"][winner]["calibrated"], snapshot["protocol"]["gpuGate"], {**performance, "combinedMb": combined})
    output["download"] = {"additionalMb": extra_mb, "combinedEstimateMb": combined}
    atomic_json(cache / "scores.json", output)
    print(json.dumps({name: {"threshold": value["threshold"], "fixedTest": value["fixed"]["test"], "calibratedTest": value["calibrated"]["test"]} for name, value in output["models"].items()}, ensure_ascii=False), flush=True)
    print(json.dumps(output["gpuGate"]), flush=True)


def benchmark(cache, model):
    snapshot = json.loads((cache / "snapshot.json").read_text())
    items = texts(snapshot, model)
    encoder = Encoder(cache / ("gemma" if model.startswith("gemma") else model), model)
    encoder.encode(items[-1]["text"])
    # Same deterministic multilingual sample for both models, independent of labels.
    queries = [i for i in items if i["kind"] == "query"]
    documents = [i for i in items if i["kind"] == "doc"]
    query_indices = np.linspace(0, len(queries) - 1, 60, dtype=int).tolist()
    doc_indices = np.linspace(0, len(documents) - 1, 15, dtype=int).tolist()
    query_seconds = [encoder.encode(queries[i]["text"])[1] for i in query_indices]
    doc_seconds = [encoder.encode(documents[i]["text"])[1] for i in doc_indices]
    timings = json.loads((cache / f"{model}-timings.json").read_text())
    timings["parallelEmbeddingQuerySeconds"] = timings["querySeconds"]
    timings["querySeconds"] = percentiles(query_seconds)
    timings["documentSeconds"] = percentiles(doc_seconds)
    timings["isolatedBenchmark"] = {"queryIndices": query_indices, "documentIndices": doc_indices, "querySeconds": query_seconds, "documentSeconds": doc_seconds}
    timings["loadSeconds"] = encoder.load_seconds
    isolated_rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1024 ** 2 if platform.system() == "Darwin" else 1024)
    timings.setdefault("embeddingPeakRssMiB", timings["peakRssMiB"])
    timings["isolatedBenchmark"]["peakRssMiB"] = isolated_rss
    timings["peakRssMiB"] = max(timings["embeddingPeakRssMiB"], isolated_rss)
    atomic_json(cache / f"{model}-timings.json", timings)
    print(json.dumps({"model": model, "querySeconds": timings["querySeconds"], "peakRssMiB": timings["peakRssMiB"]}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["embed", "score", "benchmark", "probe", "check"])
    parser.add_argument("cache", type=Path)
    parser.add_argument("--model", choices=["qwen", "gemma", "gemma-full"], default="gemma")
    args = parser.parse_args()
    if args.command == "embed":
        embed(args.cache.resolve(), args.model)
    elif args.command == "benchmark":
        benchmark(args.cache.resolve(), args.model)
    elif args.command == "probe":
        from embeddinggemma_probe import run
        run(args.cache.resolve())
    elif args.command == "check":
        import unittest
        suite = unittest.defaultTestLoader.discover(str(Path(__file__).parent), pattern="test_embeddinggemma.py")
        if not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful():
            raise SystemExit(1)
    else:
        score(args.cache.resolve())
