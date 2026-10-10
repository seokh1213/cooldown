"""gpt-6-sol 과 gpt-6-luna 번역 비교 — 같은 프롬프트·같은 묶음을 두 모델에 번갈아 보낸다.

과제 1  규칙 본문 영어 → 중국어. scripts/llm/translate-rules-zh.ts 의 프롬프트·용어표·대조를 그대로 옮겼다.
과제 2  상성 답 한국어 → 영어·중국어. scripts/llm/translate-matchups.ts 의 프롬프트·코드 대조(1·2단계)를 그대로 옮겼다.
        3단계(Claude 뜻 대조)는 여기서 돌리지 않는다 — 맹검 채점이 그 몫을 한다.

codex 는 스크립트와 같은 인자에 --json 만 더해 부른다(토큰 내역을 받으려고. 답은 -o 파일에서 읽는다).

사용: python3 research/llm-evals/codex-models/run.py [--plan-only]
"""
import json, os, random, re, subprocess, sys, tempfile, time, glob

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "public", "data", "26.19")
LLM = os.path.join(DATA, "llm")
MODELS = ["gpt-6-sol", "gpt-6-luna"]
rng = random.Random(20260927)
read = lambda p: json.load(open(p, encoding="utf8"))

# ---------- 과제 1: 규칙 ----------
rules = read(os.path.join(LLM, "rule-notes.json"))["rules"]
glossary = "\n".join(f"{r['nameEn']} = {r['nameZh']}" for r in rules if r.get("nameZh"))
# 규칙마다 문장을 섞어 두고 규칙을 돌아가며 하나씩 뽑는다 → 여러 규칙에서 고루
pools = [(r["name"], rng.sample(r["notes"], len(r["notes"]))) for r in rules]
rng.shuffle(pools)
picked = []
while len(picked) < 60:
    for name, pool in pools:
        if pool and len(picked) < 60:
            picked.append({"rule": name, "source": pool.pop()})
rng.shuffle(picked)
rule_batches = [picked[i : i + 20] for i in range(0, 60, 20)]


def rule_prompt(part):
    texts = [p["source"] for p in part]
    return f"""Translate these League of Legends wiki notes into Simplified Chinese as used in the Chinese client.
Keep every number and condition. Use these official names:
{glossary}
Champion abilities stay as "champion + slot" (e.g. "Azir W" → "沙皇 W" with the champion's Chinese name).
Reply with a JSON array of strings only, same order, same length ({len(texts)}).

{json.dumps(texts, indent=1, ensure_ascii=False)}"""


def rule_check(part, reply):
    try:
        arr = json.loads(reply[reply.index("[") : reply.rindex("]") + 1])
    except Exception:
        return {"parsed": False, "countOk": False, "texts": [None] * len(part), "pass": [False] * len(part)}
    if len(arr) != len(part):
        return {"parsed": True, "countOk": False, "texts": (arr + [None] * len(part))[: len(part)], "pass": [False] * len(part)}
    texts, ok = [], []
    for p, t in zip(part, arr):
        t = (t or "").strip() if isinstance(t, str) else ""
        s = p["source"]
        good = bool(t) and not re.search(r"[가-힣]", t) and re.search(r"[一-鿿]", t) and len(s) * 0.1 <= len(t) <= len(s) * 1.5
        texts.append(t)
        ok.append(bool(good))
    return {"parsed": True, "countOk": True, "texts": texts, "pass": ok}


# ---------- 과제 2: 상성 ----------
LANG_NAME = {"en_US": "English", "zh_CN": "简体中文"}
cards = {lang: {c["id"]: c for c in read(os.path.join(LLM, f"champion-cards-{lang}.json"))["cards"]} for lang in ["ko_KR", "en_US", "zh_CN"]}
items = {lang: {i["id"]: i["name"] for i in read(os.path.join(DATA, f"items-normalized-{lang}.json"))["items"]} for lang in ["ko_KR", "en_US", "zh_CN"]}


