"""route-large(시험) "그 밖" 75문항의 새 갈래 — 사람이 한 문항씩 읽고 붙였다(2026-09-25). 표기는 other_labels.py 와 같다."""
_ROWS = """
0s 1i 2r 3s 4g 5i 6c 7s 8i 9i 10g 11s 12i 13g 14r 15i 16s 17g 18s 19g
20i 21g 22r 23i 24c 25s 26s 27s 28s 29s 30i 31i 32i 33i 34r 35r 36r 37r 38g 39i
40g 41g 42g 43g 44g 45g 46g 47g 48g 49c 50s 51r 52i 53i 54r 55s 56i 57g 58s 59s
60i 61c 62i 63i 64i 65g 66i 67g 68r 69g 70s 71i 72r 73i 74g
"""
CODE = {"i": "item", "r": "rune", "s": "spell", "g": "game", "c": "chat"}
LABELS = {int(t[:-1]): CODE[t[-1]] for t in _ROWS.split()}
assert sorted(LABELS) == list(range(75))
