"""지금 앱 판 두 개(current.json)를 dev·test 로 나눠 견준다. 규칙은 dev 오답만 보고 고치고 test 로 잰다.

  python3 scripts/llm/vector-search/compare.py <전.json> <후.json>
"""
import json, sys, zlib
a, b = (json.load(open(f)) for f in sys.argv[1:3])
dev = lambda r: zlib.crc32((r["gold"][0] if r["gold"] else r["q"]).encode()) % 2 == 0
def stat(rows, part):
    rs = [r for r in rows if dev(r) == (part == "dev")]
    right = sum((r["current"] in r["gold"]) if r["gold"] else r["current"] is None for r in rs)
    wrong = sum(r["current"] is not None and r["current"] not in r["gold"] for r in rs)
    para = [r for r in rs if r["type"] == "paraphrase"]
    return f"맞음 {right}/{len(rs)} · 틀린 자료 {wrong} · 바꿔 말하기 {sum(r['current'] in r['gold'] for r in para)}/{len(para)}"
for part in ("dev", "test"):
    print(part, "전", stat(a, part), "| 후", stat(b, part))
