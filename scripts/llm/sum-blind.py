"""맹검 채점 모으기 — 판별 평균(11점·10점 환산), 항목별, 기준 판과의 승패·95% 구간, 선호표.

  python3 sum-blind.py <judge 폴더> <key.json> <기준 판> [판=문항 필터 예: set=holdout] [rows.json]
"""
import glob, json, os, random, sys, collections

d, keyf, base = sys.argv[1], sys.argv[2], sys.argv[3]
flt = sys.argv[4] if len(sys.argv) > 4 else None
rows = json.load(open(sys.argv[5])) if len(sys.argv) > 5 else None
key = json.load(open(keyf))
ITEMS = ["direct", "slot", "method", "timing", "specific", "accuracy", "grounded", "concise"]
per = collections.defaultdict(dict)
prefer = collections.Counter()
for f in sorted(glob.glob(os.path.join(d, "judge*-r*.json"))):
    rater = f.rsplit("-", 1)[1].split(".")[0]
    j = json.load(open(f))
    per[rater].update(j["scores"])
    for q, lab in j.get("prefer", {}).items():
        prefer[key.get(f"{q}{lab}")] += 1
qids = sorted({k[:2] for k in key})
if flt and rows:
    fk, fv = flt.split("=")
    qids = [q for q in qids if str(rows[int(q)].get(fk)) == fv]
arms = sorted(set(key.values()), key=lambda a: (a != base, a))
raters = sorted(per)
def score(r, arm, q, item="total"):
    lab = next(l for l in "ABCDEFG" if key.get(f"{q}{l}") == arm)
    return per[r][f"{q}{lab}"][item]
avg = lambda arm, item="total": {q: sum(score(r, arm, q, item) for r in raters) / len(raters) for q in qids}
print(f"채점자 {raters} · 문항 {len(qids)}" + (f" ({flt})" if flt else ""))
print(f"{'판':10}" + "".join(f"{r:>8}" for r in raters) + f"{'11점':>8}{'10점':>7}")
for arm in arms:
    vals = [sum(score(r, arm, q) for q in qids) / len(qids) for r in raters]
    m = sum(vals) / len(vals)
    print(f"{arm:10}" + "".join(f"{v:8.2f}" for v in vals) + f"{m:8.2f}{m/11*10:7.2f}")
print("\n항목별")
print(f"{'판':10}" + "".join(f"{i[:6]:>8}" for i in ITEMS))
for arm in arms:
    print(f"{arm:10}" + "".join(f"{sum(avg(arm, i).values())/len(qids):8.2f}" for i in ITEMS))
print(f"\n{base} 대비 승/패/무, 평균차(11점), 95% 부트스트랩")
b = avg(base)
for arm in arms[1:]:
    a = avg(arm); diffs = [a[q] - b[q] for q in qids]
    w = sum(x > 0 for x in diffs); l = sum(x < 0 for x in diffs)
    rng = random.Random(0)
    boots = sorted(sum(rng.choice(diffs) for _ in diffs) / len(diffs) for _ in range(4000))
    print(f"  {arm:10} {w}승 {l}패 {len(diffs)-w-l}무  {sum(diffs)/len(diffs):+.2f}  [{boots[100]:+.2f}, {boots[3899]:+.2f}]")
if len(arms) > 2:
    print("\n판끼리")
    for i, x in enumerate(arms[1:], 1):
        for y in arms[i + 1:]:
            a, c = avg(y), avg(x); diffs = [a[q] - c[q] for q in qids]
            rng = random.Random(0)
            boots = sorted(sum(rng.choice(diffs) for _ in diffs) / len(diffs) for _ in range(4000))
            print(f"  {y} 대 {x}: {sum(v>0 for v in diffs)}승 {sum(v<0 for v in diffs)}패  {sum(diffs)/len(diffs):+.2f}  [{boots[100]:+.2f}, {boots[3899]:+.2f}]")
print("\n선호표 " + " · ".join(f"{a} {prefer[a]}" for a in arms))
