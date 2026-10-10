# Jeff 제로샷 시험대: 새 판정 문항 "아직 내 챔피언으로 하는가" 를 a-set 270턴의 이어 턴에서 잰다. b3e 앱 흐름 결과와 같은 턴에서 비교.
import json, sys, urllib.request, collections
URL = sys.argv[1]
rows = json.load(open("research/llm-evals/kev-agent/a-results-app.json"))
dia = [json.loads(l) for l in open("research/llm-evals/kev-agent/a-set.jsonl")]
names = {}
for lang in ("ko_KR", "en_US", "zh_CN"):
    names[lang] = {c["id"]: c["name"] for c in json.load(open(f"public/data/26.19/llm/champion-cards-{lang}.json"))["cards"]}
app = {(r["id"], r["turn"]): r for r in rows}
QS = {
  "still_mine": lambda m, e: {"type": "noul", "instructions": f"Is the user still playing {m} in the new message?"},
  "same_pair": lambda m, e: {"type": "noul", "instructions": f"Is the new message still about playing {m} against {e}?"},
  "kind3": lambda m, e: {"type": "choice", "instructions": "What does the new message ask about?", "criteria": {
      "same": f"More about playing {m} against {e}", "other": f"Still playing {m}, but against a different champion",
      "new": "Something else: a different champion to play, a rule, an item or small talk"}},
}
def ask(state, q):
    body = json.dumps({"model": "jeff-latest", "state": state, "questions": {"q": q}}).encode()
    with urllib.request.urlopen(urllib.request.Request(URL + "/v1/systemone", data=body, headers={"content-type": "application/json"})) as r:
        return json.loads(r.read())["answers"]["q"]
stat = collections.defaultdict(lambda: [0, 0])
for d in dia:
    for i, t in enumerate(d["turns"]):
        if i == 0: continue
        prev = d["turns"][i - 1]["gold"]
        if prev.get("kind") != "matchup": continue
        g = t["gold"]; m, e = names[d["lang"]][prev["mine"]], names[d["lang"]][prev["enemy"]]
        truth_mine = g.get("kind") == "matchup" and g.get("mine") == prev["mine"]
        truth_pair = truth_mine and g.get("enemy") == prev["enemy"]
        state = f"Earlier in this chat the user asked how to play {m} against {e}.\nNew message: {t['text']}"
        a = app.get((d["id"], i))
        if a:
            got = a["got"]; b_mine = got.get("kind") == "matchup" and got.get("mine") == prev["mine"]
            b_pair = b_mine and got.get("enemy") == prev["enemy"]
            stat["b3e still_mine"][0] += b_mine == truth_mine; stat["b3e still_mine"][1] += 1
            stat["b3e same_pair"][0] += b_pair == truth_pair; stat["b3e same_pair"][1] += 1
        for k, f in QS.items():
            ans = ask(state, f(m, e))
            if f(m, e)["type"] == "noul":
                yes = ans["noul"] >= 0.5
                truth = truth_mine if k == "still_mine" else truth_pair
                stat[f"jeff {k}"][0] += yes == truth; stat[f"jeff {k}"][1] += 1; stat[f"jeff {k} {d['lang']}"][0] += yes == truth; stat[f"jeff {k} {d['lang']}"][1] += 1; stat[f"jeff {k} yes-rate"][0] += yes; stat[f"jeff {k} yes-rate"][1] += 1; stat[f"truth {k} yes-rate"][0] += truth; stat[f"truth {k} yes-rate"][1] += 1
            else:
                c = ans["choice"]
                truth = "same" if truth_pair else "other" if truth_mine else "new"
                stat["jeff kind3"][0] += c == truth; stat["jeff kind3"][1] += 1
                stat["jeff kind3→same_pair"][0] += (c == "same") == truth_pair; stat["jeff kind3→same_pair"][1] += 1
for k, (ok, n) in sorted(stat.items()): print(f"{k}\t{ok}/{n}")
