import { waitForModelFreeInput } from "./support/advisor";
import { expect, test, type Page } from "@playwright/test";

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

for (const width of [390, 1280]) {
  test(`CC 카드와 기억을 유지한 강타 판정: ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const ask = await openAdvisor(page);
    await ask("아리 E CC 종류 알려줘");
    await expect(page.getByText(/매혹 \(하드/).filter({ visible: true }).last()).toBeVisible();
    await ask("그럼 강타는?");
    await expect(page.getByText(/강타 사용을 막지 않습니다/).last()).toBeVisible();
    await ask("말자하 R CC 종류 알려줘");
    await expect(page.getByText(/제압 \(하드/).filter({ visible: true }).last()).toBeVisible();
    await ask("그럼 강타는?");
    await expect(page.getByText(/제압·정지가 유지되는 동안 강타를 쓸 수 없습니다/).last()).toBeVisible();
    await ask("룰루 W CC 종류 알려줘");
    await expect(page.getByText(/변이 \(소프트/).filter({ visible: true }).last()).toBeVisible();
    await expect(page.getByText(/군중 제어.*강제 이동/).filter({ visible: true })).toHaveCount(0);
    if (width === 390) {
      await page.getByText(/변이 \(소프트/).filter({ visible: true }).last().scrollIntoViewIfNeeded();
    }
  });
  test(`리신 궁 아이콘과 종류에서 순서로 바뀐 질문: ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const ask = await openAdvisor(page);
    await ask("리신 궁에는 CC가 뭐뭐 종류가뭐지?");
    const icon = page.getByRole("img", { name: "리 신 R 용의 분노", exact: true });
    await expect(icon).toBeVisible();
    const decoded = await icon.evaluate(async element => {
      const src = getComputedStyle(element).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
      if (!src) return false;
      const img = new Image();
      img.src = src;
      await img.decode();
      return img.naturalWidth > 0;
    });
    expect(decoded).toBe(true);
    await ask("리신 궁은 속박먼저하고 날라가나?");
    await expect(page.getByText(/주 대상은 먼저 속박되고, 그다음 발차기로 밀쳐집니다/).last()).toBeVisible();
    await expect(page.getByRole("button", { name: "R 용의 분노", exact: true }).last()).toBeVisible();
  });
  test(`CC 해제 후속 질문과 슬롯 변경: ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const ask = await openAdvisor(page);
    await ask("나미 Q CC 종류 알려줘");
    await expect(page.getByRole("img", { name: "나미 Q 물의 감옥", exact: true })).toBeVisible();
    await ask("그럼 수은은?");
    await expect(page.getByText(/정화·수은·미카엘로 기절을 해제할 수 있습니다/).last()).toBeVisible();
    await ask("R은 수은으로 풀려?");
    await expect(page.getByRole("heading", { name: /^나미 R / }).last()).toBeVisible();
    await expect(page.getByText(/에어본 중에는 수은을 사용할 수도 없습니다/).last()).toBeVisible();
    await ask("그럼 강타는?");
    await expect(page.getByText(/강타 사용을 막지 않습니다/).last()).toBeVisible();
    await ask("수호천사 부활 중 강타 써져?");
    await expect(page.getByText(/수호천사가 발동해 부활을 기다리는 동안에는 강타를 쓸 수 없습니다/).last()).toBeVisible();
    await ask("말자하 궁 정화로 풀려?");
    await expect(page.getByText(/정화로 제압을 풀 수 없습니다/).last()).toBeVisible();
    await ask("그럼 수은은?");
    await expect(page.getByText(/말자하 궁극기의 연결 피해/).last()).toBeVisible();
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
