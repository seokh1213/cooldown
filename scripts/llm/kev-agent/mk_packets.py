"""C·D 맹검 묶음 — 문항마다 네 답(current·pre·C·D)을 섞어 A~D 로 붙이고 자료를 함께 싣는다.

  python3 mk_packets.py <cd-answers.json> <out-dir> [문항 수/묶음=10] [판 목록=current,pre,C,D]
  → out-dir/packet{0..}.md, key.json(문항·표지 → 판)
"""
import json, os, random, sys

src, out = sys.argv[1], sys.argv[2]
per = int(sys.argv[3]) if len(sys.argv) > 3 else 10
ARMS = sys.argv[4].split(",") if len(sys.argv) > 4 else ["current", "pre", "C", "D"]
rows = json.load(open(src))
os.makedirs(out, exist_ok=True)
rng = random.Random(20260925)
key = {}
for p in range(0, len(rows), per):
    lines = []
    for i, r in enumerate(rows[p:p + per], start=p):
        arms = ARMS[:]
        rng.shuffle(arms)
        lines.append(f"# Q{i:02d}. {r['q']}\n\n<자료>\n{r['material']}\n</자료>\n")
        for label, arm in zip("ABCDEFG", arms):
            key[f"{i:02d}{label}"] = arm
            lines.append(f"## {i:02d}{label}\n{r[arm] or '(답 없음)'}\n")
    open(os.path.join(out, f"packet{p // per}.md"), "w").write("\n".join(lines))
json.dump(key, open(os.path.join(out, "key.json"), "w"), ensure_ascii=False, indent=1)
print(len(rows), "rows,", (len(rows) + per - 1) // per, "packets")
