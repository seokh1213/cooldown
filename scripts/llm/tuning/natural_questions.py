"""Manually phrased Korean questions on documents withheld from QA training."""
import hashlib
import json
from pathlib import Path
import random
import sys
from prepare_qa import partition

# Each answer is checked verbatim against the frozen document before export.
QUESTIONS = [
    ("rule:감전", "감전의 세 번째 중첩은 첫 중첩 이후 몇 초 안에 쌓아야 해?", "3초"),
    ("rule:감전", "감전 피해가 터지기 전 지연 시간은?", "0.25초"),
    ("rule:돌발 일격", "돌진하고 나서 돌발 일격 준비 상태가 몇 초 동안 유지돼?", "4초"),
    ("rule:승전보", "승전보가 실제 회복 효과를 주기까지 투사체가 이동하는 시간은?", "1초"),
    ("rule:사전 준비", "사전 준비로 기본 방어력과 기본 마법 저항력이 몇 퍼센트 올라?", "3%"),
    ("rule:신비로운 유성", "신비로운 유성 낙하 지점 표시의 반경 수치는?", "175"),
    ("rule:기민함", "기민함이 다른 고정 이동 속도 합계 중 몇 퍼센트만큼을 추가로 줘?", "7%"),
    ("rule:강타", "강타 충전이 추가되는 주기는 몇 초야?", "90초"),
    ("rule:강타", "강타를 쓰려고 할 때 커서에 유효한 대상이 없으면 몇 반경 내 대형 몬스터를 찾아?", "125"),
    ("rule:포탑", "자료에서 포탑 방패 하나를 깨면 아군에게 지급하는 골드는?", "125골드"),
    ("rule:포탑", "포탑 방패 장치는 원거리 챔피언과 미니언의 피해를 몇 퍼센트 줄여?", "17%"),
    ("mech:smite-rebirth", "수호천사 부활 동안 강타에 걸리는 대기시간은 몇 초야?", "4초"),
    ("meta:baron", "바론은 처음 몇 분에 등장해?", "20분"),
    ("meta:baron", "바론을 처치한 뒤 다음 바론까지 몇 분 기다려?", "6분"),
    ("meta:baron", "바론 버프 지속시간을 초 단위로 알려줘.", "180초"),
    ("meta:plating", "포탑 방패 자료에서 방패 한 장당 주는 골드는?", "120골드"),
    ("meta:dodge", "일반적인 대기열에서 첫 닷지 시간 제한은 몇 분이야?", "6분"),
    ("meta:dodge", "두 번째 닷지의 대기열 시간 제한은?", "30분"),
    ("meta:dodge", "세 번째부터 닷지 대기시간은 몇 분이야?", "720분"),
    ("meta:dodge", "칼바람 나락에서 첫 닷지 시간 제한은 몇 분이야?", "15분"),
    ("meta:ping-limit", "일반 핑은 3번까지 쓸 수 있다고 할 때 그 기준 시간은 몇 초야?", "6초"),
    ("meta:death-timer", "소환사의 협곡 1레벨 부활 시간은?", "10초"),
    ("meta:death-timer", "18레벨의 기본 부활 시간은?", "52.5초"),
    ("meta:death-timer", "게임 시간에 따른 추가 부활 시간은 몇 분부터 붙어?", "15분"),
]


def main(directory):
    directory = Path(directory)
    docs = {doc["id"]: doc for doc in json.loads((directory / "corpus-ko_KR.json").read_text())}
    rows = []
    for doc_id, question, answer in QUESTIONS:
        doc = docs[doc_id]
        if partition(doc_id) != "test" or answer not in doc["text"]:
            raise ValueError("Natural QA annotation is not held-out or verbatim")
        sentence = next(line for line in doc["text"].splitlines() if answer in line)
        rows.append({"id": hashlib.sha256(question.encode()).hexdigest()[:16], "lang": "ko_KR",
                     "docId": doc_id, "question": question, "answer": answer, "answerable": True,
                     "context": doc["title"] + "\n" + doc["text"], "sourceSentence": sentence})
    rng = random.Random(20261005)
    negatives = [doc for id, doc in docs.items() if partition(id) == "test"]
    for row in rows[::2].copy():
        doc = rng.choice([doc for doc in negatives if doc["id"] != row["docId"]])
        rows.append({**row, "id": row["id"] + "-absent", "contextDocId": doc["id"], "answerable": False,
                     "context": doc["title"] + "\n" + doc["text"], "answer": "NOT_FOUND"})
    (directory / "qa-natural-test.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows))
    print("Natural Korean numeric QA:", len(rows), "held-out cases")


if __name__ == "__main__": main(sys.argv[1])
