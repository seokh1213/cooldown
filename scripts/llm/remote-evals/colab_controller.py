"""Run Colab from Kubernetes, download results to Wukong, and release owned GPU sessions."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import signal
import subprocess

from report import render_report


class ColabCommandError(RuntimeError):
    pass


def timestamp():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def cli(args, *, timeout=120):
    result = subprocess.run(["colab", "--auth=oauth2", "-c", "/run/colab-auth/client.json", *args],
                            capture_output=True, text=True, timeout=timeout, env={**os.environ, "NO_COLOR": "1"})
    if result.returncode:
        reason = "Colab " + args[0] + " failed"
        if "403" in result.stderr or "invalid_grant" in result.stderr:
            reason = "Colab authentication requires renewal"
        if "400" in result.stderr or "Service Unavailable" in result.stderr:
            reason = "Colab GPU is unavailable"
        output = result.stderr + result.stdout
        categories = [name for name in ["ReadWriteLock", "ModuleNotFoundError", "FileNotFoundError", "TypeError", "AttributeError", "ValueError",
                                        "SSLError", "PermissionError", "TimeoutError", "ConnectionError", "CUDA", "HTTP 500", "HTTP 503",
                                        "not found", "appears to be lost", "401", "404", "403"] if name in output]
        raise ColabCommandError(reason + (" (" + ", ".join(categories) + ")" if categories else ""))
    return result.stdout


def update(directory, state):
    state["updated"] = timestamp()
    render_report(directory, state)


def prepare_smoke(workspace, repo):
    provenance = json.loads((workspace / "provenance.json").read_text())
    config = workspace / "smoke-config.json"
    config.write_text(json.dumps({"weightsSha256": provenance["weightsSha256"]}))
    source = repo / "research/llm-evals/kev-agent/kev-route3-test.jsonl"
    rows = [json.loads(line) for line in source.read_text().splitlines()]
    selected = []
    for language in ["ko_KR", "en_US", "zh_CN"]:
        selected.extend([row for row in rows if row["lang"] == language][:4])
    cases = workspace / "smoke-cases.jsonl"
    cases.write_text("\n".join(json.dumps(row, ensure_ascii=False) for row in selected))
    return config, cases


def run_smoke(name, workspace):
    repo = workspace / "repo"
    config, cases = prepare_smoke(workspace, repo)
    setup = workspace / "colab-setup.py"
    setup.write_text("from pathlib import Path\nPath('/content/cooldown').mkdir(exist_ok=True)\n")
    cli(["exec", "-s", name, "-f", str(setup), "--timeout", "60"])
    for source, destination in [(workspace / "models/model_q4.onnx", "model_q4.onnx"), (config, "smoke-config.json"), (cases, "smoke-cases.jsonl")]:
        cli(["upload", "-s", name, str(source), "/content/cooldown/" + destination], timeout=600)
    cli(["exec", "-s", name, "-f", str(repo / "scripts/llm/remote-evals/colab_smoke.py"), "--timeout", "900"], timeout=960)
    output = workspace / "results/colab-smoke.json"
    cli(["download", "-s", name, "/content/cooldown-smoke.json", str(output)], timeout=120)
    return json.loads(output.read_text())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", type=Path, default=Path("/workspace"))
    parser.add_argument("--run", required=True)
    args = parser.parse_args()
    workspace = args.workspace
    directory = workspace / "results"
    name = "cooldown-wukong-" + args.run
    state = {"run": args.run, "updated": timestamp(), "variants": {}, "metrics": {},
             "execution": "Colab T4 · Wukong에서 실행·결과 수집",
             "stages": [{"label": label, "status": "pending"} for label in ["Wukong Colab 인증", "T4 세션 생성", "현행 q4 호환성·속도 확인", "결과 저장·GPU 반납"]],
             "message": "로컬 컴퓨터와 독립적으로 실행합니다. 호환성을 확인한 뒤 학습·비교를 진행합니다."}
    session_owned = False
    failed = False
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(InterruptedError("Controller terminated")))
    try:
        for index, stage in enumerate(state["stages"]):
            stage["status"] = "running"
            update(directory, state)
            if index == 0:
                cli(["sessions"])
            elif index == 1:
                session_owned = True
                cli(["new", "-s", name, "--gpu", "T4"])
            elif index == 2:
                result = run_smoke(name, workspace)
                state["smoke"] = result
                state["message"] = f'{result["gpu"]}에서 {result["samples"]}문항의 q4 실행을 확인했습니다. 중앙값 {result["medianSeconds"]}초. 정확도 비교와 학습은 아직 대기 중입니다.'
            else:
                cli(["stop", "-s", name])
                session_owned = False
            stage["status"] = "complete"
            update(directory, state)
    except Exception as error:
        failed = True
        for stage in state["stages"]:
            if stage["status"] == "running":
                stage["status"] = "failed"
        state["message"] = "Colab 연결 또는 호환성 확인을 중단했습니다. 원인을 확인해 재개합니다."
        state["failure"] = str(error) if isinstance(error, ColabCommandError) else type(error).__name__
        print("Colab controller failed: " + type(error).__name__, flush=True)
        print(state["failure"], flush=True)
    finally:
        if session_owned:
            try:
                cli(["stop", "-s", name])
                state["stages"][-1]["status"] = "complete"
            except Exception:
                failed = True
                state["stages"][-1]["status"] = "failed"
                state["message"] = "GPU 반납 확인이 필요합니다. 서버에서 세션 상태를 확인합니다."
                print("Colab GPU cleanup requires verification", flush=True)
        update(directory, state)
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
