"""C·D 맹검 채점 모으기 — 판별 평균(11점·10점 환산), 항목별, 채점자별, current 와의 승패, 선호표.

  python3 sum_cd.py <cd-blind dir>
"""
import glob, json, os, sys, collections, random

d = sys.argv[1]
key = json.load(open(os.path.join(d, "key.json")))
ARMS = sorted(set(key.values()), key=lambda a: (a != "current", a))
ITEMS = ["direct", "slot", "method", "timing", "specific", "accuracy", "grounded", "concise"]
per_rater = collections.defaultdict(dict)  # rater -> label -> score
prefer = collections.Counter()
for f in sorted(glob.glob(os.path.join(d, "judge*-r*.json"))):
    rater = f.rsplit("-", 1)[1].split(".")[0]
    j = json.load(open(f))
    per_rater[rater].update(j["scores"])
    for q, lab in j.get("prefer", {}).items():
        prefer[(rater, key.get(f"{q}{lab}"))] += 1

qids = sorted({k[:2] for k in key})
def arm_scores(rater, arm, item="total"):
    out = {}
    for q in qids:
        lab = next(l for l in "ABCDEFG" if key.get(f"{q}{l}") == arm)
        s = per_rater[rater].get(f"{q}{lab}")
        if s: out[q] = s[item]
    return out

raters = sorted(per_rater)
print("채점자", raters, "문항", len(qids))
print(f"{'판':8}" + "".join(f"{r:>10}" for r in raters) + f"{'평균(11)':>10}{'10점':>7}")
mean = {}
for arm in ARMS:
    vals = [sum(arm_scores(r, arm).values()) / max(1, len(arm_scores(r, arm))) for r in raters]
    mean[arm] = sum(vals) / len(vals)
    print(f"{arm:8}" + "".join(f"{v:10.2f}" for v in vals) + f"{mean[arm]:10.2f}{mean[arm] / 11 * 10:7.2f}")

print("\n항목별(두 채점자 평균)")
print(f"{'판':8}" + "".join(f"{i[:6]:>8}" for i in ITEMS))
for arm in ARMS:
    row = []
    for item in ITEMS:
        vals = [v for r in raters for v in arm_scores(r, arm, item).values()]
        row.append(sum(vals) / max(1, len(vals)))
    print(f"{arm:8}" + "".join(f"{v:8.2f}" for v in row))

print("\ncurrent 대비 (문항별 두 채점자 평균) 승/패/무, 차이 95% 구간(부트스트랩)")
avg = lambda arm: {q: sum(arm_scores(r, arm)[q] for r in raters) / len(raters) for q in qids}
base = avg("current")
for arm in [a for a in ARMS if a != "current"]:
    a = avg(arm)
    diffs = [a[q] - base[q] for q in qids]
    w = sum(x > 0 for x in diffs); l = sum(x < 0 for x in diffs); t = len(diffs) - w - l
    rng = random.Random(0)
    boots = sorted(sum(rng.choice(diffs) for _ in diffs) / len(diffs) for _ in range(4000))
    print(f"  {arm:6} {w}승 {l}패 {t}무  평균차 {sum(diffs)/len(diffs):+.2f}  95% [{boots[100]:+.2f}, {boots[3899]:+.2f}]")

print("\n선호표")
for arm in ARMS:
    print(f"  {arm:8}" + " ".join(f"{r}:{prefer[(r, arm)]}" for r in raters))

agree = sum(
    1 for q in qids
    if len({max(ARMS, key=lambda arm: arm_scores(r, arm).get(q, -1)) for r in raters}) == 1
)
print(f"\n최고점 판 일치 {agree}/{len(qids)}")
