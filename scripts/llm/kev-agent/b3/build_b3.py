"""B3 학습 자료 — 질문 갈래를 더 잘게(route3), 대화 흐름(act) 판정. 모두 코드 틀 문장이라 토큰이 들지 않는다.

  route3  기존 route-train 1,449 에서 "그 밖" 258 을 사람이 붙인 갈래(item·rune·spell·game·chat)로 바꾸고,
          게임 메타 틀 문장(챔피언 가격·항복·오브젝트·랭크·스킨 …)을 더한다
  act     "앞에서 M 으로 E 상대법을 물었다" 뒤의 새 말이 무엇인가: followup·more·enemy·mine·flip·new

시험 세트(route-large, topicCases, a-set)의 문장은 쓰지 않는다. 틀에 넣는 챔피언은 topicCases 시험 챔피언을 뺀다.

  python3 build_b3.py <route-train-v1v2.jsonl> <out-dir>
  → route3_train.jsonl · act_train.jsonl · act_dev.jsonl · route3_dev.jsonl
"""
import json, os, random, re, sys

sys.path.insert(0, os.path.dirname(__file__))
from other_labels import LABELS  # noqa: E402

D = "public/data/26.19"
rng = random.Random(20260925)
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)

HELD = {"Yasuo", "Zed", "LeeSin", "Darius", "Teemo", "Garen", "Malphite", "Ahri", "Lux", "Nasus", "MonkeyKing", "Katarina",
        "Rumble", "Aatrox", "Fiora", "Ezreal", "Graves", "Akali", "Viktor"}
NAMES = {}
for lang in ("ko_KR", "en_US", "zh_CN"):
    cards = json.load(open(f"{D}/llm/champion-cards-{lang}.json"))["cards"]
    NAMES[lang] = [c["name"] for c in cards if c["id"] not in HELD]

# ---- 앱과 같은 문구(한 글자도 다르면 안 된다: src/lib/advisor/routeAsk.ts 를 따라 고칠 것) ----
KIND_INSTRUCTIONS = "What is this League of Legends question asking for?"
KIND3 = {
    "matchup": "The user plays one named champion against another named champion (two champions named)",
    "guide": "How to beat or handle one champion, without saying which champion the user plays",
    "skills": "What a champion's abilities are; an overview of the kit",
    "spellStat": "One number about one champion ability: cooldown, cost, ratio, damage or range",
    "item": "Items: what to buy, what an item does, its price or who builds it",
    "rune": "Runes: which to take, what a rune does or how it works",
    "spell": "Summoner spells such as Flash, Ignite, Smite, Teleport: when to take them, cooldown, how they work",
    "game": "Game rules and meta: objectives and their timers, gold, surrender, remake, ranked and dodging, champion or skin prices, the client",
    "chat": "Greetings, thanks, feelings or small talk, not a game question",
}
MINE_INSTRUCTIONS = "Which champion does the user play? (The other one is the opponent.)"

ACT_INSTRUCTIONS = "What is the new message?"
def act_criteria(m, e):
    return {
        "followup": f"Asks more about playing {m} against {e}: another topic, a timing or a situation",
        "more": "Wants more detail or the reason behind the last answer",
        "enemy": f"Still plays {m} but now asks about facing a different champion",
        "mine": f"Now plays a different champion against {e}",
        "flip": f"Asks from {e}'s side: how {e} should play against {m}",
        "new": "A new question not about this matchup: an item, rune, summoner spell, game rule, another champion's abilities or numbers, or small talk",
    }
def act_state(m, e, msg, named=None):
    s = f"Earlier in this chat the user asked how to play {m} against {e}.\nNew message: {msg}"
    return s + (f"\nChampion named in the new message: {named}" if named else "")

def kind_state(q, names):
    return f"Question: {q}\nChampions named: {', '.join(names)}" if names else f"Question: {q}"

