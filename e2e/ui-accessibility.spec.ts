import { expect, test, type Locator, type Page } from "@playwright/test";

async function expectVisibleFocus(page: Page, control: Locator) {
  await page.keyboard.press("Tab");
  await control.focus();
  await expect(control).toHaveCSS("opacity", "1");
  const focus = await control.evaluate((element) => {
    const style = getComputedStyle(element);
    const probe = document.createElement("span");
    probe.style.color = style.getPropertyValue("--tw-ring-color");
    probe.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue("--background");
    document.body.append(probe);
    const colors = getComputedStyle(probe);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    const pixel = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    };
    const ring = pixel(colors.color);
    const background = pixel(colors.backgroundColor);
    probe.remove();
    const luminance = (rgb: number[]) => rgb.slice(0, 3).map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const ringLuminance = luminance(ring);
    const backgroundLuminance = luminance(background);
    return {
      visible: element.matches(":focus-visible"),
      contrast: (Math.max(ringLuminance, backgroundLuminance) + 0.05) /
        (Math.min(ringLuminance, backgroundLuminance) + 0.05),
      alpha: ring[3],
      opacity: Number(style.opacity),
      shadow: style.boxShadow,
    };
  });
  expect(focus.visible).toBe(true);
  expect(focus.shadow).not.toBe("none");
  expect(focus.alpha).toBe(255);
  expect(focus.opacity).toBe(1);
  expect(focus.contrast).toBeGreaterThanOrEqual(3);
}

async function setTheme(page: Page, dark: boolean) {
  await page.evaluate((enabled) => document.documentElement.classList.toggle("dark", enabled), dark);
}

for (const dark of [false, true]) {
  test(`focus is opaque and visible on shared buttons, view controls and rune controls in ${dark ? "dark" : "light"} mode`, async ({ page }) => {
    await page.goto("./vs?a=Jayce&t=Nidalee");
    await setTheme(page, dark);
    await expectVisibleFocus(page, page.getByRole("button", { name: "공유", exact: true }));

    await page.goto("./encyclopedia?tab=runes");
    await setTheme(page, dark);
    await expectVisibleFocus(page, page.getByRole("button", { name: "룬 백과", exact: true }));
    const rune = page.getByRole("button", { name: "집중 공격", exact: true });
    await expectVisibleFocus(page, rune);
    await rune.press("Enter");
    await expectVisibleFocus(page, page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }));
  });
}

