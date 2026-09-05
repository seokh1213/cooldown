/**
 * 모델 없이 코드만으로 만드는 상성 조언
 *
 * 확정 구간(아이템·룬·주문·선마)은 이미 코드가 만들고, 상성의 이유도 사실 카드에서 계산한다.
 * 그러면 남은 질문은 이것이다. **모델이 실제로 더하는 것이 무엇인가?**
 *
 * 답을 재려면 같은 기준으로 채점할 수 있는 "코드 전용 답변" 이 있어야 한다. 그게 이 파일이다.
 * 서술 구간까지 지식 카드 문장을 그대로 이어 붙여 만든다.
 *
 * 이건 대조군이면서 동시에 **대비책**이기도 하다. 모델을 못 쓰는 브라우저나
 * 내려받기를 거절한 사용자에게도 이 답은 줄 수 있다.
 */
import { deriveThreatOrder, renderDecidedSections, type MatchupContext } from "./prompt";
import { josa } from "./text";

/** 소제목 아래에 지식 카드 문장을 그대로 싣는다 */
function section(title: string, lines: string[]): string | undefined {
  const body = lines.filter(Boolean);
  if (!body.length) return undefined;
  return `## ${title}\n${body.map((l) => `- ${l}`).join("\n")}`;
}

export function buildCodeAnswer(ctx: MatchupContext): string {
  const { me, enemy, playbook } = ctx;
  const parts: string[] = [];

  const verdict = ctx.tips.find((t) => t.category === "verdict");
  if (verdict) parts.push(`## 상성 한 줄 요약\n${verdict.text}`);

  const byCategory = (category: string, side: "mine" | "vsEnemy") =>
    (playbook?.[side] ?? []).filter((e) => e.category === category).map((e) => e.text);

  // 라인전: 내 라인 운영 + 힘의 구간
  const laning = section("라인전 구도", [
    ...byCategory("phase", "mine").slice(0, 2),
    ...byCategory("laning", "mine").slice(0, 2),
    ...byCategory("laning", "vsEnemy").slice(0, 2),
  ]);
  if (laning) parts.push(laning);

  // 확정 구간. 상성 한 줄 요약은 위에서 이미 냈으므로 그 소제목만 걷어낸다.
  const decided = renderDecidedSections(ctx)
    .split("\n\n")
    .filter((block) => !block.startsWith("## 상성 한 줄 요약"))
    .join("\n\n");
  if (decided) parts.push(decided);

  // 조심할 스킬: 코드가 매긴 순위 + 상대 지식 카드
  const threats = deriveThreatOrder(enemy).map(
    (r) => `${enemy.name} ${r.slot} ${r.name} — ${r.reasons.slice(0, 2).join(" / ")}`,
  );
  const enemySkill = byCategory("skill", "vsEnemy").slice(0, 3);
  const threatSection = section("조심할 스킬", [...threats, ...enemySkill]);
  if (threatSection) parts.push(threatSection);

  // 콤보와 플레이 팁
  const combo = section("콤보와 플레이 팁", [
    ...byCategory("combo", "mine").slice(0, 3),
    ...byCategory("skill", "mine").slice(0, 2),
    ...byCategory("teamfight", "mine").slice(0, 1),
  ]);
  if (combo) parts.push(combo);

  parts.push(
    `_${josa(me.name, "은/는")} ${enemy.name} 상대 기준입니다. ` +
      `패치 ${ctx.patch} 자료로 코드가 조립한 답변이며 문장을 지어내지 않았습니다._`,
  );
  return parts.join("\n\n");
}
