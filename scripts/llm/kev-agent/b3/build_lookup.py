"""대화 흐름 판정에 `lookup`(스킬 수치 조회) 칸을 더한 헤드 학습 자료.

상성 대화 중 "스킬 쿨타임 알려줘" 는 해설(followup)이 아니라 두 챔피언의 수치 표가 답이다. 여섯 칸(followup·more·enemy·mine·flip·new)에는
그 자리가 없어 followup 으로 갔다. 일곱째 칸을 더하고, 쿨타임·마나 낱말이 들어도 공략인 말("궁 빠지면 들어가도 돼?")은 followup 으로 함께
가르친다. 시험 묶음(lookup-test.jsonl)의 문장은 쓰지 않고 같은 유형의 다른 문장을 쓴다. 틀에 넣는 챔피언은 시험 챔피언(HELD)을 뺀다.

기존 act 자료는 선택지 일곱 칸으로 다시 적고(라벨은 그대로), route3·topic 자료는 그대로 섞는다 — 헤드 하나가 세 판정을 모두 맡기 때문이다.

  python3 build_lookup.py <train-dir(act_train.jsonl·route3_train.jsonl·topic-train.jsonl)> <out-dir>
  → head_train.jsonl · head_dev.jsonl · lookup_dev.jsonl
"""
import json, os, random, re, sys

D = "public/data/26.19"
rng = random.Random(20260930)
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)

HELD = {"Yasuo", "Zed", "LeeSin", "Darius", "Teemo", "Garen", "Malphite", "Ahri", "Lux", "Nasus", "MonkeyKing", "Katarina",
        "Rumble", "Aatrox", "Fiora", "Ezreal", "Graves", "Akali", "Viktor"}
NAMES = {}
for lang in ("ko_KR", "en_US", "zh_CN"):
    cards = json.load(open(f"{D}/llm/champion-cards-{lang}.json"))["cards"]
    NAMES[lang] = [c["name"] for c in cards if c["id"] not in HELD]

# ---- 앱과 같은 문구(한 글자도 다르면 안 된다: src/lib/advisor/conversation.ts) ----
ACT_INSTRUCTIONS = "What is the new message?"
def act_criteria(m, e):
    return {
        "followup": f"Asks more about playing {m} against {e}: another topic, a timing or a situation",
        "more": "Wants more detail or the reason behind the last answer",
        "enemy": f"Still plays {m} but now asks about facing a different champion",
        "mine": f"Now plays a different champion against {e}",
        "flip": f"Asks from {e}'s side: how {e} should play against {m}",
        # "another champion's" 가 이 두 챔피언의 수치(lookup)와 겹쳐 헤드가 경계에서 흔들렸다(맨 조회 → new, 룬 쿨타임 → lookup). "a third champion's" 로 가른다.
        "new": "A new question not about this matchup: an item, rune, summoner spell, game rule, a third champion's abilities or numbers, or small talk",
        "lookup": f"Asks for a number about {m}'s or {e}'s ability: a cooldown, mana cost, ratio or range",
    }
def act_state(m, e, msg, named=None):
    s = f"Earlier in this chat the user asked how to play {m} against {e}.\nNew message: {msg}"
    return s + (f"\nChampion named in the new message: {named}" if named else "")

