import { expect, test } from "@playwright/test";

for (const width of [390, 1280]) test(`상황별 콤보·대화 기억·하단 복사: ${width}px`, async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width, height: 900 });
  await page.goto("./");
  const open = page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true });
  await open.click();
  const input = page.getByRole("textbox", { name: "롤 질문 입력", exact: true });
  const skip = page.getByRole("button", { name: "모델 없이 써보기", exact: true });
  await expect(input.or(skip)).toBeVisible();
  if (await skip.isVisible()) await skip.click();
  async function ask(question: string, expected: string | RegExp) {
    await input.fill(question);
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    await expect(page.getByRole("button", { name: "중단", exact: true })).toBeHidden();
    await expect(page.getByText(expected).filter({ visible: true }).last()).toBeVisible();
  }

  await ask("자헨 콤보가 있을까?", /자헨 콤보는 상황별로/);
  const combo = page.locator("li").filter({ hasText: "짧은 딜교:" }).last();
  await expect(combo.locator("strong")).toHaveText("짧은 딜교:");
  await expect(combo.locator("code")).toHaveText("평타 → Q1 → 평타 → Q2 → 평타");
  await expect(page.getByRole("dialog").locator('a[href^="http"]')).toHaveCount(0);
  if (width === 390) {
    await expect(page.getByRole("dialog").getByRole("table")).toHaveCount(0);
    await page.getByRole("button", { name: "자료 보기", exact: true }).last().click();
    await expect(page.getByRole("dialog").getByRole("table").first()).toBeVisible();
    await page.getByText("▸ 노트 4건 펼치기", { exact: true }).click();
    await expect(page.getByRole("dialog").locator("strong").filter({ hasText: "짧은 딜교:" })).toBeVisible();
    await page.getByRole("button", { name: "돌아가기", exact: true }).click();
    await expect(input).toBeVisible();
  }
  const copy = page.getByRole("button", { name: "답변 복사", exact: true }).last();
  await expect(copy).toHaveText("");
  const box = await copy.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole("button", { name: /좋아요|싫어요|도움이 됐어요|틀렸거나/ })).toHaveCount(0);
  await copy.click();
  await expect(page.getByRole("status").filter({ hasText: "복사했어요" })).toBeVisible();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain("자헨 콤보는 상황별로");
  expect(clipboard).toContain("- **짧은 딜교:** `평타 → Q1 → 평타 → Q2 → 평타`");
  expect(clipboard).not.toMatch(/참고 자료|https?:\/\//);
  await page.screenshot({ path: `research/champion-combos/screenshots/zaahen-${width}.png` });
  const top = await combo.locator("strong").boundingBox();
  expect(top?.x).toBeGreaterThanOrEqual(0);
  expect((top?.x ?? 0) + (top?.width ?? 0)).toBeLessThanOrEqual(width);

  await ask("오공 콤보 알려줘", /오공 콤보는 상황별로/);
  await ask("궁 없는데 콤보 있어?", /오공 콤보는 상황별로/);
  await copy.click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).not.toMatch(/`[^`]*R[^`]*`/);
  await page.reload();
  await open.click();
  await ask("점멸도 없는데?", /오공 콤보는 상황별로/);
  await copy.click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).not.toMatch(/`[^`]*(?:R|점멸)[^`]*`/);
  await ask("궁 돌아왔어", "한타 진입:");
  await ask("궁 쿨타임 몇 초야?", /재사용 대기시간/);
  await ask("빅토르 콤보는? 라인전 팁은?", /빅토르 콤보는 상황별로/);
  await copy.click();
  const combined = await page.evaluate(() => navigator.clipboard.readText());
  expect(combined).toContain("**라인전**");
  expect(combined).toContain("미니언과 상대를 함께");
  expect(combined).not.toMatch(/참고 자료|https?:\/\//);
  await expect(page.getByRole("dialog").locator('a[href^="http"]')).toHaveCount(0);
  await page.screenshot({ path: `research/champion-combos/screenshots/viktor-${width}.png` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