def item_pairs(lang):
    out = [{"ko": ko, "target": items[lang].get(i)} for i, ko in items["ko_KR"].items()]
    out = [p for p in out if p["target"] and len(re.sub(r"\s", "", p["ko"])) >= 3]
    return sorted(out, key=lambda p: -len(p["ko"]))


ITEM_PAIRS = {lang: item_pairs(lang) for lang in ["en_US", "zh_CN"]}
first = lambda s: re.split(r"\s*[/|]\s*", s)[0]


def names_in(ko, ids, lang):
    out = []
    for cid in ids:
        k, t = cards["ko_KR"].get(cid), cards[lang].get(cid)
        if not k or not t:
            continue
        if k["name"] in ko:
            out.append({"ko": k["name"], "target": t["name"]})
        for s in k["spells"]:
            ko_name = first(s["name"])
            tt = next((x for x in t["spells"] if x["slot"] == s["slot"]), None)
            t_name = first(tt["name"]) if tt else None
            if t_name and len(ko_name) >= 2 and ko_name in ko:
                out.append({"ko": ko_name, "target": t_name})
    rest = ko
    for it in ITEM_PAIRS[lang]:
        if it["ko"] in rest:
            out.append(it)
            rest = " ".join(rest.split(it["ko"]))
    return out


def missing_names(text, names):
    norm = lambda s: re.sub(r"[’']", "'", s.lower())
    return [n["target"] for n in names if norm(n["target"]) not in norm(text)]


# 챔피언 셋을 골라 적 4·4·2 → 스크립트 기본 묶음(--batch 4) 그대로
mu_ids = sorted(os.path.basename(f)[:-5] for f in glob.glob(os.path.join(LLM, "matchups", "*.json")) if re.fullmatch(r"[A-Za-z]+\.json", os.path.basename(f)))
mes = rng.sample(mu_ids, 3)
mu_batches = []
for me, n in zip(mes, [4, 4, 2]):
    src = read(os.path.join(LLM, "matchups", f"{me}.json"))["pairs"]
    enemies = rng.sample(sorted(src), n)
    jobs = [{"enemy": e, "slot": slot, "ko": ko} for e in enemies for slot, ko in src[e].items()]
    mu_batches.append({"me": me, "jobs": jobs})


def mu_prompt(b, lang):
    me, jobs = b["me"], b["jobs"]
    ids = [me] + list(dict.fromkeys(j["enemy"] for j in jobs))
    gl = {}
    for j in jobs:
        for n in names_in(j["ko"], [me, j["enemy"]], lang):
            gl[n["ko"]] = n["target"]
    return "\n".join(
        [
            f"Translate these League of Legends matchup coaching paragraphs from Korean to {LANG_NAME[lang]}. The player plays {cards[lang][me]['name']}.",
            "Keep the meaning exactly: every fact, condition, timing and advice stays; add nothing. Natural, concise game-guide style.",
            'Abilities are written as "<champion> <slot> <ability name>" (e.g. "Rumble E Electro-Harpoon"); keep that form with the slot letter.',
            f"Use exactly these names (Korean → {LANG_NAME[lang]}):",
            *[f"{k} → {t}" for k, t in gl.items()],
            *[f"{cards['ko_KR'][i]['name']} → {cards[lang][i]['name']}" for i in ids],
            'Do not read files or run commands. Reply with ONE JSON object only: {"0": "...", "1": "...", ...}',
            "",
            *[f"{k}. {j['ko']}" for k, j in enumerate(jobs)],
        ]
    )


def json_object(text):
    s, e = text.find("{"), text.rfind("}")
    try:
        return json.loads(text[s : e + 1]) if s >= 0 and e > s else None
    except Exception:
        return None