LOOKUP = {
    "ko_KR": ["스킬 쿨타임 알려줘", "둘 쿨타임 정리해줘", "Q 쿨 몇 초?", "W 마나 얼마야", "E 계수 뭐야", "궁 쿨타임 각각 알려줘", "R 사거리 얼마",
              "스킬 코스트 알려줘", "두 챔피언 스킬 계수 비교해줘", "Q W E R 쿨 정리해줘", "둘 궁 재사용 대기시간은?", "W 쿨다운 몇이야",
              "E 마나 소모량 알려줘", "각자 Q 사거리 알려줘", "스킬별 쿨타임 표로 보여줘", "둘 다 R 쿨 몇 초야"],
    "en_US": ["what's the Q cooldown", "how much mana is W", "E ratio?", "ult cooldown for each", "list the cooldowns", "R range?",
              "what do their abilities cost", "compare their ability cooldowns", "cooldown on their ults?", "how long is Q cd",
              "W cd at max rank?", "give me both E cooldowns", "mana cost of Q for both", "what's the AP ratio on W", "show me the cooldowns", "their R cooldowns?"],
    "zh_CN": ["Q冷却几秒", "W耗多少蓝", "E的加成是多少", "两个大招的冷却分别是多少", "技能CD整理一下", "R射程多少", "技能耗蓝告诉我",
              "对比一下两人的技能冷却", "大招CD多久", "Q的CD是多少", "两人的W冷却都说一下", "E耗蓝多少", "W的AP加成", "把冷却时间列出来", "各自的R冷却", "Q射程是多少"],
}
# 쿨타임·마나 낱말이 들어도 공략이다
FOLLOW_CD = {
    "ko_KR": ["상대 궁 빠졌을 때 들어가도 돼?", "Q 쿨 돌 때 뭐 해?", "쿨타임 동안 어떻게 버텨", "마나 아껴야 돼?", "쿨감 먼저 올려?",
              "점멸 없을 때 딜교 해도 돼?", "궁 쿨 도는 동안 라인 어떻게 서", "상대 W 빠지면 붙어도 돼?"],
    "en_US": ["can I go in while his Q is on cooldown?", "what do I do while my ult is down", "should I save mana", "is cdr worth it here",
              "trade when his E is on cd?", "how do I lane while my ult is down", "when his W is down, do I engage?", "should I rush ability haste?"],
    "zh_CN": ["他Q在CD的时候能上吗", "大招没了怎么办", "要省蓝吗", "先出冷却缩减吗", "他E交了能换血吗", "大招CD期间怎么对线", "他W没了能贴上去吗", "技能急速要不要先出"],
}

def pair(lang):
    return rng.sample(NAMES[lang], 2)

rows = []
def add(lang, m, e, msg, label, named=None):
    rows.append({"lang": lang, "state": act_state(m, e, msg, named),
                 "questions": {"act": {"type": "choice", "instructions": ACT_INSTRUCTIONS, "criteria": act_criteria(m, e), "label": label}}})

for lang in ("ko_KR", "en_US", "zh_CN"):
    for t in LOOKUP[lang]:
        for _ in range(9):
            m, e = pair(lang); add(lang, m, e, t, "lookup")
    for t in FOLLOW_CD[lang]:
        for _ in range(9):
            m, e = pair(lang); add(lang, m, e, t, "followup")

# 대조: 다른 챔피언의 수치(이름 있음) · 룬/소환사 주문 쿨타임 · 게임 규칙 · 잡담 → new. 없이 배우면 act 60 이 55 → 49 였다.
OTHER = {"ko_KR": ["{X} 궁 사거리 몇이야", "{X} Q 쿨타임 몇 초?", "{X} W 마나 얼마야", "{X} E 계수 알려줘", "{X} 궁 쿨 몇이야"],
         "en_US": ["{X} r range?", "{X} q cooldown?", "how much mana is {X} w", "{X} e ratio?", "{X} ult cd?"],
         "zh_CN": ["{X}大招距离多少", "{X}的Q冷却几秒", "{X}W耗多少蓝", "{X}E加成多少", "{X}大招CD多少"]}
RUNE = {"ko_KR": ["감전 쿨타임 몇이야", "점화 쿨 얼마야", "점멸 쿨타임 몇 초야", "정복자 쿨 있어?", "텔포 쿨타임 알려줘", "콩콩이 쿨 몇이야"],
        "en_US": ["electrocute cd?", "flash cooldown?", "ignite cooldown how long", "conqueror cooldown?", "teleport cd at level 1?", "aery cooldown?"],
        "zh_CN": ["电刑冷却几秒", "闪现CD多少", "点燃冷却多久", "征服者有冷却吗", "传送CD多少", "彗星冷却几秒"]}
