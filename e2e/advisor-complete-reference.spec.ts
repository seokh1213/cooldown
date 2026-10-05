import { expect, test, type Page } from "@playwright/test";

async function openAdvisor(page: Page) {
  await page.goto("./");
  await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
  const input = page.getByRole("textbox", { name: "롤 질문 입력", exact: true });
  const skip = page.getByRole("button", { name: "모델 없이 써보기", exact: true });
  await expect(input.or(skip)).toBeVisible();
  if (await skip.isVisible()) await skip.click();
  return async (question: string) => {
    await input.fill(question);
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    await expect(page.getByRole("button", { name: "중단", exact: true })).toBeHidden();
  };
}

for (const width of [390, 1280]) test(`부분 질문은 짧게 답하고 전체 자료에서 강조한다: ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  let ask = await openAdvisor(page);
  await ask("오공 체력은 어떻게돼?");
  await expect(page.getByText(/오공 체력 \(1레벨\).*610/).last()).toBeVisible();
  if (width >= 1280) await page.getByRole("button", { name: "자료 보기", exact: true }).last().click();
  const stats = page.locator("[data-reference-stats]").last();
  await expect(stats).toContainText("마나");
  await expect(stats).toContainText("공격 속도");
  await expect(stats).toContainText("사거리");
  await expect(stats.getByRole("row").filter({ hasText: /^마나330/ })).toContainText("1435");
  await expect(stats.locator("[data-highlighted=true]")).toContainText("체력");
  await expect(page.locator("[data-reference-skills]").last().locator("[data-skill-icon]")).toHaveCount(5);
  await page.screenshot({ path: `/tmp/cooldown-health-reference-${width}.png` });

  await ask("Q 스킬정보좀알려줘");
  if (width >= 1280) await page.getByRole("button", { name: "자료 보기", exact: true }).last().click();
  const skills = page.locator("[data-reference-skills]").last();
  await expect(skills.locator("[data-skill-icon]")).toHaveCount(5);
  await expect(skills.locator("[data-highlighted=true]")).toHaveCount(1);
  await expect(skills.locator("[data-highlighted=true]")).toContainText("Q 파쇄격");
  await skills.getByRole("button", { name: "W 분신 전사", exact: true }).click();
  const detail = page.getByRole("dialog", { name: /분신 전사 스킬 정보/ });
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("마나");
  await detail.getByRole("button", { name: "Close", exact: true }).click();
  await expect(detail).toHaveCount(0);
  await page.screenshot({ path: `/tmp/cooldown-complete-reference-${width}.png` });

  await page.reload();
  await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
  await expect(skills.locator("[data-skill-icon]")).toHaveCount(5);
  await expect(skills.locator("[data-highlighted=true]")).toContainText("Q 파쇄격");
  ask = async question => {
    await page.getByRole("textbox", { name: "롤 질문 입력", exact: true }).fill(question);
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    await expect(page.getByRole("button", { name: "중단", exact: true })).toBeHidden();
  };
  await ask("리 신 기본 정보 알려줘");
  if (width >= 1280) await page.getByRole("button", { name: "자료 보기", exact: true }).last().click();
  await expect(stats.getByRole("row").filter({ has: page.getByRole("cell", { name: "기력", exact: true }) })).toContainText("200");
  await expect(stats.getByRole("row").filter({ hasText: /^마나/ })).toHaveCount(0);
});
