"""route-train 의 "그 밖"(other) 문항을 더 잘게 나눈다: item · rune · spell · game · chat.

아이템·룬·소환사 주문 이름은 앱 자료(아이템 목록, rule-notes)에서 찾고, 게임 규칙·잡담은 낱말로 가른다.
틀린 것은 OVERRIDE 에 사람이 적는다(검수 결과). 입력·출력은 kev 요청 꼴 JSONL.

  python3 relabel_other.py <route-train.jsonl> <out.jsonl>
"""
import json, re, sys, collections

D = "public/data/26.19"
rules = json.load(open(f"{D}/llm/rule-notes.json"))["rules"]
RUNE = {r["name"] for r in rules if r["subject"] == "rune"} | {r["page"] for r in rules if r["subject"] == "rune"}
SPELL = {r["name"] for r in rules if r["subject"] == "summoner"} | {r["page"] for r in rules if r["subject"] == "summoner"}
ITEMS = set()
for lang in ("ko_KR", "en_US", "zh_CN"):
    for it in json.load(open(f"{D}/items-normalized-{lang}.json"))["items"]:
        n = it.get("name")
        if n and len(n) >= 2: ITEMS.add(n)
RUNE |= {"룬", "rune", "符文", "치속", "착취", "콩콩이", "유성", "Grasp", "conq", "Conq", "Aftershock", "Guardian", "Cosmic Insight",
         "先攻", "致命节奏", "电刑", "冥火之触", "风暴掠袭者", "强攻", "不灭之握", "迅捷步法", "征服者", "丛刃", "灵光披风"}
SPELL |= {"점멸", "텔", "강타", "flash", "Flash", "ghost", "Ghost", "Smite", "Ignite", "Cleanse", "Exhaust", "Barrier", "Heal", "Teleport",
          "闪现", "净化", "虚弱", "疾跑", "点燃", "点然", "屏障", "治疗术", "惩戒", "传送", "幽灵疾步", "召唤师技能"}
GAME = ["바위게", "전령", "억제기", "미니언", "와드 몇", "포탑 방패", "킬 골드", "바론", "드래곤", "장로", "용", "유충", "퀘스트", "공격로",
        "항복", "다시하기", "닷지", "듀오", "티어", "점수", "구매 취소", "경험치", "스킨", "환불",
        "Scuttle", "inhibitor", "Rift Herald", "turret plate", "gold is a kill", "wards can I place", "baron", "Baron", "dragon", "Elder",
        "remake", "ranked", "duo", "shutdown", "ARAM", "aram", "XP", "trade champions", "lifesteal", "omnivamp", "refund", "sell",
        "水晶", "虚空巢虫", "河蟹", "峡谷先锋", "防御塔镀层", "小兵", "大龙", "小龙", "远古龙", "投降", "排位", "胜点", "重开", "退款", "真眼", "皮肤"]
CHAT = ["넌 누구", "잘 자", "망했어", "안녕", "아재개그", "축하", "기분", "good night", "hello", "thanks", "who are you", "yo", "I lost",
        "puns", "pep talk", "name my", "晚安", "嗨", "今天又输了", "你是谁", "谢谢", "夸我", "陪我聊", "你觉得呢", "fun name"]

# 검수: 규칙이 틀리게 가른 것(문항 앞부분 → 갈래)
OVERRIDE = {
    "포탑 방패 언제 챙겨": "item",       # 아이템 "포탑 방패"? — 아래 검수에서 확정
}

def label(q, named):
    low = q.lower()
    has = lambda words: any(w.lower() in low for w in words)
    for k, v in OVERRIDE.items():
        if q.startswith(k): return v
    if has(CHAT): return "chat"
    item = any(n in q for n in ITEMS)
    if has(SPELL) and not item: return "spell"
    if has(RUNE) and not item: return "rune"
    if item: return "item"
    if has(GAME): return "game"
    return None

rows = [json.loads(l) for l in open(sys.argv[1])]
out = []; cnt = collections.Counter(); unk = []
for r in rows:
    k = r["questions"]["kind"]["label"]
    if k != "other":
        out.append(r); continue
    q = re.search(r"Question: (.*)", r["state"]).group(1)
    lab = label(q, "Champions named" in r["state"])
    cnt[lab] += 1
    if lab is None:
        unk.append(q); continue
    r = json.loads(json.dumps(r)); r["questions"]["kind"]["label"] = lab
    r["_q"] = q
    out.append(r)
with open(sys.argv[2], "w") as f:
    for r in out: f.write(json.dumps(r, ensure_ascii=False) + "\n")
print(cnt); print("미분류", len(unk)); [print("  ?", q) for q in unk]
for lab in ("item", "rune", "spell", "game", "chat"):
    print(f"== {lab}")
    for r in out:
        if r["questions"]["kind"]["label"] == lab: print("  ", r["_q"][:90])