# ---- route3 ------------------------------------------------------------------------
rows = [json.loads(l) for l in open(src)]
route3 = []
oi = 0
for r in rows:
    q = r["questions"]["kind"]
    lab = q["label"]
    if lab == "other":
        lab = LABELS[oi]; oi += 1
    new = {"lang": r.get("lang"), "state": r["state"], "questions": {"kind": {"type": "choice", "instructions": KIND_INSTRUCTIONS, "criteria": KIND3, "label": lab}}}
    if "mine" in r["questions"]:
        new["questions"]["mine"] = r["questions"]["mine"]
    route3.append(new)
assert oi == 258

GAME_T = {
    "ko_KR": ["챔피언 가격 얼마야?", "{C} 가격 얼마야?", "{C} 블루 정수로 얼마예요?", "항복 몇 분부터 돼?", "항복 투표 몇 명 찬성해야 돼?", "조기 항복 조건이 뭐야?",
              "바론 몇 분에 나와?", "첫 드래곤 언제 나와?", "드래곤 영혼은 몇 마리 먹어야 돼?", "장로 드래곤 버프 뭐야?", "공허 유충 몇 분에 나와?",
              "포탑 방패 몇 분에 없어져?", "다시하기 조건이 뭐야?", "랭크 닷지하면 페널티 있어?", "승급전 규칙 알려줘", "듀오 티어 제한 있어?",
              "{C} 스킨 뭐 있어?", "{C} 스킨 추천해줘", "킬 관여 골드 얼마야?", "현상금 골드는 어떻게 계산돼?", "미니언 웨이브 몇 초마다 와?", "억제기 재생 시간 몇 분이야?"],
    "en_US": ["how much do champions cost?", "how much is {C}?", "{C} blue essence price?", "when can we surrender?", "how many votes to surrender?", "early surrender rules?",
              "when does baron spawn?", "first dragon spawn time?", "how many drakes for soul?", "what does elder dragon do?", "when do voidgrubs spawn?",
              "when does turret plating fall off?", "what are the remake rules?", "is there a penalty for dodging ranked?", "how do promos work?", "duo rank restrictions?",
              "what skins does {C} have?", "best {C} skin?", "how much gold for an assist?", "how are bounties calculated?", "how often do minion waves spawn?", "inhibitor respawn time?"],
    "zh_CN": ["英雄多少钱?", "{C}多少钱?", "{C}要多少蓝色精粹?", "几分钟可以投降?", "投降要几票?", "提前投降的条件是什么?",
              "大龙几分钟刷新?", "第一条小龙什么时候刷?", "几条龙拿龙魂?", "远古龙buff是什么?", "虚空巢虫几分钟出?",
              "防御塔镀层几分钟消失?", "重开的条件是什么?", "排位秒退有惩罚吗?", "晋级赛规则是什么?", "双排有段位限制吗?",
              "{C}有哪些皮肤?", "{C}哪个皮肤好看?", "助攻多少钱?", "赏金怎么算?", "兵线多久刷一波?", "水晶多久重生?"],
}
CHAT_T = {
    "ko_KR": ["고마워", "ㅎㅇ", "오늘 너무 졌다", "심심해", "너 이름 뭐야?", "재밌는 얘기 해줘"],
    "en_US": ["thanks!", "hey there", "rough day of games", "i'm bored", "what's your name?", "tell me something fun"],
    "zh_CN": ["谢谢", "你好呀", "今天输麻了", "好无聊", "你叫什么?", "讲个笑话"],
}
for lang, ts in GAME_T.items():
    for t in ts:
        for _ in range(2 if "{C}" in t else 1):
            c = rng.choice(NAMES[lang])
            q = t.format(C=c)
            route3.append({"lang": lang, "state": kind_state(q, [c] if "{C}" in t else []),
                           "questions": {"kind": {"type": "choice", "instructions": KIND_INSTRUCTIONS, "criteria": KIND3, "label": "game"}}})
    for t in CHAT_T[lang]:
        route3.append({"lang": lang, "state": kind_state(t, []), "questions": {"kind": {"type": "choice", "instructions": KIND_INSTRUCTIONS, "criteria": KIND3, "label": "chat"}}})

