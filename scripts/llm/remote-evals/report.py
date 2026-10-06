"""Write a phone-friendly, private report without publishing logs or source paths."""
import html
import json
from pathlib import Path

VARIANTS = [
    ("baseline", "현행", "현재 q4 그래프·판정 헤드·문서"),
    ("judge", "판정 튜닝", "헤드 재학습과 확신도 보정"),
    ("retrieval", "검색 튜닝", "혼동 문서를 활용한 검색 LoRA 학습"),
    ("quantization", "양자화 대응", "배포 q4 오차를 반영한 학습"),
    ("answerability", "근거 판정·추출", "문서에 답이 있는지 판정하고 근거 추출"),
    ("sft", "생성 SFT", "질문·컨텍스트·답변으로 생성 LoRA 학습"),
]
LABELS = {"pending": "대기", "running": "측정 중", "complete": "완료", "failed": "중단"}


def aggregate(rows, key="set"):
    counts = {}
    for row in rows:
        group = row.get(key, "dialogue")
        if not isinstance(row.get("ok"), bool):
            continue
        correct, total = counts.get(group, (0, 0))
        counts[group] = (correct + int(row["ok"]), total + 1)
    return {name: {"correct": hit, "total": total} for name, (hit, total) in counts.items()}


def atomic_json(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2))
    temporary.replace(path)


def render_report(directory, state):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    atomic_json(directory / "status.json", state)
    escape = lambda value: html.escape(str(value), quote=True)
    variants = "".join(
        f'<tr><th scope="row">{escape(name)}</th><td>{escape(LABELS[state["variants"].get(id_, "pending")])}</td>'
        f'<td>{escape(detail)}</td></tr>' for id_, name, detail in VARIANTS
    )
    metrics = "".join(
        f'<tr><th scope="row">{escape(name)}</th><td>{score["correct"]} / {score["total"]}</td>'
        f'<td>{score["correct"] / score["total"] * 100:.1f}%</td></tr>'
        for name, score in state.get("metrics", {}).items() if score["total"]
    ) or '<tr><td colspan="3">측정이 끝나면 결과가 표시됩니다.</td></tr>'
    stages = "".join(
        f'<li><span>{escape(stage["label"])}</span><strong>{escape(LABELS[stage["status"]])}</strong></li>'
        for stage in state.get("stages", [])
    )
    page = """<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="30">
<title>Cooldown · 모델 비교</title><style>
:root{color-scheme:dark;font-family:system-ui,-apple-system,sans-serif;background:#0b0c0f;color:#e7e9ee}
body{margin:0}main{max-width:940px;margin:auto;padding:28px 20px 64px}header{border-bottom:1px solid #30343c;padding-bottom:24px}
.brand{font-size:14px;letter-spacing:.12em;color:#b0b8c8}h1{font-size:30px;line-height:1.2;margin:16px 0}
h2{font-size:19px;margin:32px 0 14px}p{line-height:1.6;color:#b0b8c8}.scope{color:#b3d5ff}
table{width:100%;border-collapse:collapse;text-align:left;font-size:14px}th,td{padding:13px 8px;border-bottom:1px solid #262b33;vertical-align:top}
thead{color:#b0b8c8}tbody th{font-weight:500}ul{padding:0;list-style:none}li{display:flex;gap:16px;justify-content:space-between;padding:13px 0;border-bottom:1px solid #262b33}
strong{font-size:14px;font-weight:500;white-space:nowrap;color:#b3d5ff}small{color:#8893a4}
@media(max-width:520px){main{padding:24px 14px}th,td{padding:12px 5px}td:last-child{font-size:12px}h1{font-size:27px}}
</style></head><body><main><header><div class="brand">COOLDOWN / EVALUATION</div>
<h1>모델 비교</h1><p class="scope">__EXECUTION__</p>
<p>판정과 검색을 측정합니다. 브라우저 WebGPU 속도와 전체 답변 품질은 별도 검증이 필요합니다.</p>
<small>실험 __RUN__ · 갱신 __UPDATED__ · 30초마다 갱신</small></header>
<section><h2>실험 상태</h2><table><thead><tr><th>비교군</th><th>상태</th><th>변경 내용</th></tr></thead>
<tbody>__VARIANTS__</tbody></table></section><section><h2>실행 단계</h2><ul>__STAGES__</ul></section>
<section><h2>정답률</h2><table><thead><tr><th>평가</th><th>정답 / 문항</th><th>비율</th></tr></thead>
<tbody>__METRICS__</tbody></table></section><p>__MESSAGE__</p></main></body></html>"""
    for token, value in {"__RUN__": escape(state["run"]), "__UPDATED__": escape(state["updated"]),
                         "__VARIANTS__": variants, "__STAGES__": stages, "__METRICS__": metrics,
                         "__EXECUTION__": escape(state.get("execution", "서버 CPU · 실제 q4 그래프 평가")),
                         "__MESSAGE__": escape(state.get("message", ""))}.items():
        page = page.replace(token, value)
    temporary = directory / "index.html.tmp"
    temporary.write_text(page)
    temporary.replace(directory / "index.html")
