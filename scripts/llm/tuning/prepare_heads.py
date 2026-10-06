"""Synthetic classification data; dev names and templates are kept separate."""
import json
from pathlib import Path
import random

ROUTE = {
    "ko_KR": {
        "matchup": ["{M}로 {E} 상대하는 운영 알려줘", "내 챔피언 {M}, 적 {E}일 때 싸움 요령", "{E}를 {M}로 상대할 때 승리 전략은?"],
        "guide": ["{M} 플레이 기본 요령 정리해줘", "{M} 처음 하는데 운영을 배워볼래", "{M} 숙련도를 올리는 팁은?"],
        "skills": ["{M} 스킬 구성을 설명해 줘", "{M} 패시브와 네 개 스킬 효과 소개", "{M} 능력 설명이 궁금해"],
        "spellStat": ["{M} Q 재사용 대기시간 수치 알려줘", "{M} R의 사거리와 마나 수치가 궁금해", "{M} E 쿨다운 값만 보여줘"],
        "item": ["가시 갑옷 능력치와 가격을 정리해줘", "라바돈의 죽음모자 효과 설명 부탁해", "무한의 대검 구매 비용 알려줘"],
        "rune": ["정복자 룬 발동 조건 설명 부탁해", "감전 룬 효과가 어떻게 적용되는지 설명해", "치명적 속도 룬의 지속 효과 궁금해"],
        "spell": ["점멸 소환사 주문 사거리 알려줘", "점화 소환사 주문 효과 정리 부탁해", "탈진 소환사 주문 지속시간은?"],
        "game": ["첫 바론 생성 시간이 궁금해", "게임에서 다시하기가 가능한 조건 정리해줘", "포탑 방패는 언제 없어지는지 알려줘"],
        "chat": ["오늘 하루 어땠니", "너 덕분에 기분이 나아졌어", "나는 지금 좀 졸려"],
    },
    "en_US": {
        "matchup": ["I'm playing {M}, explain how to beat {E}", "Teach me the matchup as {M} versus {E}", "Any winning strategy for {M} into {E}?"],
        "guide": ["Give me practical advice for playing {M}", "I want to learn the basics of {M}", "What should a new {M} player know?"],
        "skills": ["Describe all four abilities of {M}", "Explain the passive and abilities on {M}", "What does each skill on {M} do?"],
        "spellStat": ["Show the cooldown value for {M} Q", "I need the mana cost and range of {M} R", "What is the numeric cooldown for {M} E?"],
        "item": ["Explain Thornmail stats and price", "What is the effect of Rabadon's Deathcap?", "How much does Infinity Edge cost?"],
        "rune": ["Describe the activation conditions of Conqueror rune", "How does the Electrocute rune work?", "Explain the Lethal Tempo rune effect"],
        "spell": ["Give me the Flash summoner spell range", "Explain the Ignite summoner spell effect", "How long does the Exhaust summoner spell last?"],
        "game": ["What time is the first Baron spawn?", "Explain the requirements for remaking a game", "When does turret plating disappear?"],
        "chat": ["How has your day been going?", "You've cheered me up today", "I'm feeling sleepy right now"],
    },
    "zh_CN": {
        "matchup": ["我玩{M}，教我怎么赢{E}", "用{M}对线{E}的打法教一下", "{M}打{E}有什么取胜思路?"],
        "guide": ["教我{M}的基本玩法", "我想学习{M}的入门操作", "刚玩{M}有什么建议?"],
        "skills": ["介绍{M}的四个技能效果", "讲解{M}被动和技能", "{M}的每个技能是干什么的?"],
        "spellStat": ["告诉我{M}Q的冷却数值", "我想看{M}大招的蓝耗和距离", "{M}E的具体冷却值是多少?"],
        "item": ["说明荆棘之甲的属性与价格", "介绍灭世者的死亡之帽的效果", "无尽之刃需要多少金币?"],
        "rune": ["解释征服者符文触发条件", "电刑符文效果如何生效?", "致命节奏符文有什么效果?"],
        "spell": ["闪现召唤师技能距离是多少", "介绍点燃召唤师技能效果", "虚弱召唤师技能持续多久?"],
        "game": ["第一条大龙什么时候出现?", "游戏重开需要满足哪些条件?", "防御塔镀层何时消失?"],
        "chat": ["今天过得怎么样呀", "你让我的心情变好了", "现在感觉有点困了"],
    },
}

