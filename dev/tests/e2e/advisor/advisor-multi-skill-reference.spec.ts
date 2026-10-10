import { expect, test, type Page } from "@playwright/test";
import { waitForModelFreeInput } from "../support/advisor";

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

for (const width of [390, 1280]) test(`단일 틱 답변은 수치를 들여쓰고 주의사항을 별도 문단으로 표시한다: ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const ask = await openAdvisor(page);
  await ask("코르키 w 틱 간격과 데미지 알려줘");
  const dialog = page.getByRole("dialog", { name: "롤 지식 도우미", exact: true });
  const digest = dialog.locator(".border-l-2").filter({ hasText: "W 발키리 · 지속 틱" });
  const metrics = digest.getByRole("listitem");
  await expect(metrics).toHaveText(["0.5초 간격", "2.5초 지속", "5틱분"]);
  const label = digest.getByText("지속 피해", { exact: true });
  const note = digest.getByText(/불길에서 벗어나도 1초간 피해가 잔류합니다/);
  await expect(note).toContainText("실제 적중 횟수를 보장하지 않습니다");
  const labelBox = (await label.boundingBox())!;
  const firstBox = (await metrics.nth(0).boundingBox())!;
  const lastBox = (await metrics.nth(2).boundingBox())!;
  expect(firstBox.x).toBeGreaterThan(labelBox.x);
  expect(lastBox.y).toBeGreaterThan(firstBox.y);
  expect((await note.boundingBox())!.y).toBeGreaterThan(lastBox.y);
  expect(await note.evaluate(node => {
    const text = document.createRange();
    text.selectNodeContents(node);
    return text.getBoundingClientRect().x;
  })).toBeCloseTo(labelBox.x, 0);
  await expect(dialog.locator('a[href^="http"], a[target="_blank"]')).toHaveCount(0);
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
  await expect(metrics).toHaveText(["0.5초 간격", "2.5초 지속", "5틱분"]);
  await expect(dialog.getByText("틱 근거", { exact: true })).toHaveCount(0);
});

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
  const fire = skills.locator("[data-highlighted=true]").nth(0).locator("[data-spell-ticks]");
  const gatling = skills.locator("[data-highlighted=true]").nth(1).locator("[data-spell-ticks]");
  await expect(fire).toContainText("0.5초 간격");
  await expect(fire).toContainText("5틱분");
  await expect(fire).toContainText("1초간 피해가 잔류");
  await expect(gatling).toContainText("0.25초 간격");
  await expect(gatling).toContainText("16틱 (계속 적중 시)");
  await expect(gatling).toContainText("총피해 ÷ 16");
  await expect(gatling.getByText("지속 틱", { exact: true })).toHaveCount(1);
  await expect(gatling.getByRole("listitem")).toHaveCount(4);
  await expect(dialog.locator('a[href^="http"], a[target="_blank"]')).toHaveCount(0);
  await expect(dialog.getByText("틱 근거", { exact: true })).toHaveCount(0);
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
  await expect(gatling).toContainText("16틱 (계속 적중 시)");

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

test("변동 틱과 출처 미확인, 후속 질문을 카드에도 구분해서 표시한다", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: "dark" });
  const ask = await openAdvisor(page);
  await expect(page.locator("html")).toHaveClass(/dark/);
  const dialog = page.getByRole("dialog", { name: "롤 지식 도우미", exact: true });
  const selected = dialog.locator("[data-reference-skills] [data-highlighted=true] [data-spell-ticks]");
  await ask("가렌 E 틱 수는?");
  await expect(selected).toContainText("회전 수 = 7 +");
  await expect(selected).toContainText("3초 ÷ 회전 수");
  await ask("브랜드 패시브 틱당 피해는?");
  await expect(selected).toContainText("서로 맞지 않아");
  await expect(selected).not.toContainText("16틱");
  await ask("아리 Q 틱은?");
  await expect(selected).toContainText("명시되어 있지 않습니다");
  await ask("코르키 E 틱은?");
  await expect(selected).toContainText("16틱");
  await ask("W는?");
  await expect(selected).toContainText("0.5초 간격");
  await expect(selected).toContainText("5틱분");
  await expect(selected).toBeVisible();
  await expect.poll(() => dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
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
