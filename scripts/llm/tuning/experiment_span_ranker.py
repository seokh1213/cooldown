"""CPU pilot: numeric candidate selection, calibrated refusal, and pairwise distractors."""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from sklearn.feature_extraction import DictVectorizer
from sklearn.linear_model import LogisticRegression
from scipy.sparse import vstack
from span_candidates import candidates, choose


def read(file):
    return [json.loads(line) for line in file.read_text().splitlines() if line]


def pairs(rows):
    result, labels, ranges = [], [], []
    for row in rows:
        entries = candidates(row["context"], row["question"])
        ranges.append((len(result), len(result)+len(entries), entries))
        result.extend(entry["features"] for entry in entries)
        labels.extend(int(row["answerable"] and entry["answer"] == row["answer"]) for entry in entries)
    return result, np.array(labels), ranges


def predictions(ranges, scores, threshold, margin):
    return [choose(entries, scores[start:end], threshold, margin) for start,end,entries in ranges]


def summary(rows, outputs):
    positive = [i for i,row in enumerate(rows) if row["answerable"]]
    negative = [i for i,row in enumerate(rows) if not row["answerable"]]
    accepted = [i for i,answer in enumerate(outputs) if answer != "NOT_FOUND"]
    right = lambda subset: sum(outputs[i] == rows[i]["answer"] for i in subset)
    return dict(correct=right(range(len(rows))),total=len(rows),positive=dict(correct=right(positive),total=len(positive)),
                negative=dict(correct=right(negative),total=len(negative)),accepted=len(accepted),wrongAccepted=len(accepted)-right(accepted),
                candidateReachable=sum(any(entry["answer"]==row["answer"] for entry in candidates(row["context"],row["question"]))
                                       for row in rows if row["answerable"]))


def calibrate(rows, ranges, scores):
    trials = []
    for threshold in [0,.2,.4,.6,.8,.9,.95,.99]:
        for margin in [0,.05,.1,.2,.4]:
            result = summary(rows,predictions(ranges,scores,threshold,margin))
            pos,neg = result["positive"],result["negative"]
            macro = (pos["correct"]/max(1,pos["total"])+neg["correct"]/max(1,neg["total"]))/2
            trials.append((macro,result["correct"],-result["wrongAccepted"],threshold,margin))
    best = max(trials)
    return best[-2:]


def main():
    args = argparse.ArgumentParser()
    args.add_argument("--data", default="research/.cache/tuning/bases-20261006-011137/data")
    args.add_argument("--out", default="research/llm-evals/workflow/reports/span-ranker-20261007")
    options = args.parse_args(); root,out = Path(options.data),Path(options.out); out.mkdir(parents=True,exist_ok=True)
    files = [root/"natural-train.jsonl",root/"natural-dev.jsonl",root/"qa-followup.jsonl",root/"app-evidence.json"]
    train,dev,test = map(read,files[:3]); app = json.loads(files[3].read_text())
    doc_ids = lambda rows: {row.get(key,row["docId"]) for row in rows for key in ("docId","contextDocId")}
    assert not doc_ids(train) & doc_ids(dev), "Train/dev document leakage"
    assert not (doc_ids(train)|doc_ids(dev)) & doc_ids(test), "Heldout document leakage"
    features,y,ranges = pairs(train); dev_features,_,dev_ranges = pairs(dev)
    vector = DictVectorizer(); x = vector.fit_transform(features); dx = vector.transform(dev_features)
    point = LogisticRegression(C=1,max_iter=600,class_weight="balanced",random_state=7).fit(x,y)
    point_scores = point.predict_proba(dx)[:,1]; calibration = calibrate(dev,dev_ranges,point_scores)
    contrasts,contrast_y = [],[]
    for start,end,_ in ranges:
        positive = [index for index in range(start,end) if y[index]]
        negative = [index for index in range(start,end) if not y[index]]
        for good in positive[:1]:
            for bad in negative[:30]:
                delta = x[good]-x[bad]; contrasts.extend([delta,-delta]); contrast_y.extend([1,0])
    pair = LogisticRegression(C=1,max_iter=600,fit_intercept=False,random_state=7).fit(vstack(contrasts),contrast_y)
    pair_calibration = calibrate(dev,dev_ranges,pair.predict_proba(dx)[:,1])
    app_by_id = {row["id"]:row for row in app}
    app_rows = [{**row,"context":app_by_id[row["id"]].get("context") or app_by_id[row["id"]].get("text","")}
                for row in test if row["id"] in app_by_id and row["kind"]=="supported" and not row.get("conflictingSource")]
    results,answers = {},[]
    phases = [("provided-all",test),("provided-clean",[row for row in test if not row.get("conflictingSource")]),("app-frozen",app_rows)]
    for name,rows in phases:
        f,_,rs = pairs(rows); matrix = vector.transform(f)
        variants = {"lexical": predictions(rs,np.array([entry["lexical"] for _,_,entries in rs for entry in entries]),.01,0),
                    "pointwise":predictions(rs,point.predict_proba(matrix)[:,1],0,0),
                    "calibrated":predictions(rs,point.predict_proba(matrix)[:,1],*calibration),
                    "pairwise":predictions(rs,pair.predict_proba(matrix)[:,1],*pair_calibration)}
        results[name] = {key:summary(rows,value) for key,value in variants.items()}
        for variant,outputs in variants.items():
            answers.extend(dict(phase=name,variant=variant,id=row["id"],answer=answer,gold=row["answer"],correct=answer==row["answer"])
                           for row,answer in zip(rows,outputs))
    baseline_file = root.parent/"results/qwen35-trained-q4-browser-full/answers.jsonl"
    historical = read(baseline_file)
    paired = {}
    for name,rows in phases:
        phase = "app" if name=="app-frozen" else "provided"
        for variant in ["base","trained"]:
            by_id = {row["id"]:row for row in historical if row["phase"]==phase and row["variant"]==variant}
            assert all(row["id"] in by_id and row["answer"]==by_id[row["id"]]["gold"] for row in rows)
            paired[f"{name}:{variant}"] = summary(rows,[by_id[row["id"]]["answer"] for row in rows])
    files.append(baseline_file)
    report = dict(schema=1,inputs={str(file):hashlib.sha256(file.read_bytes()).hexdigest() for file in files},
                  train=len(train),dev=len(dev),heldout=len(test),dimension=len(vector.vocabulary_),pairs=len(features),
                  contrasts=len(contrast_y),calibration=calibration,pairCalibration=pair_calibration,results=results,pairedFrozenQwen=paired,
                  scope="Frozen evidence CPU extraction pilot. Not end-to-end web accuracy; no production weights changed.")
    (out/"summary.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    (out/"answers.jsonl").write_text("".join(json.dumps(row,ensure_ascii=False)+"\n" for row in answers))
    print(json.dumps(report,ensure_ascii=False))


if __name__ == "__main__": main()
