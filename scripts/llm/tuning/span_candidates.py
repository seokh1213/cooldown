"""Rank complete numeric spans with question and local evidence, without gold at inference."""
import re
import math
from sft_scoring import SPAN


def grams(text):
    text = re.sub(r"[^가-힣a-z]", "", text.lower())
    return {text[i:i+n] for n in (1, 2, 3) for i in range(len(text)-n+1)}


def candidates(context, question):
    result = []
    query = grams(question)
    for line_index, line in enumerate(context.splitlines()):
        for match in SPAN.finditer(line):
            answer = match.group().strip()
            window = line[max(0, match.start()-55):match.end()+55]
            local, sentence = grams(window), grams(line)
            overlap = query & local
            unit = re.sub(r"[-+\d.\s~–]", "", answer)
            features = {f"common:{word}": 1 for word in overlap}
            features.update({f"unit:{unit}:q:{word}": 1 for word in query})
            features.update({f"unit:{unit}:local:{word}": 1 for word in local})
            features.update(overlap=len(overlap)/max(1,len(query)), sentence_overlap=len(query & sentence)/max(1,len(query)),
                            length=math.log1p(len(line)), position=match.start()/max(1,len(line)),
                            line=1/(line_index+1), numbers=sum(1 for _ in SPAN.finditer(line))/10)
            result.append({"answer": answer, "features": features, "sentence": line, "lexical": features["overlap"]})
    return result


def choose(entries, scores, confidence=0, margin=0):
    # Collapse repeated occurrences of the same value before confidence-gap calibration.
    values = {}
    for entry, score in zip(entries, scores):
        answer = entry["answer"]
        values[answer] = max(values.get(answer, float("-inf")), float(score))
    ranking = sorted(values.items(), key=lambda item: -item[1])
    if not ranking: return "NOT_FOUND"
    answer, score = ranking[0]
    runner = ranking[1][1] if len(ranking)>1 else 0
    return answer if score >= confidence and score-runner >= margin else "NOT_FOUND"
