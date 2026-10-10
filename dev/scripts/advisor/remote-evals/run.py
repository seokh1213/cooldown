"""Run the current app's evaluation scripts against a frozen q4 snapshot on Wukong."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.request

from report import aggregate, render_report

ROOT = Path(__file__).resolve().parents[4]
STAGES = [("offline", "오프라인 기준값"), ("model", "q4 판정·대화"), ("search", "q4 검색")]


def timestamp():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def execute(command, env, output, timeout=7200):
    with output.open("w") as log:
        subprocess.run(command, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, check=True, timeout=timeout)


def wait_for_model(process):
    payload = json.dumps({"ids": [0], "positions": [0]}).encode()
    for _ in range(90):
        if process.poll() is not None:
            raise RuntimeError("Model service stopped")
        try:
            request = urllib.request.Request("http://127.0.0.1:8014/hidden", data=payload, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(request, timeout=30) as response:
                if len(json.load(response)["hidden"][0]) == 1024:
                    return
        except (urllib.error.URLError, TimeoutError):
            time.sleep(1)
    raise RuntimeError("Model service did not become ready")


def record_metrics(directory, state, prefix):
    labels = {"route": "질문 분류", "act": "흐름 판정", "flow": "대화 흐름", "dialogue": "대화 최종 대상·주제"}
    for suffix in ["route", "dialogue"]:
        path = directory / f"{prefix}-{suffix}.json"
        if not path.exists():
            continue
        for name, score in aggregate(json.loads(path.read_text())).items():
            state["metrics"][f'{"현행 q4" if prefix == "baseline" else "오프라인"} · {labels.get(name, name)}'] = score


def judge_evaluations(directory, state, prefix, env):
    scripts = ROOT / "dev/scripts/advisor/kev-agent"
    for suffix, script in [("route", "eval-b3.ts"), ("dialogue", "eval-a.ts")]:
        execute(["node", "--import", "tsx", str(scripts / script), "--out", str(directory / f"{prefix}-{suffix}.json")],
                env, directory / f"{prefix}-{suffix}.log")
        record_metrics(directory, state, prefix)
        update(directory, state)


def search_evaluation(directory, state, env):
    scripts = ROOT / "dev/scripts/advisor/vector-search"
    questions = ROOT / "dev/research/llm-evals/vector-search/queries.jsonl"
    output = directory / "baseline-search.npz"
    execute([sys.executable, str(scripts / "embed_questions.py"), env["EVAL_GRAPH"], str(questions), str(output)],
            env, directory / "baseline-embed.log")
    import numpy as np
    vectors = directory / "baseline-search.f32"
    np.load(output)["q"].astype(np.float32).tofile(vectors)
    execute(["node", "--import", "tsx", str(scripts / "eval_hybrid.ts"), str(questions), str(vectors), "test-half"],
            env, directory / "baseline-search.log")
    import re
    found = re.search(r"맞음 (\d+)/(\d+) · 틀린 자료 (\d+)", (directory / "baseline-search.log").read_text())
    if not found:
        raise RuntimeError("Search metrics missing")
    hit, total, wrong = map(int, found.groups())
    state["metrics"]["현행 q4 · 검색 정답"] = {"correct": hit, "total": total}
    state["message"] = f"검색 오답 노출 {wrong}/{total}건. 후보군 학습은 아직 시작하지 않았습니다."


def update(directory, state):
    state["updated"] = timestamp()
    render_report(directory, state)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--run", required=True)
    parser.add_argument("--initialize", action="store_true")
    args = parser.parse_args()
    directory = args.output.resolve()
    state = {"run": args.run, "updated": timestamp(), "variants": {"baseline": "pending"}, "metrics": {},
             "stages": [{"id": id_, "label": label, "status": "pending"} for id_, label in STAGES],
             "message": "현행 스냅샷을 준비했습니다. 학습 후보는 Colab에서 만들어 비교합니다."}
    update(directory, state)
    if args.initialize:
        return
    env = {**os.environ, "EVAL_GRAPH": str(args.model.resolve() / "model_q4.onnx")}
    state["variants"]["baseline"] = "running"
    process = None
    try:
        for stage in state["stages"]:
            stage["status"] = "running"
            update(directory, state)
            started = time.monotonic()
            if stage["id"] == "offline":
                judge_evaluations(directory, state, "offline", {**env, "JUDGE": "offline"})
            elif stage["id"] == "model":
                log = (directory / "model-service.log").open("w")
                process = subprocess.Popen([sys.executable, str(ROOT / "dev/scripts/advisor/kev-agent/hidden_judge_serve.py"),
                                            str(args.model.resolve()), "8014"], env=env, stdout=log, stderr=subprocess.STDOUT)
                wait_for_model(process)
                judge_evaluations(directory, state, "baseline", {**env, "HIDDEN_JUDGE": "http://127.0.0.1:8014"})
                process.terminate()
                process.wait(timeout=30)
                process = None
                log.close()
            else:
                search_evaluation(directory, state, env)
            stage["status"] = "complete"
            stage["seconds"] = round(time.monotonic() - started, 2)
            update(directory, state)
        state["variants"]["baseline"] = "complete"
    except Exception:
        state["variants"]["baseline"] = "failed"
        for stage in state["stages"]:
            if stage["status"] == "running":
                stage["status"] = "failed"
        state["message"] = "측정을 중단했습니다. 실행 로그를 확인해 재개합니다."
        raise
    finally:
        if process is not None:
            process.terminate()
            process.wait(timeout=30)
        update(directory, state)


if __name__ == "__main__":
    main()
