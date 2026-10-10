import { waitForModelFreeInput } from "../support/advisor";
import { expect, test } from "@playwright/test";

for (const width of [390, 1280]) test(`기본 소개·전체 스탯 정정·스킬 아이콘 상세: ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto("./");
  await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
  const input = page.getByRole("textbox", { name: "롤 질문 입력", exact: true });
  const skip = page.getByRole("button", { name: "모델 없이 써보기", exact: true });
  await waitForModelFreeInput(page, input, skip);
  const ask = async (question: string) => {
    await input.fill(question);
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    await expect(page.getByRole("button", { name: "중단", exact: true })).toBeHidden();
  };
  await ask("오공 설명해줘");
  await expect(page.getByText("기본 능력치 (1레벨)", { exact: true })).toBeVisible();
  await expect(page.getByText("어느 쪽을 물으신 건가요?", { exact: true })).toHaveCount(0);
  if (width >= 1280) await page.getByRole("button", { name: "자료 보기", exact: true }).last().click();
  const panel = page.getByRole("dialog", { name: "롤 지식 도우미", exact: true });
  const tables = panel.getByRole("table");
  await expect(tables).toHaveCount(2);
  await expect(tables.first()).toContainText("체력");
  // 상세 자료가 마나 행을 추가하기 전에 호버하면 로딩 중 이동한 아이콘에서 포인터가 벗어난다.
  await expect(tables.first()).toContainText("마나");
  const skills = tables.last();
  await expect(skills.locator("[data-skill-icon]")).toHaveCount(5);
  const q = skills.getByRole("button", { name: "Q 파쇄격", exact: true });
  if (width > 768) {
    await q.hover();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await expect(page.getByRole("tooltip")).toContainText("방어력");
  }
  await q.click();
  const details = page.getByRole("dialog", { name: /파쇄격 스킬 정보/ });
  await expect(details).toBeVisible();
  await expect(details).toContainText("방어력");
  await expect(details.locator("[data-skill-icon]")).toHaveCount(1);
  await expect.poll(async () => {
    const box = await details.boundingBox();
    return Boolean(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= 844);
  }).toBe(true);
  await details.getByRole("button", { name: "Close", exact: true }).click();
  await expect(details).toBeHidden();
  await expect(panel).toBeVisible();
  if (width < 768) {
    await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe("fixed");
    await expect(input).toBeVisible();
  }
  await ask("아니 스킬말고 스탯들. 체력이나이런정보들");
  await expect(page.getByText(/체력 재생.*3\.5/).last()).toBeVisible();
  await expect(page.getByText(/조회할 대상이나 항목이 남지/)).toHaveCount(0);
});