# ---- act ---------------------------------------------------------------------------
FOLLOW = {
    "ko_KR": ["그럼 아이템은?", "템은 뭐 가?", "라인전은 어떻게 해?", "한타 때는?", "콤보는?", "언제 들어가?", "후반엔 어때?", "6렙 이후엔?", "내가 뒤처지면?",
              "갱 오면 어떻게 해?", "초반엔?", "딜교는 언제 해?", "방어템 뭐 올려?", "궁 언제 써?", "누가 더 세?", "몇 렙부터 이겨?", "앞서 있으면?", "라인 어디 서?"],
    "en_US": ["what about items?", "what should i build?", "how do i lane?", "and teamfights?", "combo?", "when do i go in?", "late game?", "after 6?",
              "what if i'm behind?", "what if their jungler ganks?", "early game?", "when should i trade?", "which defensive item?", "when do i ult?",
              "who's stronger?", "at what level do i win?", "what if i'm ahead?", "where should i stand in lane?"],
    "zh_CN": ["那出装呢?", "出什么装备?", "对线怎么打?", "团战呢?", "连招呢?", "什么时候进场?", "后期呢?", "六级以后呢?", "我落后了怎么办?",
              "被抓怎么办?", "前期呢?", "什么时候换血?", "出什么防装?", "大招什么时候放?", "谁更强?", "几级能打过?", "领先了怎么打?", "对线站哪里?"],
}
MORE = {
    "ko_KR": ["왜?", "더 자세히", "이유가 뭐야?", "좀 더 알려줘", "그게 무슨 말이야?", "자세히 설명해줘"],
    "en_US": ["why?", "tell me more", "can you explain that?", "more detail please", "what do you mean?", "go deeper"],
    "zh_CN": ["为什么?", "详细说说", "再多讲点", "什么意思?", "展开讲讲", "具体点"],
}
ENEMY = {
    "ko_KR": ["{X}는?", "{X} 상대로는?", "그럼 {X} 만나면?", "{X}면 어때?", "{X} 어떻게 상대해?", "{X}한테는 어떻게 해?"],
    "en_US": ["what about {X}?", "and against {X}?", "if i face {X} instead?", "how about {X}?", "how do i deal with {X}?", "vs {X}?"],
    "zh_CN": ["那{X}呢?", "对{X}呢?", "换成{X}呢?", "碰到{X}怎么办?", "{X}怎么打?", "打{X}呢?"],
}
MINE = {
    "ko_KR": ["나 {Y}로 바꿨어", "{Y}로 하면?", "{Y}면 어떻게 해?", "{Y}로 상대하면?", "내가 {Y} 하면?", "{Y}로는 어때?"],
    "en_US": ["what if i play {Y}?", "i switched to {Y}", "as {Y} instead?", "how about playing {Y}?", "if i pick {Y}?", "what about with {Y}?"],
    "zh_CN": ["我换成{Y}呢?", "用{Y}打呢?", "如果我玩{Y}?", "我拿{Y}怎么打?", "换{Y}呢?", "{Y}打得过吗?"],
}
FLIP = {
    "ko_KR": ["{E} 입장에서는?", "반대로 {E}로 {M} 상대하면?", "상대 입장이면?", "내가 {E}면?", "{E}는 어떻게 해야 돼?", "반대 입장도 알려줘"],
    "en_US": ["from {E}'s side?", "what if i'm the {E}?", "reverse it", "how should {E} play this?", "and the other way around?", "if i'm on {E}?"],
    "zh_CN": ["{E}那边怎么打?", "反过来呢?", "如果我是{E}?", "{E}应该怎么打{M}?", "换个角度呢?", "我玩{E}的话?"],
}
SKILLQ = {
    "ko_KR": ["{X} 스킬 설명해줘", "{X} Q 쿨타임 몇 초야?", "{X} 궁 사거리 얼마야?", "{X} 패시브 뭐야?"],
    "en_US": ["explain {X}'s abilities", "{X} q cooldown?", "what's {X} ult range?", "what does {X} passive do?"],
    "zh_CN": ["介绍一下{X}的技能", "{X}的Q冷却多少?", "{X}大招距离多少?", "{X}被动是什么?"],
}

