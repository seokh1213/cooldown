"""runs*.json · grade-*.json · blind-key.json → 표에 넣을 수치(summary.json)와 화면 출력."""
import json, os, statistics as st, math

OUT = os.path.dirname(os.path.abspath(__file__))
L = lambda f: json.load(open(os.path.join(OUT, f), encoding="utf8"))
MODELS = ["gpt-6-sol", "gpt-6-luna"]
runs = L("runs.json")
reps = L("runs-rep2.json") if os.path.exists(os.path.join(OUT, "runs-rep2.json")) else []
TASKS = {"rules-zh": ("rules", None), "matchup-en": ("matchup", "en_US"), "matchup-zh": ("matchup", "zh_CN")}
summary = {"speed": {}, "quality": {}, "agreement": {}}

print("== 속도 ==")
for name, (task, lang) in TASKS.items():
    for m in MODELS:
        r1 = [r for r in runs if r["task"] == task and r["lang"] == lang and r["model"] == m]
        r2 = [r for r in reps if r["task"] == task and r["lang"] == lang and r["model"] == m]
        secs = [r["seconds"] for r in r1 + r2]
        out = [r["usage"]["output_tokens"] for r in r1 + r2 if r["usage"]]
        reas = [r["usage"]["reasoning_output_tokens"] for r in r1 + r2 if r["usage"]]
        inp = [r["usage"]["input_tokens"] for r in r1 + r2 if r["usage"]]
        cached = [r["usage"]["cached_input_tokens"] for r in r1 + r2 if r["usage"]]
        units = sum(len(r["check"]["pass"]) for r in r1)
        passed = sum(sum(r["check"]["pass"]) for r in r1)
        units2 = sum(len(r["check"]["pass"]) for r in r2)
        passed2 = sum(sum(r["check"]["pass"]) for r in r2)
        s = {
            "calls": len(secs), "secondsPerBatch": round(st.mean(secs), 1), "secondsMin": min(secs), "secondsMax": max(secs),
            "secondsRep1": [r["seconds"] for r in sorted(r1, key=lambda r: r["batch"])], "secondsRep2": [r["seconds"] for r in sorted(r2, key=lambda r: r["batch"])],
            "outputTokensPerBatch": round(st.mean(out)), "reasoningTokensPerBatch": round(st.mean(reas)),
            "inputTokensPerBatch": round(st.mean(inp)), "cachedInputPerBatch": round(st.mean(cached)),
            "pass": f"{passed}/{units}", "passRate": round(passed / units, 3), "passRep2": f"{passed2}/{units2}" if units2 else None,
        }
        summary["speed"][f"{name}/{m}"] = s
        print(name, m, s)

key = L("blind-key.json") if os.path.exists(os.path.join(OUT, "blind-key.json")) else None
grades = [L(f) for f in sorted(os.listdir(OUT)) if f.startswith("grade-") and f.endswith(".json")]
if key and grades:
    print("\n== 품질 ==")
    for name in TASKS:
        per = {}  # grader -> model -> list
        items = {}
        for g in grades:
            gid = g["grader"]
            for iid, sc in g[name].items():
                k = key[iid]
                for side in "AB":
                    per.setdefault(gid, {}).setdefault(k[side], []).append(sc[side])
                    items.setdefault(iid, {}).setdefault(k[side], {})[gid] = sc[side]
        q = {}
        for m in MODELS:
            q[m] = {f"grader{g}": round(st.mean(per[g][m]), 2) for g in per}
            q[m]["mean"] = round(st.mean([v for g in per for v in per[g][m]]), 2)
        # 항목별 승패(두 채점자 합)
        win = {"gpt-6-sol": 0, "gpt-6-luna": 0, "tie": 0}
        for iid, d in items.items():
            s, l = sum(d["gpt-6-sol"].values()), sum(d["gpt-6-luna"].values())
            win["gpt-6-sol" if s > l else "gpt-6-luna" if l > s else "tie"] += 1
        q["itemWins"] = win
        q["major(<=5)"] = {m: sum(1 for d in items.values() for v in d[m].values() if v <= 5) for m in MODELS}
        summary["quality"][name] = q
        # 일치도: 점수 상관(피어슨), 항목 선호 방향 일치율
        gids = sorted(per)
        if len(gids) == 2:
            xs, ys, same, n = [], [], 0, 0
            for iid, d in items.items():
                for m in MODELS:
                    xs.append(d[m][gids[0]]); ys.append(d[m][gids[1]])
                p0 = (d["gpt-6-sol"][gids[0]] > d["gpt-6-luna"][gids[0]]) - (d["gpt-6-sol"][gids[0]] < d["gpt-6-luna"][gids[0]])
                p1 = (d["gpt-6-sol"][gids[1]] > d["gpt-6-luna"][gids[1]]) - (d["gpt-6-sol"][gids[1]] < d["gpt-6-luna"][gids[1]])
                same += p0 == p1
                n += 1
            mx, my = st.mean(xs), st.mean(ys)
            cov = sum((a - mx) * (b - my) for a, b in zip(xs, ys))
            r = cov / math.sqrt(sum((a - mx) ** 2 for a in xs) * sum((b - my) ** 2 for b in ys)) if cov else 0
            within1 = sum(abs(a - b) <= 1 for a, b in zip(xs, ys)) / len(xs)
            summary["agreement"][name] = {"pearson": round(r, 2), "within1pt": round(within1, 2), "preferenceSame": f"{same}/{n}"}
        print(name, q, summary["agreement"].get(name))

json.dump(summary, open(os.path.join(OUT, "summary.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