GAME = {"ko_KR": ["몇 분부터 항복 돼?", "닷지하면 LP 얼마 깎여?", "조기 항복은 몇 분?", "전령 몇 분에 나와", "다시하기 언제까지 돼?", "챔피언 가격 얼마야"],
        "en_US": ["when can we surrender?", "how much lp for a dodge", "when does herald spawn", "remake time limit?", "how much BE is a champ", "baron respawn timer?"],
        "zh_CN": ["几分钟可以投降", "秒退扣多少分", "先锋几分钟刷新", "重开有时间限制吗", "英雄多少精粹", "大龙多久刷新"]}
CHAT = {"ko_KR": ["고마워", "감사합니다 덕분이에요", "ㄳㄳ", "오늘 이겼다 고마워", "넌 누구야?", "심심해"],
        "en_US": ["thanks a lot", "gg thanks", "you're the best", "won thanks to you", "who are you?", "i'm bored"],
        "zh_CN": ["谢谢", "感谢感谢", "赢了谢了", "你是谁", "无聊", "太感谢了"]}
contrast = []
for lang in ("ko_KR", "en_US", "zh_CN"):
    for t in OTHER[lang]:
        for _ in range(8):
            m, e = pair(lang); x = rng.choice([n for n in NAMES[lang] if n not in (m, e)])
            contrast.append({"lang": lang, "state": act_state(m, e, t.replace("{X}", x), x), "questions": {"act": {"type": "choice", "instructions": ACT_INSTRUCTIONS, "criteria": act_criteria(m, e), "label": "new"}}})
    for T in (RUNE, GAME, CHAT):
        for t in T[lang]:
            for _ in range(5):
                m, e = pair(lang)
                contrast.append({"lang": lang, "state": act_state(m, e, t), "questions": {"act": {"type": "choice", "instructions": ACT_INSTRUCTIONS, "criteria": act_criteria(m, e), "label": "new"}}})

rng.shuffle(rows)
dev_n = len(rows) // 8
lookup_dev, lookup_train = rows[:dev_n], rows[dev_n:]

def widen(r):
    """기존 act 행의 선택지를 일곱 칸으로. 이름은 followup 문구에서 되찾는다."""
    q = r["questions"]["act"]
    m = re.search(r"Asks more about playing (.*) against (.*): another topic", q["criteria"]["followup"])
    q["criteria"] = act_criteria(m.group(1), m.group(2))
    return r

def read(name):
    return [json.loads(l) for l in open(os.path.join(src, name))]

act_train = [widen(r) for r in read("b3/act_train.jsonl")]
act_dev = [widen(r) for r in read("b3/act_dev.jsonl")]
route3_train = read("b3/route3_train.jsonl")
route3_dev = read("b3/route3_dev.jsonl")
topic = read("topic-train.jsonl")
rng.shuffle(topic)
topic_train, topic_dev = topic[:600], topic[600:660]

train = lookup_train + contrast + act_train + route3_train + topic_train
dev = lookup_dev + act_dev + route3_dev + topic_dev
rng.shuffle(train)
act_only_train = [r for r in train if "act" in r["questions"]]
act_only_dev = [r for r in dev if "act" in r["questions"]]
for name, data in (("head_train", train), ("head_dev", dev), ("lookup_dev", lookup_dev), ("act_train", act_only_train), ("act_dev", act_only_dev)):
    with open(os.path.join(out, f"{name}.jsonl"), "w") as f:
        for r in data: f.write(json.dumps(r, ensure_ascii=False) + "\n")
print(f"lookup {len(rows)} (train {len(lookup_train)} dev {len(lookup_dev)}) · 대조 {len(contrast)} · act {len(act_train)}/{len(act_dev)} · route3 {len(route3_train)}/{len(route3_dev)} · topic {len(topic_train)}/{len(topic_dev)}")
print(f"→ head_train {len(train)} · head_dev {len(dev)}")
