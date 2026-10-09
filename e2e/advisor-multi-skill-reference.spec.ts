import { expect, test, type Page } from "@playwright/test";
import { waitForModelFreeInput } from "./support/advisor";

async function openAdvisor(page: Page) {
  await page.goto("./");
  await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
  const input = page.getByRole("textbox", { name: "롤 질문 입력", exact: true });
  await waitForModelFreeInput(page, input, page.getByRole("button", { name: "모델 없이 써보기", exact: true }));
  return async (question: string) => {
    await input.fill(question);
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    await expect(page.getByRole("button", { name: "중단", exact: true })).toBeHidden();
  };
}

for (const width of [390, 1280]) test(`복수 스킬은 카드 하나와 옆 패널을 사용하며 기록 복원도 유지한다: ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const ask = await openAdvisor(page);
  await ask("코르키 w, e 지속 틱은 어떻게되는거지?");
  const dialog = page.getByRole("dialog", { name: "롤 지식 도우미", exact: true });
  const skills = dialog.locator("[data-reference-skills]");
  await expect(skills).toHaveCount(1);
  await expect(skills.locator(":scope > table > tbody > tr")).toHaveCount(5);
  await expect(skills.locator("[data-highlighted=true]")).toHaveCount(2);
  await expect(skills.locator("[data-highlighted=true]").nth(0)).toContainText("W 발키리");
  await expect(skills.locator("[data-highlighted=true]").nth(1)).toContainText("E 개틀링 건");
  if (width >= 1180) {
    await expect(dialog.locator("aside")).toBeVisible();
    await expect(dialog.locator("aside [data-reference-skills]")).toHaveCount(1);
    await expect(dialog.getByRole("button", { name: "자료 보기", exact: true })).toHaveCount(1);
  } else await expect(dialog.locator("aside")).toHaveCount(0);
  await expect.poll(() => dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);

  await page.reload();
  await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
  await expect(skills).toHaveCount(1);
  await expect(skills.locator("[data-highlighted=true]")).toHaveCount(2);

  if (width >= 1180) {
    const input = page.getByRole("textbox", { name: "롤 질문 입력", exact: true });
    await input.fill("코르키 Q 스킬정보 알려줘");
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    await expect(page.getByRole("button", { name: "중단", exact: true })).toBeHidden();
    const chips = dialog.getByRole("button", { name: "자료 보기", exact: true });
    await expect(chips).toHaveCount(2);
    await expect(chips.first()).not.toHaveClass(/bg-primary\/5/);
    await expect(chips.last()).toHaveClass(/bg-primary\/5/);
    await input.fill("아리 Q 스킬정보 알려줘");
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    await expect(page.getByRole("button", { name: "중단", exact: true })).toBeHidden();
    const corki = dialog.getByRole("button", { name: "코르키 · 스킬", exact: true });
    await corki.click();
    await expect(skills.locator("[data-highlighted=true]")).toHaveCount(1);
    await expect(skills.locator("[data-highlighted=true]")).toContainText("Q 인광탄");
    await expect(corki).toHaveAttribute("aria-pressed", "true");
    await chips.first().click();
    await expect(skills.locator("[data-highlighted=true]")).toHaveCount(2);
    await expect(chips.first()).toHaveClass(/bg-primary\/5/);
    await expect(chips.nth(1)).not.toHaveClass(/bg-primary\/5/);
    await dialog.getByRole("button", { name: "자료 보기", exact: true }).last().click();
    await expect(skills.locator("[data-highlighted=true]")).toHaveCount(1);
    await expect(skills.locator("[data-highlighted=true]")).toContainText("Q 현혹의 구슬");
  }
});

test("한 질문의 서로 다른 상성 자료도 각각 선택할 수 있다", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const ask = await openAdvisor(page);
  await ask("오공으로 럼블 모데 상대법 알려줘");
  const dialog = page.getByRole("dialog", { name: "롤 지식 도우미", exact: true });
  const reference = dialog.locator("aside");
  await expect(reference).toBeVisible();
  for (const name of ["럼블", "모데카이저"]) {
    const tab = dialog.getByRole("button", { name: `오공 vs ${name} · 상성`, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-pressed", "true");
    await expect(reference).toContainText(`오공 vs ${name}`);
  }
  const chips = dialog.getByRole("button", { name: "자료 보기", exact: true });
  await expect(chips).toHaveCount(2);
  await chips.first().focus();
  await chips.first().press("Enter");
  await expect(dialog.getByRole("button", { name: "오공 vs 럼블 · 상성", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(reference).toContainText("오공 vs 럼블");
});
