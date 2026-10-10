import { expect, test } from "@playwright/test";
import { waitForModelFreeInput } from "../support/advisor";

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`두 상성 카드를 먼저 보여주고 각 VS 화면으로 이동한다 (${viewport.width}px)`, async ({ page }) => {
    let releaseData!: () => void;
    const dataReady = new Promise<void>(resolve => { releaseData = resolve; });
    await page.route("**/llm/advisor-knowledge.json", async route => {
      await dataReady;
      await route.continue();
    });
    await page.setViewportSize(viewport);
    await page.goto("./");
    await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
    const question = page.getByRole("textbox", { name: "롤 질문 입력", exact: true });
    const skipModel = page.getByRole("button", { name: "모델 없이 써보기", exact: true });
    await waitForModelFreeInput(page, question, skipModel);
    await question.fill("오공으로 럼블, 모데카이저 너무어려운데 방법 없나?");
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    await expect(page.getByRole("button", { name: "중단", exact: true })).toBeVisible();
    releaseData();
    const rumble = page.getByRole("link", { name: "오공 vs 럼블 화면으로 이동", exact: true });
    const morde = page.getByRole("link", { name: "오공 vs 모데카이저 화면으로 이동", exact: true });
    await expect(rumble).toBeVisible();
    await expect(morde).toBeVisible();
    await expect(rumble).toHaveAttribute("href", /\/vs\?a=MonkeyKing&t=Rumble$/);
    await expect(morde).toHaveAttribute("href", /\/vs\?a=MonkeyKing&t=Mordekaiser$/);
    await expect(page.getByRole("button", { name: "중단", exact: true })).toBeHidden();
    const heading = page.getByRole("heading", { name: "오공 vs 럼블", exact: true });
    const firstAdvice = await heading.boundingBox();
    const composer = await question.boundingBox();
    for (const link of [rumble, morde]) {
      const box = await link.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.y + box!.height).toBeLessThanOrEqual(firstAdvice!.y);
      expect(box!.y + box!.height).toBeLessThan(composer!.y);
    }
    await rumble.focus();
    await page.keyboard.press("Tab");
    await expect(morde).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/vs\?a=MonkeyKing&t=Mordekaiser$/);
    await expect(page.getByRole("main").getByRole("heading", { name: "챔피언 맞대결", exact: true })).toBeVisible();
  });
}
