import { waitForModelFreeInput } from "../support/advisor";
import { expect, test, type Locator, type Page } from "@playwright/test";

async function openAdvisor(page: Page) {
  await page.goto("./");
  await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
  const input = page.getByRole("textbox", { name: "롤 질문 입력", exact: true });
  const skip = page.getByRole("button", { name: "모델 없이 써보기", exact: true });
  await waitForModelFreeInput(page, input, skip);
  return async (question: string) => {
    await input.fill(question);
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    await expect(page.getByRole("button", { name: "중단", exact: true })).toBeHidden();
  };
}

function skillRows(skills: Locator) {
  return skills.locator(":scope > table > tbody > tr");
}

async function expectAllDetails(skills: Locator) {
  const rows = skillRows(skills);
  await expect(rows).toHaveCount(5);
  for (let index = 0; index < 5; index++) {
    const row = rows.nth(index);
    const information = row.getByText("▸ 스킬 정보", { exact: true });
    const fullText = row.getByText("▸ 설명 전문", { exact: true });
    await expect(information).toHaveCount(1);
    await expect(fullText).toHaveCount(1);
    await information.click();
    await expect(information.locator("..").getByRole("table")).toBeVisible();
    await information.click();
    await fullText.click();
    await expect(fullText.locator("..").locator("div")).not.toBeEmpty();
    await expect(fullText.locator("..").locator("div")).toBeVisible();
    await fullText.click();
  }
}

for (const width of [390, 1280]) test(`모든 스킬 상세와 같은 챔피언 자료를 재사용한다: ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const ask = await openAdvisor(page);
  await ask("오공 설명해줘");
  await expect(page.getByText("기본 능력치 (1레벨)", { exact: true })).toBeVisible();
  await ask("오공 Q 스킬정보 알려줘");
  if (width < 768) await page.getByRole("button", { name: "자료 패널", exact: true }).click();
  else await page.getByRole("button", { name: "자료 보기", exact: true }).last().click();

  const panel = page.getByRole("dialog", { name: "롤 지식 도우미", exact: true });
  const skills = panel.locator("[data-reference-skills]").last();
  const tab = panel.getByRole("button", { name: "오공 · 스킬", exact: true });
  await expect(tab).toHaveCount(1);
  await expect(tab).toHaveAttribute("aria-pressed", "true");
  await expect(skills.locator("[data-highlighted=true]")).toContainText("Q 파쇄격");
  await expectAllDetails(skills);

  const w = skillRows(skills).nth(2);
  const wInformation = w.getByText("▸ 스킬 정보", { exact: true });
  const wFullText = w.getByText("▸ 설명 전문", { exact: true });
  await wInformation.click();
  await wFullText.click();
  await expect(wInformation.locator("..")).toContainText("22/21/20/19/18초");
  if (width < 768) await page.getByRole("button", { name: "돌아가기", exact: true }).click();
  else await skills.evaluate(node => node.setAttribute("data-reuse-check", "same-card"));

  await ask("오공 R 스킬정보 알려줘");
  if (width < 768) await page.getByRole("button", { name: "자료 패널", exact: true }).click();
  await expect(tab).toHaveCount(1);
  await expect(tab).toHaveAttribute("aria-pressed", "true");
  await expect(skills.locator("[data-highlighted=true]")).toContainText("R 회전격");
  await expect(panel.getByRole("button", { name: /^[QR]$/, exact: true })).toHaveCount(0);

  if (width >= 1280) {
    await expect(skills).toHaveAttribute("data-reuse-check", "same-card");
    await expect(wInformation.locator("..")).toHaveAttribute("open", "");
    await expect(wFullText.locator("..")).toHaveAttribute("open", "");
    await page.getByRole("button", { name: "자료 보기", exact: true }).nth(1).click();
    await expect(skills.locator("[data-highlighted=true]")).toContainText("Q 파쇄격");
    await expect(tab).toHaveAttribute("aria-pressed", "true");
    await tab.click();
    await expect(skills.locator("[data-highlighted=true]")).toContainText("R 회전격");
    await wInformation.click();
    await wFullText.click();
  } else {
    await expectAllDetails(skills);
  }
  await expect.poll(() => panel.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await skills.locator("[data-highlighted=true]").scrollIntoViewIfNeeded();

  if (width < 768) await page.getByRole("button", { name: "돌아가기", exact: true }).click();
  await ask("아리 Q 스킬정보 알려줘");
  if (width < 768) await page.getByRole("button", { name: "자료 패널", exact: true }).click();
  const ahriTab = panel.getByRole("button", { name: "아리 · 스킬", exact: true });
  await expect(ahriTab).toHaveCount(1);
  await expect(ahriTab).toHaveAttribute("aria-pressed", "true");
  await tab.click();
  await expect(skills.locator("[data-highlighted=true]")).toContainText("R 회전격");

  await page.reload();
  await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
  if (width < 768) await page.getByRole("button", { name: "자료 패널", exact: true }).click();
  await expect(tab).toHaveCount(1);
  await expect(ahriTab).toHaveCount(1);
  await tab.click();
  await expect(skills.locator("[data-highlighted=true]")).toContainText("R 회전격");
  await expect(skillRows(skills)).toHaveCount(5);
});
