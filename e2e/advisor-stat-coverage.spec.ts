import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`체력과 체젠 결론을 모두 보여주고 저장 후 이어 묻는다 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("./");
    await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
    const question = page.getByRole("textbox", { name: "롤 질문 입력", exact: true });
    const skipModel = page.getByRole("button", { name: "모델 없이 써보기", exact: true });
    await expect(question.or(skipModel)).toBeVisible();
    if (await skipModel.isVisible()) await skipModel.click();
    const ask = async (text: string) => {
      await question.fill(text);
      await page.getByRole("button", { name: "보내기", exact: true }).click();
      await expect(page.getByRole("button", { name: "중단", exact: true })).toBeHidden();
    };
    await ask("오공·문도 체력하고 체젠 비교해줘");
    await expect(page.getByText("문도 박사 640 > 오공 610", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("문도 박사 7 > 오공 3.5", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("체력 재생 (5초당) (1레벨)", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("체력 (1레벨)는 문도 박사 640 > 오공 610입니다.", { exact: true })).toHaveCount(0);
    await page.reload();
    await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
    await expect(question).toBeVisible();
    await ask("18레벨이면?");
    await expect(page.getByText(/체력 \(18레벨\)/, { exact: true }).first()).toBeVisible();
    await expect(page.getByText("체력 재생 (5초당) (18레벨)", { exact: true }).first()).toBeVisible();
    await ask("문도만");
    await expect(page.getByText("문도 박사 2391", { exact: true }).last()).toBeVisible();
    await expect(page.getByText("문도 박사 15.5", { exact: true }).last()).toBeVisible();
    await ask("체젠만");
    await expect(page.getByText(/문도 박사 체력 재생 \(5초당\) \(18레벨\).*15.5/).last()).toBeVisible();
  });
}
