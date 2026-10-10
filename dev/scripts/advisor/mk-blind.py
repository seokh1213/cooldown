"""맹검 묶음 — 문항마다 여러 판의 답을 섞어 A, B, … 로 붙이고 채점 자료를 함께 싣는다.

  python3 mk-blind.py <rows.json> <out-dir> <판,판,…> [문항 수/묶음=15] [seed=20260926]
  → out-dir/packet{0..}.md, out-dir/../key.json (채점자가 못 보게 묶음 폴더 밖에 둔다)
"""
import json, os, random, sys

src, out, arms = sys.argv[1], sys.argv[2], sys.argv[3].split(",")
per = int(sys.argv[4]) if len(sys.argv) > 4 else 15
rng = random.Random(int(sys.argv[5]) if len(sys.argv) > 5 else 20260926)
rows = json.load(open(src))
os.makedirs(out, exist_ok=True)
key = {}
for p in range(0, len(rows), per):
    lines = []
    for i, r in enumerate(rows[p:p + per], start=p):
        order = arms[:]
        rng.shuffle(order)
        lines.append(f"# Q{i:02d}. {r['q']}\n\n<자료>\n{r['material']}\n</자료>\n")
        for label, arm in zip("ABCDEFG", order):
            key[f"{i:02d}{label}"] = arm
            lines.append(f"## {i:02d}{label}\n{r.get(arm) or '(답 없음)'}\n")
    open(os.path.join(out, f"packet{p // per}.md"), "w").write("\n".join(lines))
json.dump(key, open(os.path.join(os.path.dirname(os.path.abspath(out)), "key.json"), "w"), ensure_ascii=False, indent=1)
print(len(rows), "rows,", (len(rows) + per - 1) // per, "packets")