ACT = {
    "ko_KR": {
        "followup": ["상대가 먼저 귀환하면 라인 관리는?", "그 싸움에서 갱을 피하려면 어떻게 해야 해?", "상대 스킬이 빠진 순간에 싸워도 돼?"],
        "more": ["앞선 설명을 조금 더 풀어줘", "방금 추천한 이유도 설명 부탁해", "마지막 답의 구체적인 예가 궁금해"],
        "enemy": ["상대가 {X}로 바뀌면 어떻게 해?", "다음 상대는 {X}인데 팁 좀", "{X} 적 만나면 운영은?"],
        "mine": ["이제 나는 {X}를 선택했어", "내 챔피언만 {X}로 바꾸면 어때", "{X}를 내가 할 경우의 공략 부탁해"],
        "flip": ["{E} 시점에서 이 매치업 설명해줘", "{E}로 {M}와 싸우는 쪽을 알려줘", "역으로 {E}를 조종하면?"],
        "new": ["점화 소환사 주문의 쿨다운이 궁금해", "포탑 방패가 사라지는 시점 정리 부탁해", "{X} Q의 재사용 대기시간을 알려줘"],
        "lookup": ["두 챔피언 Q의 기본 쿨다운을 표로 줘", "각각 궁극기 마나 소모 수치를 비교해 줘", "양쪽 E의 사거리 수치만 정리해 줘"],
    },
    "en_US": {
        "followup": ["How do I manage the wave if they recall first?", "How do I avoid a gank in this matchup?", "Should I fight right after their ability is used?"],
        "more": ["Expand on your previous explanation", "Explain the reason for that recommendation", "Give a concrete example of your last answer"],
        "enemy": ["My next opponent is {X}, any advice?", "What if the enemy changes to {X}?", "Facing {X} instead, how should I play?"],
        "mine": ["I've now chosen {X} as my champion", "Only my champion changes to {X}", "Explain it with me playing {X}"],
        "flip": ["Explain this matchup from {E}'s perspective", "How should {E} fight {M}?", "Reverse the roles with me controlling {E}"],
        "new": ["I need the Ignite summoner spell cooldown", "Explain when turret plates fall", "Give me the cooldown value of {X} Q"],
        "lookup": ["Put both champions' Q cooldowns in a table", "Compare their ultimate mana costs", "List the numeric ranges of both E abilities"],
    },
    "zh_CN": {
        "followup": ["对方先回城的话怎么控线?", "这个对局如何避免被抓?", "对方技能刚交能打吗?"],
        "more": ["把之前的解释展开说说", "说明刚才推荐的原因", "上一条建议的具体例子是什么?"],
        "enemy": ["下个对手变成{X}有什么建议?", "敌人换成{X}会怎样?", "碰到敌方{X}怎么运营?"],
        "mine": ["现在我选了{X}", "只把我的英雄换成{X}", "我使用{X}的话给个攻略"],
        "flip": ["从{E}的角度解释这个对局", "{E}该如何打{M}?", "反过来我控制{E}呢?"],
        "new": ["想知道点燃召唤师技能冷却", "说明防御塔镀层消失的时间", "告诉我{X}Q的冷却数值"],
        "lookup": ["把双方Q技能冷却列成表", "比较两人的大招耗蓝数值", "列出双方E技能的距离数值"],
    },
}


def make_row(schema, lang, family, sample):
    label, frame, m, e, x = sample
    text = frame.format(M=m, E=e, X=x)
    if family == "kind":
        state = f"Question: {text}" + (f"\nChampions named: {m}, {e}" if label == "matchup" else f"\nChampions named: {m}" if "{M}" in frame else "")
        questions = {"kind": {**schema["kind"], "label": label}}
        if label == "matchup":
            questions["mine"] = {"instructions": schema["mineInstructions"], "criteria": {m: None, e: None}, "label": m}
    else:
        state = f"Earlier in this chat the user asked how to play {m} against {e}.\nNew message: {text}"
        if "{X}" in frame: state += f"\nChampion named in the new message: {x}"
        criteria = {key: value.format(M=m, E=e) for key, value in schema["act"].items()}
        questions = {"act": {"instructions": schema["actInstructions"], "criteria": criteria, "label": label}}
    return {"lang": lang, "state": state, "questions": questions}


def build_rows(schema, split):
    rng = random.Random(20261005)
    rows = []
    for lang, champions in schema["champions"].items():
        names = [c["name"] for i, c in enumerate(champions) if (i % 5 == 0) == (split == "dev")]
        for family, templates in [("kind", ROUTE[lang]), ("act", ACT[lang])]:
            for label, frames in templates.items():
                for _ in range(12 if split == "train" else 3):
                    m, e, x = rng.sample(names, 3)
                    frame = rng.choice(frames[:2]) if split == "train" else frames[2]
                    rows.append(make_row(schema, lang, family, (label, frame, m, e, x)))
    # Constant non-champion templates occur only once, never repeated to inflate weight.
    return list({json.dumps(r, sort_keys=True, ensure_ascii=False): r for r in rows}.values())


def main(directory):
    directory = Path(directory); schema = json.loads((directory / "schema.json").read_text())
    topic = [json.loads(line) for line in (directory / "topic-all.jsonl").read_text().splitlines()]
    for split in ["train", "dev"]:
        rows = build_rows(schema, split)
        # Topic builder already excludes held-out test champions; reserve distinct states for dev.
        seen = set(); topics = []
        for row in topic:
            if row["state"] in seen: continue
            seen.add(row["state"])
            partition = int(__import__("hashlib").sha256(row["state"].encode()).hexdigest()[:8], 16) % 5
            if (partition == 0) == (split == "dev"): topics.append(row)
        rows.extend(topics[:360 if split == "train" else 80])
        random.Random(20261005).shuffle(rows)
        (directory / f"head-{split}.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows))
        print(f"Head {split}: {len(rows)} rows")


if __name__ == "__main__":
    import sys
    main(sys.argv[1])
