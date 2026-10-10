"""Bound evidence using the question alone, without labels or answer positions."""
import collections
import math
import re


def grams(text):
    normalized = re.sub(r"[^가-힣a-z0-9]", "", text.lower())
    return {normalized[i:i + 2] for i in range(len(normalized) - 1)}


def select_context(document, question, budget=1300):
    if len(document) <= budget: return document
    title, _, text = document.partition("\n")
    title = title[:min(100, budget // 4)]
    lines = [line for line in text.splitlines() if line.strip()]
    terms = grams(question.replace(title, ""))
    vocabulary = [grams(line) for line in lines]
    counts = collections.Counter(term for words in vocabulary for term in words)
    scores = [sum(math.log(1 + len(lines) / counts[term]) for term in terms & words)
              for words in vocabulary]
    remaining = budget - len(title) - 1; selected = []
    for index in sorted(range(len(lines)), key=lambda i: (-scores[i], i)):
        if len(lines[index]) + 1 <= remaining:
            selected.append(index); remaining -= len(lines[index]) + 1
    if not selected: return document[:budget]
    return title + "\n" + "\n".join(lines[i] for i in sorted(selected))