def mu_check(b, lang, reply):
    parsed = json_object(reply)
    res = parsed or {}
    lo, hi = (1.2, 4) if lang == "en_US" else (0.5, 1.6)
    texts, ok, why = [], [], []
    for k, j in enumerate(b["jobs"]):
        t = res.get(str(k))
        t = t.strip() if isinstance(t, str) else ""
        ratio = len(t) / len(j["ko"]) if t else 0
        lost = missing_names(t, names_in(j["ko"], [b["me"], j["enemy"]], lang)) if t else []
        reasons = []
        if not t:
            reasons.append("빈 칸")
        if re.search(r"[가-힣]", t):
            reasons.append("한글")
        if t and not (lo <= ratio <= hi):
            reasons.append(f"길이비 {ratio:.2f}")
        if lost:
            reasons.append("빠진 이름 " + ", ".join(lost))
        texts.append(t)
        ok.append(not reasons)
        why.append(reasons)
    return {"parsed": parsed is not None, "texts": texts, "pass": ok, "why": why}


# ---------- 실행 ----------
def codex(model, prompt):
    d = tempfile.mkdtemp(prefix="cm-")
    out = os.path.join(d, "out.txt")
    t0 = time.time()
    p = subprocess.run(
        ["codex", "exec", "--json", "--ephemeral", "--skip-git-repo-check", "-s", "read-only", "-m", model, "-C", d, "-o", out, "-"],
        input=prompt, capture_output=True, text=True, cwd=d,
    )
    sec = time.time() - t0
    usage = None
    for line in p.stdout.splitlines():
        try:
            ev = json.loads(line)
        except Exception:
            continue
        if ev.get("type") == "turn.completed":
            usage = ev.get("usage")
    reply = open(out, encoding="utf8").read() if os.path.exists(out) else ""
    err = None if reply else (p.stderr[-2000:] + p.stdout[-2000:])
    return {"seconds": round(sec, 1), "usage": usage, "reply": reply, "returncode": p.returncode, "error": err}


REP = int(os.environ.get("REP", "1"))  # 2 = 속도만 다시 잴 때. 모델 순서를 1회차와 뒤집는다


def main():
    batches = [("rules", i, None) for i in range(3)] + [("matchup", i, lang) for lang in ["en_US", "zh_CN"] for i in range(3)]
    rng2 = random.Random(7)
    rng2.shuffle(batches)
    plan = []
    for n, b in enumerate(batches):
        order = MODELS if (n + REP) % 2 == 1 else MODELS[::-1]
        plan += [(b, m) for m in order]
    if REP == 1:
      json.dump(
        {"ruleBatches": rule_batches, "matchupBatches": mu_batches, "order": [[b[0], b[1], b[2], m] for b, m in plan]},
        open(os.path.join(OUT, "samples.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1,
    )
    if "--plan-only" in sys.argv:
        print(len(plan), "calls;", "mes", mes, "; rule chars", sum(len(p["source"]) for p in picked), "; mu slots", [len(b["jobs"]) for b in mu_batches])
        return
    runs_path = os.path.join(OUT, "runs.json" if REP == 1 else f"runs-rep{REP}.json")
    runs = json.load(open(runs_path)) if os.path.exists(runs_path) else []
    done = {(r["task"], r["batch"], r["lang"], r["model"]) for r in runs if r.get("reply")}
    for (task, i, lang), model in plan:
        if (task, i, lang, model) in done:
            continue
        prompt = rule_prompt(rule_batches[i]) if task == "rules" else mu_prompt(mu_batches[i], lang)
        r = codex(model, prompt)
        check = rule_check(rule_batches[i], r["reply"]) if task == "rules" else mu_check(mu_batches[i], lang, r["reply"])
        rec = {"task": task, "batch": i, "lang": lang or "zh_CN", "model": model, "startedAt": time.strftime("%H:%M:%S"), **r, "check": check}
        rec["lang"] = lang if task == "matchup" else None
        runs = [x for x in runs if (x["task"], x["batch"], x["lang"], x["model"]) != (task, i, rec["lang"], model)] + [rec]
        json.dump(runs, open(runs_path, "w", encoding="utf8"), ensure_ascii=False, indent=1)
        print(f"{task} {i} {lang or ''} {model}: {r['seconds']}s usage={r['usage']} pass {sum(check['pass'])}/{len(check['pass'])} rc={r['returncode']}", flush=True)
        if r["error"]:
            print("  ERROR:", r["error"][-600:], flush=True)


if __name__ == "__main__":
    main()
