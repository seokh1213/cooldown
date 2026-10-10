"""Time original/trained graphs separately after an explicit warm-up request."""
import json
from pathlib import Path
from statistics import median, quantiles
from artifact_io import atomic_json
from evaluate_browser_pilot import browser


def benchmark(metadata):
    root = Path(metadata["work"])
    port = json.loads((root / "browser-server.json").read_text())["port"]
    results = {}
    for key in ["qwen35", "qwen35-trained-q4", "qwen25-trained-q4", "lfm25-trained-q4f32"]:
        browser("open", f"http://127.0.0.1:{port}")
        browser("wait", "--fn", "typeof window.pilotLoad === 'function'")
        browser("eval", f"window.pilotLoad({json.dumps(key)})")
        gate = 1 if "trained" in key else 0
        browser("eval", f"window.pilotRun(0,{gate})")
        browser("eval", "window.pilotResults=[]")
        for _ in range(2):
            for start in range(0, 12, 4):
                browser("eval", f"(async()=>{{for(let i={start};i<{start+4};i++)await window.pilotRun(i,{gate});return window.pilotResults.length}})()")
        data = json.loads((root / "results/browser-results.json").read_text())
        if data["environment"]["variant"] != key or len(data["results"]) != 24:
            raise ValueError("Browser timing result set changed")
        atomic_json(root / f"results/{key}-browser-timing.json", data)
        seconds = [row["seconds"] for row in data["results"]]
        results[key] = {"requests": len(seconds), "medianSeconds": median(seconds),
                        "p95Seconds": quantiles(seconds, n=20, method="inclusive")[-1],
                        "loadSeconds": data["environment"]["loadSeconds"]}
        print(json.dumps({"model": key, **results[key]}), flush=True)
    summary = {"models": results, "questions": 12, "repetitions": 2, "warmupRequestsPerModel": 1,
               "scope": "Serial Mac WebGPU generation, preencoded prompts, max 24 tokens; excludes network download, routing/retrieval and startup compilation; localhost warm asset loading"}
    atomic_json(root / "results/browser-timing-summary.json", summary)
    return summary


if __name__ == "__main__":
    import sys
    benchmark(json.loads(Path(sys.argv[1]).read_text()))
