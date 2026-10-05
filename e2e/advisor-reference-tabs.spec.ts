import { expect, test } from "@playwright/test";

for (const width of [390, 1280]) test(`자료 탭을 챔피언 이름으로 구분하고 전환한다: ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto("./");
  await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
  const input = page.getByRole("textbox", { name: "롤 질문 입력", exact: true });
  const skip = page.getByRole("button", { name: "모델 없이 써보기", exact: true });
  await expect(input.or(skip)).toBeVisible();
  if (await skip.isVisible()) await skip.click();
  for (const champion of ["오공", "자헨"]) {
    await input.fill(`${champion} 콤보 알려줘`);
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    await expect(page.getByText(new RegExp(`${champion} 콤보는 상황별로`))).toBeVisible();
  }
  await page.getByRole("button", { name: "자료 보기", exact: true }).last().click();
  const panel = page.getByRole("dialog");
  for (const champion of ["오공", "자헨"]) {
    const tab = panel.getByRole("button", { name: champion, exact: true });
    await expect(tab).toBeVisible();
    await tab.click();
    await expect(tab).toHaveClass(/border-primary/);
    await expect(panel.getByText(new RegExp(`${champion} · 챔피언`)).first()).toBeVisible();
    await expect(panel.getByRole("table").first()).toBeVisible();
    await expect(panel.getByText(champion === "오공" ? "전사 · 탱커 · 근접" : "전사 · 근접", { exact: true })).toBeVisible();
    const stats = panel.getByRole("table").first();
    await expect(stats).not.toContainText(/상위|하위/);
    await expect(stats.getByRole("row").filter({ hasText: /^체력/ })).toContainText(champion === "오공" ? "+99" : "+114");
  }
  await expect(panel.getByRole("button", { name: "챔피언", exact: true })).toHaveCount(0);
  await page.screenshot({ path: `/tmp/cooldown-reference-tabs-${width}.png` });
});
