"""대화 흐름 시험 — 손으로 쓴 문항(2026-09-25). 학습 틀(build_b3.py)과 말투를 다르게, 챔피언은 학습에서 뺀 시험 챔피언만.

한 줄: (언어, 내 챔피언, 상대, 새 말, 정답, 새 말에 나온 챔피언 id 또는 None)
  python3 act_test.py > research/llm-evals/kev-agent/act-test.jsonl
"""
import json

T = [
    # ---- 한국어 ----
    ("ko_KR", "Garen", "Darius", "근데 템트리는 어떻게 가져가?", "followup", None),
    ("ko_KR", "Garen", "Darius", "레벨 6 찍고 나서는 달라져?", "followup", None),
    ("ko_KR", "Ahri", "Zed", "정글이 자꾸 미드로 오는데 그럴 땐?", "followup", None),
    ("ko_KR", "Ahri", "Zed", "궁극기 언제 아껴야 해", "followup", None),
    ("ko_KR", "Fiora", "Teemo", "음 그건 왜 그런 거야?", "more", None),
    ("ko_KR", "Fiora", "Teemo", "방금 말한 거 좀 풀어서 설명해줄래", "more", None),
    ("ko_KR", "Nasus", "Aatrox", "만약 상대가 다리우스면?", "enemy", "Darius"),
    ("ko_KR", "Lux", "Katarina", "야스오 만나면 어떻게 해야 돼", "enemy", "Yasuo"),
    ("ko_KR", "Malphite", "Rumble", "오공으로 하면 좀 나아?", "mine", "MonkeyKing"),
    ("ko_KR", "Ezreal", "Graves", "차라리 럭스로 가면 어때", "mine", "Lux"),
    ("ko_KR", "Garen", "Darius", "다리우스 하는 쪽은 어떻게 해야 돼?", "flip", "Darius"),
    ("ko_KR", "Akali", "Viktor", "거꾸로 내가 빅토르면?", "flip", "Viktor"),
    ("ko_KR", "Garen", "Darius", "항복은 몇 분부터 칠 수 있어?", "new", None),
    ("ko_KR", "Ahri", "Zed", "챔피언 하나 사려면 정수 얼마나 들어?", "new", None),
    ("ko_KR", "Ahri", "Zed", "첫 바론 몇 분이더라", "new", None),
    ("ko_KR", "Fiora", "Teemo", "리신 궁 사거리 몇이야", "new", "LeeSin"),
    ("ko_KR", "Fiora", "Teemo", "감전 룬 쿨타임 몇 초야", "new", None),
    ("ko_KR", "Nasus", "Aatrox", "고마워 덕분에 이겼다", "new", None),
    ("ko_KR", "Lux", "Katarina", "점멸 대신 방어막 들어도 돼?", "followup", None),
    ("ko_KR", "Malphite", "Rumble", "랭겜 닷지하면 LP 얼마나 까여?", "new", None),
    # ---- English ----
    ("en_US", "Garen", "Darius", "ok and what do i build into that", "followup", None),
    ("en_US", "Garen", "Darius", "does it change once he hits 6?", "followup", None),
    ("en_US", "Ahri", "Zed", "their jungler keeps camping mid, then what", "followup", None),
    ("en_US", "Ahri", "Zed", "should i hold my ult for something", "followup", None),
    ("en_US", "Fiora", "Teemo", "wait why is that", "more", None),
    ("en_US", "Fiora", "Teemo", "could you break that down a bit more", "more", None),
    ("en_US", "Nasus", "Aatrox", "and if it's darius instead?", "enemy", "Darius"),
    ("en_US", "Lux", "Katarina", "what do i do when i get yasuo", "enemy", "Yasuo"),
    ("en_US", "Malphite", "Rumble", "would wukong do better here?", "mine", "MonkeyKing"),
    ("en_US", "Ezreal", "Graves", "maybe i should just go lux, thoughts?", "mine", "Lux"),
    ("en_US", "Garen", "Darius", "what's the plan for the darius player?", "flip", "Darius"),
    ("en_US", "Akali", "Viktor", "flip it, i'm the viktor now", "flip", "Viktor"),
    ("en_US", "Garen", "Darius", "what minute can we ff?", "new", None),
    ("en_US", "Ahri", "Zed", "how much BE does a new champ cost", "new", None),
    ("en_US", "Ahri", "Zed", "when's first baron again", "new", None),
    ("en_US", "Fiora", "Teemo", "lee sin r range?", "new", "LeeSin"),
    ("en_US", "Fiora", "Teemo", "electrocute cooldown?", "new", None),
    ("en_US", "Nasus", "Aatrox", "thanks, won that one", "new", None),
    ("en_US", "Lux", "Katarina", "can i run barrier instead of flash?", "followup", None),
    ("en_US", "Malphite", "Rumble", "how much LP do you lose for dodging", "new", None),
    # ---- 中文 ----
    ("zh_CN", "Garen", "Darius", "那出装思路是什么", "followup", None),
    ("zh_CN", "Garen", "Darius", "他到六级以后还一样吗", "followup", None),
    ("zh_CN", "Ahri", "Zed", "打野老来中路抓我怎么办", "followup", None),
    ("zh_CN", "Ahri", "Zed", "大招要留着干嘛", "followup", None),
    ("zh_CN", "Fiora", "Teemo", "这是为啥啊", "more", None),
    ("zh_CN", "Fiora", "Teemo", "你刚说的能再讲细一点吗", "more", None),
    ("zh_CN", "Nasus", "Aatrox", "要是对面换成诺手呢", "enemy", "Darius"),
    ("zh_CN", "Lux", "Katarina", "遇到亚索该怎么打", "enemy", "Yasuo"),
    ("zh_CN", "Malphite", "Rumble", "用猴子会不会好一点", "mine", "MonkeyKing"),
    ("zh_CN", "Ezreal", "Graves", "我干脆玩光辉算了，你觉得呢", "mine", "Lux"),
    ("zh_CN", "Garen", "Darius", "诺手那一方该怎么玩", "flip", "Darius"),
    ("zh_CN", "Akali", "Viktor", "反过来我玩维克托呢", "flip", "Viktor"),
    ("zh_CN", "Garen", "Darius", "几分钟能投降啊", "new", None),
    ("zh_CN", "Ahri", "Zed", "买一个新英雄要多少蓝色精粹", "new", None),
    ("zh_CN", "Ahri", "Zed", "第一条大龙几分钟来着", "new", None),
    ("zh_CN", "Fiora", "Teemo", "盲僧大招距离多少", "new", "LeeSin"),
    ("zh_CN", "Fiora", "Teemo", "电刑冷却几秒", "new", None),
    ("zh_CN", "Nasus", "Aatrox", "谢了，这把赢了", "new", None),
    ("zh_CN", "Lux", "Katarina", "不带闪现带屏障行吗", "followup", None),
    ("zh_CN", "Malphite", "Rumble", "排位秒退扣多少胜点", "new", None),
]
for lang, m, e, msg, label, named in T:
    print(json.dumps({"lang": lang, "mine": m, "enemy": e, "text": msg, "act": label, "named": named}, ensure_ascii=False))
