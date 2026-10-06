import { expect, test } from "@playwright/test";

test("늦은 기기 확인이 모델 없이 시작한 채팅 입력창을 없애지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", { value: { requestAdapter: () => new Promise(resolve => {
      Object.assign(window, { completeAdapterCheck: () => resolve({ features: new Set(["shader-f16"]) }) });
    }) } });
  });
  await page.goto("./");
  await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
  const input = page.getByRole("textbox", { name: "롤 질문 입력", exact: true });
  await expect(input).toBeHidden();
  await expect(page.getByRole("button", { name: "내려받고 시작", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "모델 없이 써보기", exact: true }).click();
  await input.fill("바론 공격력 알려줘");
  await page.evaluate(() => (window as unknown as { completeAdapterCheck(): void }).completeAdapterCheck());
  await expect(input).toBeVisible();
  await expect(input).toHaveValue("바론 공격력 알려줘");
  await expect(page.getByRole("button", { name: "모델 없이 써보기", exact: true })).toBeHidden();
});

test.use({ serviceWorkers: "block" });

test("기기 확인 뒤 모델을 지원하지 않아도 키보드 포커스를 유지한다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", { value: { requestAdapter: () => new Promise(resolve => {
      Object.assign(window, { finishUnsupportedCheck: () => resolve(null) });
    }) } });
  });
  await page.goto("./");
  const trigger = page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  await page.evaluate(() => (window as unknown as { finishUnsupportedCheck(): void }).finishUnsupportedCheck());
  await expect(page.getByRole("textbox", { name: "롤 질문 입력", exact: true })).toBeVisible();
  await expect.poll(() => dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

const widgetModule = /\/AdvisorWidget(?:-[^/]+\.js|\.tsx)(?:\?.*)?$/;
const launcher = "롤 지식 도우미 열기";
const questionLabel = "롤 질문 입력";

async function openAdvisor(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: launcher, exact: true }).click();
  const skip = page.getByRole("button", { name: "모델 없이 써보기", exact: true });
  const input = page.getByRole("textbox", { name: questionLabel, exact: true });
  await expect(input.or(skip)).toBeVisible();
  if (await skip.isVisible()) await skip.click();
  return input;
}

test("first visit defers advisor code and data, then preserves the conversation on close", async ({ page }) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await page.getByRole("button", { name: launcher, exact: true }).waitFor();
  await page.waitForLoadState("networkidle");
  expect(requests.filter((url) => widgetModule.test(url))).toHaveLength(0);
  expect(requests.filter((url) => url.includes("advisor-knowledge.json"))).toHaveLength(0);
  const input = await openAdvisor(page);
  await input.fill("오공 콤보 알려줘");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(page.getByText(/오공 콤보는 상황별로/)).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "닫기", exact: true }).click();
  await openAdvisor(page);
  await expect(page.getByText(/오공 콤보는 상황별로/)).toBeVisible();
  expect(requests.filter((url) => widgetModule.test(url))).toHaveLength(1);
  expect(requests.filter((url) => /huggingface\.co|\/ort\//.test(url))).toHaveLength(0);
  expect(errors).toEqual([]);
});

test("a failed advisor chunk leaves the page usable and recovers through reload", async ({ page }) => {
  let failures = 1;
  await page.route(widgetModule, (route) => failures-- > 0 ? route.abort() : route.continue());
  await page.goto("./");
  await page.getByRole("button", { name: launcher, exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("데이터를 불러오지 못했습니다.");
  await expect(page.getByRole("heading", { name: "챔피언을 선택하세요", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await openAdvisor(page);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("previously granted model consent retains background advisor activation", async ({ page }) => {
  const modules: string[] = [];
  await page.addInitScript(() => localStorage.setItem("cooldown.advisor.consent.v1", "granted"));
  page.on("request", (request) => { if (widgetModule.test(request.url())) modules.push(request.url()); });
  // This verifies activation without downloading real model weights.
  await page.route(/huggingface\.co|\/ort\//, (route) => route.abort());
  await page.goto("./");
  await expect.poll(() => modules.length).toBe(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await openAdvisor(page);
  expect(modules).toHaveLength(1);
});

for (const width of [390, 1440]) {
  test(`advisor keyboard focus and Escape restore the launcher: ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("./");
    const trigger = page.getByRole("button", { name: launcher, exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    if (width < 768) {
      await expect(dialog).toHaveAttribute("aria-modal", "true");
      for (let i = 0; i < 16; i += 1) {
        await page.keyboard.press(i % 2 ? "Shift+Tab" : "Tab");
        expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
      }
      const button = page.locator("main button").last();
      await button.evaluate((node: HTMLElement) => node.focus());
      await expect.poll(() => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    } else {
      await expect(dialog).not.toHaveAttribute("aria-modal", "true");
      const button = page.getByRole("button", { name: "챔피언 추가하기", exact: true });
      await button.focus();
      await expect(button).toBeFocused();
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}

test("current data failure exposes retry while restoring stored conversation", async ({ page }) => {
  const saved = [{ id: "saved", title: "기록 보존", createdAt: "2026-10-06T00:00:00Z", updatedAt: "2026-10-06T00:00:00Z", turns: [{ id: 0, role: "user", content: "기록 보존" }, { id: 1, role: "assistant", content: "저장된 답변", code: true }] }];
  await page.addInitScript((conversations) => localStorage.setItem("cooldown.advisor.conversations.v1", JSON.stringify(conversations)), saved);
  let failed = true;
  let attempts = 0;
  await page.route("**/advisor-knowledge.json", (route) => {
    attempts += 1;
    return failed ? route.fulfill({ status: 503, body: "unavailable" }) : route.continue();
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  const input = await openAdvisor(page);
  await expect(page.getByRole("alert")).toContainText("데이터를 불러오지 못했습니다.");
  await expect(page.getByText("이전 대화를 불러오는 중이에요. 질문을 미리 입력할 수 있어요.", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("cooldown.advisor.conversations.v1") ?? "[]")[0].id)).toBe("saved");
  await expect(page.getByText("저장된 답변", { exact: true })).toBeVisible();
  failed = false;
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page.getByText("저장된 답변", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await input.fill("새 질문");
  await expect(page.getByRole("button", { name: "보내기", exact: true })).toBeEnabled();
  expect(attempts).toBe(2);
  expect(errors).toEqual([]);
});
