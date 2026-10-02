import { expect, test } from "@playwright/test";

for (const width of [390, 1280]) test(`슬롯 없는 평타·체력 전환 질문과 저장한 대화: ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("./");
  await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
  const input = page.getByRole("textbox", { name: "롤 질문 입력", exact: true });
  const skip = page.getByRole("button", { name: "모델 없이 써보기", exact: true });
  await expect(input.or(skip)).toBeVisible();
  if (await skip.isVisible()) await skip.click();
  async function ask(question: string) {
    await input.fill(question);
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    await expect(page.getByRole("button", { name: "중단", exact: true })).toBeHidden();
  }
  await ask("아크샨은 평타 한대 치면 어떻게되지?");
  await expect(page.getByRole("img", { name: "아크샨 P 비열한 싸움", exact: true })).toBeVisible();
  await expect(page.getByText(/두 번째 공격.*취소하면 이동 속도/).last()).toBeVisible();
  await expect(page.getByText("어느 쪽을 물으신 건가요?", { exact: true })).toHaveCount(0);

  await page.reload();
  await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
  await ask("그럼 평타 세대 맞추면?");
  await expect(page.getByText(/세 번째.*마법 피해.*대상이 챔피언.*보호막/).last()).toBeVisible();

  await ask("파이크는 체력 템 가면 어떻게되지?");
  await expect(page.getByRole("img", { name: "파이크 P 가라앉은 자들의 축복", exact: true })).toBeVisible();
  await expect(page.getByText(/추가 최대 체력.*추가 공격력.*전환.*체력 14당 공격력 1/).last()).toBeVisible();
  await expect(page.getByText(/요청한 내용에 맞는 근거/)).toHaveCount(0);
  await expect(page.getByText("회복 · 추가 공격력 800%", { exact: true })).toHaveCount(0);
  await ask("그럼 체력템 사면?");
  await expect(page.getByText(/체력 14당 공격력 1/).last()).toBeVisible();
});
