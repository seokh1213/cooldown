import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function swipe(page: Page, from: number, to: number) {
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 160, y: from }] });
  for (let step = 1; step <= 6; step++) await session.send("Input.dispatchTouchEvent", {
    type: "touchMove", touchPoints: [{ x: 160, y: from + (to - from) * step / 6 }],
  });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await session.detach();
}

async function open(page: Page) {
  await page.goto("./");
  await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
  const input = page.getByRole("textbox", { name: "롤 질문 입력", exact: true });
  await expect(input).toBeVisible();
  return input;
}

test("모바일의 AI 버튼·바깥 스크롤·입력창 아래 노출을 없앤다", async ({ page }) => {
  const input = await open(page);
  await expect(page.getByRole("button", { name: "AI 모델", exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).position)).toBe("fixed");
  const initial = await page.evaluate(() => ({ y: window.scrollY, top: document.body.style.top }));
  await page.getByRole("button", { name: "대화 기록", exact: true }).click();
  await swipe(page, 500, 160);
  expect(await page.evaluate(() => ({ y: window.scrollY, top: document.body.style.top }))).toEqual(initial);
  await page.getByRole("button", { name: "돌아가기", exact: true }).click();
  await input.fill("자헨 콤보 알려줘");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(page.getByText(/자헨 콤보는 상황별로/)).toBeVisible();
  await page.getByRole("button", { name: "대화 기록", exact: true }).click();
  await page.getByRole("button", { name: /자헨 콤보 알려줘/ }).click();
  await expect(input).toBeVisible();
  for (const height of [844, 500, 844]) {
    await page.setViewportSize({ width: 390, height });
    await input.focus();
    await expect.poll(async () => {
      const box = await input.boundingBox();
      return Math.round(height - (box!.y + box!.height));
    }).toBeGreaterThanOrEqual(24);
    const layout = await page.getByRole("dialog").evaluate(node => {
      const footer = node.querySelector("footer")!;
      const box = node.getBoundingClientRect();
      return { height: box.height, bottom: box.bottom, padding: Number.parseFloat(getComputedStyle(footer).paddingBottom),
        background: getComputedStyle(footer).backgroundColor, panelBackground: getComputedStyle(node).backgroundColor };
    });
    expect(layout.bottom).toBeLessThanOrEqual(height + 1);
    expect(layout.height).toBeLessThanOrEqual(height + 1);
    expect(layout.padding).toBeGreaterThanOrEqual(24);
    expect(layout.background).toBe(layout.panelBackground);
  }
  await page.screenshot({ path: "research/champion-combos/screenshots/mobile-layout.png" });
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  expect(await page.evaluate(() => document.body.style.position)).toBe("");
});

test("긴 기록 목록은 안에서 스크롤하고 키보드 높이가 달라져도 입력창을 보인다", async ({ page }) => {
  await page.addInitScript(() => {
    const conversations = Array.from({ length: 20 }, (_, i) => ({ id: `mobile-history-${i}`, title: `대화 기록 ${i}`,
      createdAt: "2026-10-05T00:00:00.000Z", updatedAt: "2026-10-05T00:00:00.000Z",
      turns: [{ id: 0, role: "user", content: `대화 기록 ${i}` }, { id: 1, role: "assistant", content: "저장된 답변" }] }));
    localStorage.setItem("cooldown.advisor.conversations.v1", JSON.stringify(conversations));
  });
  await open(page);
  await page.getByRole("button", { name: "대화 기록", exact: true }).click();
  const history = page.getByRole("dialog").locator("ul").locator("..");
  await swipe(page, 600, 170);
  await expect.poll(() => history.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole("button", { name: /대화 기록 19/ }).click();
  await expect(page.getByText("저장된 답변", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, "height", { configurable: true, value: 430 });
    Object.defineProperty(window.visualViewport, "offsetTop", { configurable: true, value: 35 });
    window.visualViewport!.dispatchEvent(new Event("resize"));
    window.visualViewport!.dispatchEvent(new Event("scroll"));
  });
  const panel = await page.getByRole("dialog").boundingBox();
  const input = await page.getByRole("textbox", { name: "롤 질문 입력", exact: true }).boundingBox();
  expect(panel!.y).toBe(35);
  expect(panel!.height).toBe(430);
  expect(input!.y + input!.height).toBeLessThanOrEqual(35 + 430 - 24);
});
