/**
 * 결정 시트 HTML 을 만든다 (일회성, 커밋하지 않는다)
 *
 * 자료를 파일 안에 박아 넣어 `file://` 로 그냥 열리게 한다. 답은 브라우저 저장소에
 * 남고, 다 적은 뒤 "결과 복사" 로 JSON 을 통째로 가져간다.
 */
import * as fs from "node:fs";

const data = fs.readFileSync(process.argv[2], "utf8");
const dest = process.argv[3];

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>효과 태그 결정 시트</title>
<style>
  :root {
    --bg: #fbfbfa; --panel: #ffffff; --line: #e4e4e1; --ink: #1c1c1a;
    --muted: #71716c; --soft: #f4f4f2; --mark: #8a6d1f; --markbg: #fdf8e7;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink);
    font: 14px/1.65 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Pretendard", sans-serif; }
  header { position: sticky; top: 0; z-index: 5; background: var(--panel);
    border-bottom: 1px solid var(--line); padding: 10px 16px;
    display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
  header h1 { font-size: 14px; margin: 0; font-weight: 700; letter-spacing: -0.01em; }
  .count { color: var(--muted); font-variant-numeric: tabular-nums; }
  .count b { color: var(--ink); }
  button { font: inherit; border: 1px solid var(--line); background: var(--panel);
    padding: 5px 11px; border-radius: 6px; cursor: pointer; color: var(--ink); }
  button:hover { background: var(--soft); }
  button.primary { border-color: #c9c9c4; font-weight: 600; }
  nav { border-bottom: 1px solid var(--line); background: var(--panel);
    padding: 8px 16px; display: flex; gap: 4px; flex-wrap: wrap; position: sticky; top: 45px; z-index: 4; }
  nav a { font-size: 12px; text-decoration: none; color: var(--muted);
    padding: 2px 7px; border-radius: 5px; border: 1px solid transparent; }
  nav a:hover { background: var(--soft); }
  nav a.done { color: var(--ink); font-weight: 600; }
  nav a.done::before { content: "· "; }
  main { max-width: 1500px; margin: 0 auto; padding: 0 16px 120px; }
  section { border-top: 1px solid var(--line); padding: 26px 0; }
  section:first-of-type { border-top: 0; }
  .champ { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 28px; align-items: start; }
  @media (max-width: 1040px) { .champ { grid-template-columns: minmax(0, 1fr); } }
  .pane { min-width: 0; }
  .pane > h2 { margin: 0 0 4px; font-size: 19px; letter-spacing: -0.02em; }
  .sub { color: var(--muted); font-size: 12px; margin-bottom: 14px; }
  .spell { border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px;
    margin-bottom: 10px; background: var(--panel); }
  .spell.gap { border-color: #d8cfae; background: var(--markbg); }
  .spell h3 { margin: 0 0 6px; font-size: 14px; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .slot { display: inline-block; min-width: 20px; text-align: center; font-weight: 700;
    border: 1px solid var(--line); border-radius: 4px; padding: 0 5px; font-size: 12px; background: var(--soft); }
  .meta { color: var(--muted); font-size: 12px; margin-bottom: 6px; }
  .meta code { background: var(--soft); border-radius: 4px; padding: 1px 5px; font-size: 11px; }
  .tip { font-size: 13px; color: #33332f; white-space: pre-wrap; }
  .q { border: 1px solid var(--line); border-radius: 8px; background: var(--panel);
    padding: 14px; margin-bottom: 14px; }
  .q.answered { border-color: #bfd0bb; }
  .q > h4 { margin: 0 0 2px; font-size: 14px; }
  .kind { font-size: 11px; color: var(--mark); font-weight: 600; letter-spacing: 0.02em; }
  .q .tip { margin: 8px 0 12px; padding: 10px; background: var(--soft); border-radius: 6px; font-size: 12.5px; }
  .grid { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
  label.chip { border: 1px solid var(--line); border-radius: 999px; padding: 3px 10px;
    font-size: 12.5px; cursor: pointer; user-select: none; background: var(--panel); }
  label.chip:hover { background: var(--soft); }
  label.chip input { display: none; }
  label.chip.on { background: #33332f; color: #fff; border-color: #33332f; }
  label.chip.new { border-style: dashed; }
  label.chip.new.on { background: var(--mark); border-color: var(--mark); }
  .group { margin-bottom: 10px; }
  .group > span { display: block; font-size: 11px; color: var(--muted); margin-bottom: 5px; }
  textarea { width: 100%; border: 1px solid var(--line); border-radius: 6px; padding: 8px;
    font: inherit; font-size: 13px; resize: vertical; min-height: 44px; background: var(--panel); color: var(--ink); }
  footer { position: fixed; bottom: 0; left: 0; right: 0; background: var(--panel);
    border-top: 1px solid var(--line); padding: 9px 16px; display: flex; gap: 10px;
    align-items: center; justify-content: flex-end; }
  #out { position: fixed; inset: 8% 10%; background: var(--panel); border: 1px solid var(--line);
    border-radius: 10px; padding: 14px; display: none; flex-direction: column; gap: 10px; z-index: 9; }
  #out textarea { flex: 1; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
</style>
</head>
<body>
<header>
  <h1>효과 태그 결정 시트</h1>
  <span class="count"><b id="done">0</b> / <span id="total">0</span> 답변</span>
  <span class="count" id="patch"></span>
</header>
<nav id="nav"></nav>
<main id="main"></main>
<footer>
  <span class="count" id="hint">답은 브라우저에 저장됩니다. 끝나면 결과를 복사해 붙여 주세요.</span>
  <button id="reset">초기화</button>
  <button class="primary" id="copy">결과 복사</button>
</footer>
<div id="out">
  <b>이 내용을 그대로 붙여 주세요</b>
  <textarea id="outText" readonly></textarea>
  <div style="display:flex;gap:8px;justify-content:flex-end">
    <button id="outCopy" class="primary">클립보드로 복사</button>
    <button id="outClose">닫기</button>
  </div>
</div>
<script id="payload" type="application/json">${data.replace(/</g, "\\u003c")}</script>
<script>
(function () {
  var D = JSON.parse(document.getElementById("payload").textContent);
  var KEY = "gap-sheet-answers-v1";
  var answers = {};
  try { answers = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { answers = {}; }

  document.getElementById("patch").textContent = D.patch + " 기준";

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  var total = 0;
  D.sheet.forEach(function (c) { total += c.gaps.length; });
  document.getElementById("total").textContent = total;

  var nav = document.getElementById("nav");
  var main = document.getElementById("main");

  D.sheet.forEach(function (c) {
    var a = document.createElement("a");
    a.href = "#c-" + c.id;
    a.id = "nav-" + c.id;
    a.textContent = c.name;
    nav.appendChild(a);

    var sec = document.createElement("section");
    sec.id = "c-" + c.id;

    var left = c.spells.map(function (s) {
      var isGap = c.gaps.some(function (g) { return g.slot === s.slot; });
      var bits = [];
      if (s.cooldown) bits.push("쿨 " + esc(s.cooldown) + "초");
      if (s.cost) bits.push("소모 " + esc(s.cost));
      if (s.damageTypes.length) bits.push("유형 " + s.damageTypes.map(esc).join("·"));
      var tags = s.effects.length
        ? s.effects.map(function (t) { return "<code>" + esc(t) + "</code>"; }).join(" ")
        : "<code>태그 없음</code>";
      return '<div class="spell' + (isGap ? " gap" : "") + '">' +
        '<h3><span class="slot">' + s.slot + "</span>" + esc(s.name) + "</h3>" +
        '<div class="meta">' + bits.map(esc).join(" · ") + (bits.length ? " · " : "") + tags + "</div>" +
        '<div class="tip">' + esc(s.text) + "</div></div>";
    }).join("");

    var right = c.gaps.map(function (g) {
      var id = c.id + ":" + g.slot + ":" + (g.kind === "피해 유형" ? "type" : "tag");
      var saved = answers[id] || { picked: [], note: "" };
      var body;
      if (g.kind === "피해 유형") {
        body = '<div class="group"><span>이 스킬이 입히는 피해 유형</span><div class="grid">' +
          ["물리", "마법", "고정", "피해 없음"].map(function (t) {
            var on = saved.picked.indexOf(t) >= 0;
            return '<label class="chip' + (on ? " on" : "") + '" data-id="' + id + '" data-tag="' + esc(t) + '" data-single="1">' +
              '<input type="checkbox"' + (on ? " checked" : "") + " />" + esc(t) + "</label>";
          }).join("") + "</div></div>";
      } else {
        var chips = function (list, extra) {
          return list.map(function (t) {
            var on = saved.picked.indexOf(t) >= 0;
            return '<label class="chip ' + extra + (on ? " on" : "") + '" data-id="' + id + '" data-tag="' + esc(t) + '">' +
              '<input type="checkbox"' + (on ? " checked" : "") + " />" + esc(t) + "</label>";
          }).join("");
        };
        body =
          '<div class="group"><span>붙일 태그 (없으면 “해당 없음”)</span><div class="grid">' +
          chips(["해당 없음"], "") + chips(D.tags, "") + "</div></div>" +
          '<div class="group"><span>목록으로 담기지 않는다면</span><div class="grid">' +
          chips(D.proposed, "new") + chips(["새 어휘 필요"], "new") + "</div></div>";
      }
      return '<div class="q' + (saved.picked.length ? " answered" : "") + '" id="q-' + esc(id) + '">' +
        '<div class="kind">' + esc(g.kind) + " 결정</div>" +
        "<h4><span class=\\"slot\\">" + g.slot + "</span> " + esc(g.name) + "</h4>" +
        '<div class="tip">' + esc(g.text) + "</div>" + body +
        '<textarea data-note="' + esc(id) + '" placeholder="덧붙일 말 (선택)">' + esc(saved.note || "") + "</textarea></div>";
    }).join("");

    sec.innerHTML =
      '<div class="champ"><div class="pane"><h2>' + esc(c.name) + "</h2>" +
      '<div class="sub">' + esc(c.title || "") + (c.subclass ? " · " + esc(c.subclass) : "") + "</div>" + left + "</div>" +
      '<div class="pane"><h2>물음 ' + c.gaps.length + "개</h2>" +
      '<div class="sub">' + esc(c.name) + " 에 대해 결정이 필요한 자리입니다.</div>" + right + "</div></div>";
    main.appendChild(sec);
  });

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(answers)); } catch (e) { /* 저장 불가 */ }
    var done = 0;
    Object.keys(answers).forEach(function (k) {
      if (answers[k].picked.length || (answers[k].note || "").trim()) done += 1;
    });
    document.getElementById("done").textContent = done;
    D.sheet.forEach(function (c) {
      var all = c.gaps.every(function (g) {
        var id = c.id + ":" + g.slot + ":" + (g.kind === "피해 유형" ? "type" : "tag");
        var a = answers[id];
        return a && (a.picked.length || (a.note || "").trim());
      });
      document.getElementById("nav-" + c.id).className = all ? "done" : "";
    });
  }

  main.addEventListener("click", function (e) {
    var chip = e.target.closest ? e.target.closest("label.chip") : null;
    if (!chip) return;
    e.preventDefault();
    var id = chip.getAttribute("data-id");
    var tag = chip.getAttribute("data-tag");
    var single = chip.getAttribute("data-single");
    if (!answers[id]) answers[id] = { picked: [], note: "" };
    var picked = answers[id].picked;
    if (single) {
      answers[id].picked = picked.indexOf(tag) >= 0 ? [] : [tag];
    } else if (tag === "해당 없음") {
      answers[id].picked = picked.indexOf(tag) >= 0 ? [] : ["해당 없음"];
    } else {
      var at = picked.indexOf(tag);
      if (at >= 0) picked.splice(at, 1);
      else { picked.push(tag); var no = picked.indexOf("해당 없음"); if (no >= 0) picked.splice(no, 1); }
    }
    var box = document.getElementById("q-" + id);
    box.querySelectorAll("label.chip").forEach(function (el) {
      var on = answers[id].picked.indexOf(el.getAttribute("data-tag")) >= 0;
      el.className = el.className.replace(/ on\\b/g, "") + (on ? " on" : "");
      el.querySelector("input").checked = on;
    });
    box.className = "q" + (answers[id].picked.length ? " answered" : "");
    save();
  });

  main.addEventListener("input", function (e) {
    var id = e.target.getAttribute && e.target.getAttribute("data-note");
    if (!id) return;
    if (!answers[id]) answers[id] = { picked: [], note: "" };
    answers[id].note = e.target.value;
    save();
  });

  document.getElementById("reset").addEventListener("click", function () {
    answers = {};
    save();
    location.reload();
  });

  var out = document.getElementById("out");
  document.getElementById("copy").addEventListener("click", function () {
    var lines = [];
    D.sheet.forEach(function (c) {
      c.gaps.forEach(function (g) {
        var id = c.id + ":" + g.slot + ":" + (g.kind === "피해 유형" ? "type" : "tag");
        var a = answers[id];
        // 칩을 안 고르고 **메모만** 적은 경우도 답이다. 어느 칩에도 안 맞아서
        // 적은 것이므로 오히려 더 중요하다. 예전에는 여기서 통째로 버려졌다.
        if (!a || (!a.picked.length && !(a.note || "").trim())) return;
        lines.push({ key: c.id + ":" + g.slot, kind: g.kind, spell: g.name, answer: a.picked, note: a.note || undefined });
      });
    });
    document.getElementById("outText").value = JSON.stringify(lines, null, 2);
    out.style.display = "flex";
  });
  document.getElementById("outCopy").addEventListener("click", function () {
    var t = document.getElementById("outText");
    t.select();
    try { document.execCommand("copy"); } catch (e) { /* 수동 복사 */ }
  });
  document.getElementById("outClose").addEventListener("click", function () { out.style.display = "none"; });

  save();
})();
</script>
</body>
</html>
`;

fs.writeFileSync(dest, html, "utf8");
console.log(`${dest} (${(fs.statSync(dest).size / 1024).toFixed(0)} KB)`);
