"""runs.json → 맹검 채점 묶음. 항목마다 두 모델을 A/B 로 섞고, 어느 쪽인지는 blind-key.json 에만 둔다."""
import json, os, random

OUT = os.path.dirname(os.path.abspath(__file__))
runs = json.load(open(os.path.join(OUT, "runs.json"), encoding="utf8"))
samples = json.load(open(os.path.join(OUT, "samples.json"), encoding="utf8"))
rng = random.Random(4242)
by = {(r["task"], r["batch"], r["lang"], r["model"]): r for r in runs}

sets = {"rules-zh": [], "matchup-en": [], "matchup-zh": []}
key = {}
for i, part in enumerate(samples["ruleBatches"]):
    for j, p in enumerate(part):
        sets["rules-zh"].append((f"r{i}-{j}", p["source"], {m: by[("rules", i, None, m)]["check"]["texts"][j] for m in ["gpt-6-sol", "gpt-6-luna"]}, None))
for lang, name in [("en_US", "matchup-en"), ("zh_CN", "matchup-zh")]:
    for i, b in enumerate(samples["matchupBatches"]):
        for j, job in enumerate(b["jobs"]):
            ctx = f"player: {b['me']}, enemy: {job['enemy']}, section: {job['slot']}"
            sets[name].append((f"{name[8:]}{i}-{j}", job["ko"], {m: by[("matchup", i, lang, m)]["check"]["texts"][j] for m in ["gpt-6-sol", "gpt-6-luna"]}, ctx))

for name, items in sets.items():
    out = []
    for iid, src, tr, ctx in items:
        flip = rng.random() < 0.5
        a, b = ("gpt-6-luna", "gpt-6-sol") if flip else ("gpt-6-sol", "gpt-6-luna")
        key[iid] = {"A": a, "B": b}
        row = {"id": iid, "source": src, "A": tr[a] or "(empty)", "B": tr[b] or "(empty)"}
        if ctx:
            row["context"] = ctx
        out.append(row)
    json.dump(out, open(os.path.join(OUT, f"blind-{name}.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print(name, len(out))
json.dump(key, open(os.environ.get("KEY_OUT", os.path.join(OUT, "blind-key.json")), "w", encoding="utf8"), indent=1)
