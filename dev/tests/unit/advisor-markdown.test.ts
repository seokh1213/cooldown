import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdvisorMarkdown } from "../../../src/features/advisor/answers/AdvisorMarkdown";
import { publicAnswerText } from "../../../src/features/advisor/answers/publicAnswerText";
const render = (text: string) => renderToStaticMarkup(createElement(AdvisorMarkdown, { text }));

test("상황 이름과 스킬 순서를 실제 목록·강조·코드 요소로 그린다", () => {
  const html = render("콤보 예시\n\n- **견제:** `Q → E → 평타` — 보호막을 받고 빠져요.\n- **한타:** `W → R`\n\n라인전 팁");
  assert.equal((html.match(/<ul\b/g) ?? []).length, 1);
  assert.equal((html.match(/<li\b/g) ?? []).length, 2);
  assert.match(html, /<strong>견제:<\/strong>/);
  assert.match(html, /<code[^>]*>Q → E → 평타<\/code>/);
  assert.doesNotMatch(html, /before:content|\*\*견제/);
});

test("순서 목록과 제목은 유지하고 저장된 답의 출처 링크를 숨긴다", () => {
  const html = render("## 진입\n3. 접근\n4. 교환\n\n[참고 자료 1](https://mobalytics.gg/lol/champions/viktor/combos)");
  assert.match(html, /<h3/);
  assert.match(html, /<ol[^>]*start="3"/);
  assert.doesNotMatch(html, /<a|https?:|참고 자료/);
});

test("본문 HTML과 실행 가능한 링크는 실행되는 태그가 되지 않는다", () => {
  const html = render('<img src=x onerror=alert(1)>\n[누르기](javascript:alert)\n[데이터](data:text/html,hello)');
  assert.doesNotMatch(html, /<img|href="javascript:|href="data:/);
  assert.match(html, /&lt;img/);
});

test("복사할 저장 답변에서 세 언어의 출처를 지우고 게임 내용은 보존한다", () => {
  for (const source of ["[참고 자료 1](https://example.com) · [참고 자료 2](https://example.org)",
    "[Reference 1](https://example.com)", "[参考资料 1](https://example.com)",
    "공식 롤 위키 기준(2026-10-05 확인)", "_v26.19 · 위키 판정 규칙 (CC BY-SA)_"]) {
    assert.equal(publicAnswerText(`- **견제:** \`Q → E → 평타\`\n\n${source}`), "- **견제:** `Q → E → 평타`");
  }
  assert.equal(publicAnswerText("Q로 보호막을 얻어요. [설명](https://example.com)"), "Q로 보호막을 얻어요. 설명");
});