for (const width of [360, 767, 768, 1440]) {
  test(`VS controls and dialog close keep suitable hit areas and 16px icons at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("./vs?a=Jayce&t=Nidalee");
    const controls = [
      page.getByRole("button", { name: "내 챔피언과 상대 바꾸기", exact: true }),
      page.getByRole("button", { name: "공유", exact: true }),
      page.getByRole("button", { name: "초기화", exact: true }),
    ];
    for (const control of controls) {
      await expect(control).toBeVisible();
      const bounds = (await control.boundingBox())!;
      expect(bounds.height).toBe(width < 768 ? 44 : 32);
      expect(bounds.width).toBeGreaterThanOrEqual(width < 768 ? 44 : 32);
      const icon = (await control.locator("svg").boundingBox())!;
      expect(icon.width).toBe(16);
      expect(icon.height).toBe(16);
    }
    const first = (await controls[0].boundingBox())!;
    const second = (await controls[1].boundingBox())!;
    expect(second.x - first.x - first.width).toBe(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);

    await page.goto("./encyclopedia?tab=runes");
    await page.getByRole("button", { name: "집중 공격", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "집중 공격", exact: true });
    const close = dialog.getByRole("button", { name: "Close", exact: true });
    await expect(dialog).toBeVisible();
    await expect.poll(async () => (await close.boundingBox())?.width).toBe(width < 768 ? 44 : 16);
    const bounds = (await close.boundingBox())!;
    const icon = (await close.locator("svg").boundingBox())!;
    const content = (await dialog.boundingBox())!;
    expect(bounds.width).toBe(width < 768 ? 44 : 16);
    expect(bounds.height).toBe(width < 768 ? 44 : 16);
    expect(icon.width).toBe(16);
    expect(icon.height).toBe(16);
    expect(icon.y - content.y).toBeCloseTo(17, 0);
    expect(content.x + content.width - icon.x - icon.width).toBeCloseTo(17, 0);
  });
}

test("mobile champion tabs support Enter and Space without moving the drag handles", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.getByRole("button", { name: "챔피언 추가하기" }).click();
  await page.getByRole("button", { name: "Select 제이스", exact: true }).click();
  await page.getByRole("button", { name: "Select 오공", exact: true }).click();
  await page.keyboard.press("Escape");
  const tabs = page.locator("[data-tab-id]");
  const jayce = tabs.getByRole("button", { name: "제이스", exact: true });
  const wukong = tabs.getByRole("button", { name: "오공", exact: true });
  await jayce.focus();
  await page.keyboard.press("Enter");
  await expect(jayce).toHaveAttribute("aria-pressed", "true");
  await expect(wukong).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('[data-skill-rank="JayceToTheSkies"]:visible').first()).toBeVisible();
  await wukong.focus();
  await page.keyboard.press("Space");
  await expect(wukong).toHaveAttribute("aria-pressed", "true");
  await expect(jayce).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('[data-skill-rank="JayceToTheSkies"]:visible')).toHaveCount(0);
  await expect(tabs.getByRole("button", { name: "Drag to reorder", exact: true })).toHaveCount(2);
  await expect(tabs.getByRole("button", { name: "Remove 제이스", exact: true })).toBeVisible();
});

test.describe("tablet touch", () => {
  test.use({ hasTouch: true, viewport: { width: 1024, height: 768 } });
  test("rune tap opens details, Escape closes and restores focus, and keyboard reopens", async ({ page }) => {
    await page.goto("./encyclopedia?tab=runes");
    const rune = page.getByRole("button", { name: "집중 공격", exact: true });
    const dialog = page.getByRole("dialog", { name: "집중 공격", exact: true });
    await rune.tap();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(rune).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(rune).toBeFocused();
  });
});

test("mobile menu traps focus, closes with Escape and restores its trigger", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  const trigger = page.locator('button[aria-label="Open menu"]');
  const closeButton = page.locator('button[aria-label="Close menu"]');
  await expect(trigger).toBeVisible();
  expect((await closeButton.boundingBox())?.x).toBeLessThan(0);
  await trigger.click();
  await expect.poll(async () => (await closeButton.boundingBox())?.x).toBeGreaterThan(0);
  const menu = page.getByRole("dialog", { name: "Primary navigation", exact: true });
  const close = menu.getByRole("button", { name: "Close menu", exact: true });
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute("aria-modal", "true");
  await expect(close).toBeFocused();
  expect(await page.locator("main").evaluate((element) => Boolean(element.closest("[inert]")))).toBe(true);
  await page.keyboard.press("Shift+Tab");
  await expect(menu.getByRole("button").last()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  for (let index = 0; index < 7; index++) {
    await page.keyboard.press("Tab");
    expect(await menu.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.locator("main button").first().evaluate((element: HTMLButtonElement) => element.focus());
  expect(await menu.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await page.locator("main").evaluate((element) => Boolean(element.closest("[inert]")))).toBe(false);
  await page.getByRole("button", { name: "챔피언 추가하기", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("mobile menu closes from its button, backdrop and navigation without leaving background inert", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  const trigger = page.locator('button[aria-label="Open menu"]');
  const menu = page.getByRole("dialog", { name: "Primary navigation", exact: true });
  await trigger.click();
  await menu.getByRole("button", { name: "Close menu", exact: true }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.mouse.click(350, 400);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await menu.getByRole("button", { name: "백과사전", exact: true }).click();
  await expect(page).toHaveURL(/\/encyclopedia$/);
  await expect(trigger).toBeFocused();
  expect(await page.locator("main").evaluate((element) => Boolean(element.closest("[inert]")))).toBe(false);
  await page.getByRole("button", { name: "룬 백과", exact: true }).click();
  await expect(page.getByRole("button", { name: "집중 공격", exact: true })).toBeVisible();
});

test("desktop rail remains nonmodal and resizing an open mobile menu restores page interaction", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.getByRole("dialog", { name: "Primary navigation", exact: true })).toBeHidden();
  const rail = page.getByRole("navigation", { name: "Primary navigation", exact: true });
  await expect(rail).toBeVisible();
  await expect(rail).not.toHaveAttribute("aria-modal", "true");
  await expect.poll(() => page.locator("main").evaluate((element) => Boolean(element.closest("[inert]")))).toBe(false);
  await page.getByRole("button", { name: "챔피언 추가하기", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await rail.getByRole("button", { name: "백과사전", exact: true }).click();
  await expect(page).toHaveURL(/\/encyclopedia$/);
});

test("the 768px navigation boundary keeps the desktop rail and keyboard controls aligned", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("./");
  const rail = page.getByRole("navigation", { name: "Primary navigation", exact: true });
  await expect(rail).toBeVisible();
  await expect(page.getByRole("button", { name: "Open menu", exact: true })).toHaveCount(0);
  expect(await page.locator("nav").evaluate((element) => element.getBoundingClientRect().left)).toBe(64);
  const encyclopedia = rail.getByRole("button", { name: "백과사전", exact: true });
  await encyclopedia.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/encyclopedia$/);
  const language = page.getByRole("button", { name: "언어 선택", exact: true });
  await language.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: "언어 선택", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(language).toBeFocused();
  await page.setViewportSize({ width: 767, height: 900 });
  const menu = page.getByRole("button", { name: "Open menu", exact: true });
  await expect(menu).toBeVisible();
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Primary navigation", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
});

test("champion selection restores its opener or the main workflow when selection removes the opener", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  const add = page.getByRole("button", { name: "챔피언 추가하기", exact: true });
  await add.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: /챔피언/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(add).toBeFocused();
  await add.click();
  await page.getByRole("button", { name: "Select 아리", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("mobile tutorial returns focus after Escape, close and a resize that hides its opener", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  const help = page.getByRole("button", { name: "사용 방법 안내", exact: true });
  await help.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "사용 방법 안내", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help).toBeFocused();
  await help.click();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await expect(help).toBeFocused();
  await help.click();
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("#main-content")).toBeFocused();
});
