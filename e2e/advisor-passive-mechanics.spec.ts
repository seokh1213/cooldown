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
  await expect(page.getByText(/(?:두 번째|추가) 공격.*취소하면.*이동 속도/).filter({ visible: true }).last()).toBeVisible();
  await expect(page.getByText("어느 쪽을 물으신 건가요?", { exact: true })).toHaveCount(0);

  await page.reload();
  await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
  await ask("그럼 평타 세대 맞추면?");
  await expect(page.getByText(/(?:세 번째|3회 적중).*마법 피해/).filter({ visible: true }).last()).toBeVisible();
  await expect(page.getByText(/(?:대상이 챔피언|대상 종류: 챔피언).*보호막/).filter({ visible: true }).last()).toBeVisible();

  await ask("파이크는 체력 템 가면 어떻게되지?");
  await expect(page.getByRole("img", { name: "파이크 P 가라앉은 자들의 축복", exact: true })).toBeVisible();
  await expect(page.getByText(/추가 최대 체력.*추가 공격력.*전환.*체력 14당 (?:추가 )?공격력 1/s).filter({ visible: true }).last()).toBeVisible();
  await expect(page.getByText(/요청한 내용에 맞는 근거/)).toHaveCount(0);
  await expect(page.getByText("회복 · 추가 공격력 800%", { exact: true })).toHaveCount(0);
  await ask("그럼 체력템 사면?");
  await expect(page.getByText(/체력 14당 (?:추가 )?공격력 1/).filter({ visible: true }).last()).toBeVisible();

  await ask("파이크 체력 70짜리 템 두 개면?");
  await expect(page.getByText(/추가 공격력 10입니다/).filter({ visible: true }).last()).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
  await ask("아 42로 바꿔줘");
  await expect(page.getByText(/추가 공격력 3입니다/).filter({ visible: true }).last()).toBeVisible();
  await ask("아크샨 평타 한 방 치고 두 번째 안 쏘면?");
  await expect(page.getByText(/추가 공격을 취소하면.*이동 속도/).filter({ visible: true }).last()).toBeVisible();
  await ask("그럼 두 발 전부 쏠게. 이속 생겨?");
  await expect(page.getByText(/추가 공격까지 발사하면 취소 조건에 해당하지/).filter({ visible: true }).last()).toBeVisible();
  const icon = page.getByRole("img", { name: "아크샨 P 비열한 싸움", exact: true }).last();
  await expect(icon).toBeVisible();
  await expect.poll(() => icon.evaluate(image => getComputedStyle(image).backgroundImage)).toMatch(/url\(/);
});
