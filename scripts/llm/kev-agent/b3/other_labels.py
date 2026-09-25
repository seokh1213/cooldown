"""route-train "그 밖"(other) 258문항의 새 갈래 — 사람이 한 문항씩 읽고 붙였다(2026-09-25).

  i item(아이템)  r rune(룬)  s spell(소환사 주문)  g game(게임 규칙·메타: 오브젝트·골드·항복·랭크·상점·스킨)  c chat(잡담)
번호는 route-train-v1v2.jsonl 안의 other 문항 순서. 이름이 애매한 것(회오리 칼날·당근 격돌·包覆之光 …)은 아이템 목록에서 확인했다.
"""
_ROWS = """
0g 1r 2s 3g 4g 5i 6r 7s 8g 9c 10i 11r 12s 13g 14c 15i 16s 17g 18g 19i
20r 21s 22g 23g 24i 25r 26s 27g 28i 29r 30s 31g 32i 33g 34c 35i 36r 37g 38i 39r
40s 41g 42g 43i 44r 45s 46i 47r 48s 49g 50c 51i 52r 53g 54g 55i 56r 57s 58g 59g
60i 61s 62g 63c 64i 65r 66s 67g 68c 69i 70r 71g 72c 73i 74r 75s 76c 77i 78r 79s
80i 81r 82s 83g 84c 85i 86r 87s 88i 89r 90s 91i 92r 93i 94r 95s 96g 97c 98i 99r
100s 101g 102c 103i 104r 105s 106g 107i 108r 109s 110g 111g 112i 113r 114s 115g 116c 117i 118r 119g
120c 121i 122r 123s 124i 125r 126s 127i 128r 129s 130c 131i 132r 133g 134i 135r 136i 137r 138s 139i
140i 141i 142i 143i 144i 145i 146i 147i 148i 149r 150r 151r 152r 153r 154r 155r 156s 157s 158s 159s
160s 161s 162s 163g 164g 165g 166g 167g 168g 169s 170g 171c 172c 173g 174g 175g 176g 177c 178g 179s
180i 181r 182r 183s 184i 185i 186i 187g 188c 189s 190g 191i 192g 193s 194g 195g 196r 197r 198i 199i
200g 201s 202s 203i 204g 205g 206c 207s 208r 209g 210g 211g 212s 213i 214c 215g 216i 217r 218g 219s
220s 221r 222i 223s 224i 225r 226c 227g 228s 229i 230s 231s 232i 233r 234i 235i 236s 237i 238i 239s
240g 241r 242i 243c 244r 245i 246i 247r 248s 249g 250g 251g 252i 253c 254s 255i 256g 257g
"""
CODE = {"i": "item", "r": "rune", "s": "spell", "g": "game", "c": "chat"}
LABELS = {int(t[:-1]): CODE[t[-1]] for t in _ROWS.split()}
assert sorted(LABELS) == list(range(258))
