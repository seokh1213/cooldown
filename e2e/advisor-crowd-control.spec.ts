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

for (const width of [390, 1280]) {
  test(`CC 카드와 기억을 유지한 강타 판정: ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const ask = await openAdvisor(page);
    await ask("아리 E CC 종류 알려줘");
    await expect(page.getByText(/매혹 \(하드/).last()).toBeVisible();
    await ask("그럼 강타는?");
    await expect(page.getByText(/강타 사용을 막지 않습니다/).last()).toBeVisible();
    await ask("말자하 R CC 종류 알려줘");
    await expect(page.getByText(/제압 \(하드/).last()).toBeVisible();
    await ask("그럼 강타는?");
    await expect(page.getByText(/제압·정지가 유지되는 동안 강타를 쓸 수 없습니다/).last()).toBeVisible();
    await ask("룰루 W CC 종류 알려줘");
    await expect(page.getByText(/변이 \(소프트/).last()).toBeVisible();
    await expect(page.getByText(/군중 제어.*강제 이동/)).toHaveCount(0);
    if (width === 390) {
      await page.getByText(/변이 \(소프트/).last().scrollIntoViewIfNeeded();
      await page.screenshot({ path: "research/llm-evals/crowd-control/mobile.png" });
    }
  });
}

test("브라우저에서 기존 툴팁보다 부활·정화·치감 판정 노트를 먼저 답한다", async ({ page }) => {
  const ask = await openAdvisor(page);
  await ask("수호천사 부활 중 강타 써져?");
  await expect(page.getByText(/수호천사가 발동해 부활을 기다리는 동안에는 강타를 쓸 수 없습니다/).last()).toBeVisible();
  await ask("모데 궁 수은으로 풀어?");
  await expect(page.getByText(/죽음의 세계에서 나올 수 없습니다/).last()).toBeVisible();
  await ask("치감 두 개 사면 중첩돼?");
  await expect(page.getByText(/치유 감소율은 여러 개를 적용해도 합산되지 않습니다/).last()).toBeVisible();
});
