import { expect, test } from "@playwright/test";

for (const width of [390, 1280]) test(`조건·형태·표시 슬롯의 답변과 저장 복원: ${width}px`, async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
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
  const visibleText = (pattern: RegExp) => page.getByText(pattern).filter({ visible: true }).last();
  await ask("방어력이 100인 상대에게 30% 관통이랑 고정 관통 10이 있으면 어떤 순서로 계산해?");
  await expect(visibleText(/비율 관통.*고정 관통[\s\S]*= 60/)).toBeVisible();
  await ask("이즈리얼 W 마나는 언제 돌려받아?");
  await expect(visibleText(/스킬로.*폭발.*마나.*60/)).toBeVisible();
  await ask("제이스 망치 Q랑 캐논 Q 쿨타임 알려줘");
  await expect(visibleText(/(?:해머|망치).*16\/14\/12\/10\/8\/6/)).toBeVisible();
  await expect(visibleText(/캐논.*8초/)).toBeVisible();
  await ask("아펠리오스 E는 쓰면 무슨 스킬이 나가?");
  await expect(visibleText(/(?:시전|사용|발동).*스킬.*(?:아니|않)/)).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
  await ask("그럼 정화로 풀 수 있어?");
  await expect(visibleText(/(?:시전|사용|발동).*스킬.*(?:아니|않)/)).toBeVisible();
  expect(errors).toEqual([]);
});