def batchim(word):
    ch = word[-1]
    if not ("가" <= ch <= "힣"): return None
    return (ord(ch) - 0xAC00) % 28

def fill(t, **names):
    """틀에 이름을 넣고 한국어 조사를 받침에 맞춘다: {X}는/{X}면/{X}로 → 은·는 / 이면·면 / 으로·로."""
    for key, name in names.items():
        b = batchim(name)
        def repl(m):
            j = m.group(1)
            if b is None: return name + j
            if j == "는": return name + ("은" if b else "는")
            if j == "면": return name + ("이면" if b else "면")
            if j == "로": return name + ("으로" if b and b != 8 else "로")
            return name + j
        t = re.sub(r"\{" + key + r"\}(는|면|로)?", lambda m: repl(m) if m.group(1) else name, t)
    return t

def pair(lang):
    m, e = rng.sample(NAMES[lang], 2)
    return m, e

act = []
def add(lang, m, e, msg, label, named=None):
    act.append({"lang": lang, "state": act_state(m, e, msg, named),
                "questions": {"act": {"type": "choice", "instructions": ACT_INSTRUCTIONS, "criteria": act_criteria(m, e), "label": label}}})

new_pool = {l: [] for l in ("ko_KR", "en_US", "zh_CN")}
for r in route3:
    if r["questions"]["kind"]["label"] in ("item", "rune", "spell", "game", "chat") and "Champions named" not in r["state"]:
        q = re.search(r"Question: (.*)", r["state"]).group(1)
        lang = r.get("lang") or ("ko_KR" if re.search(r"[가-힣]", q) else "zh_CN" if re.search(r"[一-鿿]", q) else "en_US")
        new_pool[lang].append(q)

for lang in ("ko_KR", "en_US", "zh_CN"):
    for t in FOLLOW[lang]:
        for _ in range(12):
            m, e = pair(lang); add(lang, m, e, t, "followup")
    for t in MORE[lang]:
        for _ in range(10):
            m, e = pair(lang); add(lang, m, e, t, "more")
    for t in ENEMY[lang]:
        for _ in range(18):
            m, e = pair(lang); x = rng.choice([n for n in NAMES[lang] if n not in (m, e)])
            add(lang, m, e, fill(t, X=x), "enemy", x)
    for t in MINE[lang]:
        for _ in range(18):
            m, e = pair(lang); y = rng.choice([n for n in NAMES[lang] if n not in (m, e)])
            add(lang, m, e, fill(t, Y=y), "mine", y)
    for t in FLIP[lang]:
        for _ in range(16):
            m, e = pair(lang); add(lang, m, e, fill(t, E=e, M=m), "flip", e if "{E}" in t else None)
    for t in SKILLQ[lang]:
        for _ in range(15):
            m, e = pair(lang); x = rng.choice([n for n in NAMES[lang] if n not in (m, e)])
            add(lang, m, e, fill(t, X=x), "new", x)
    for q in new_pool[lang]:
        m, e = pair(lang); add(lang, m, e, q, "new")

def split(rs, name):
    rng.shuffle(rs)
    dev = rs[: max(60, len(rs) // 10)]
    train = rs[len(dev):]
    for part, data in (("train", train), ("dev", dev)):
        with open(os.path.join(out, f"{name}_{part}.jsonl"), "w") as f:
            for r in data: f.write(json.dumps(r, ensure_ascii=False) + "\n")
    import collections
    q = next(iter(rs[0]["questions"]))
    print(name, len(train), len(dev), collections.Counter(r["questions"][q]["label"] for r in rs))

split(route3, "route3")
split(act, "act")
