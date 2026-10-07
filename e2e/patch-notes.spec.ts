import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("default patch page follows the published data manifest", async ({ page, request }) => {
  const indexResponse = await request.get("./patch-notes/index.json");
  const manifestResponse = await request.get("./data/version.json");
  expect(indexResponse.ok()).toBe(true);
  expect(manifestResponse.ok()).toBe(true);
  const index = await indexResponse.json();
  const manifest = await manifestResponse.json();
  expect(index.latest).toBe(manifest.patchVersion);
  await page.goto("./patch-notes");
  await expect(page.getByRole("heading", { name: index.latest + " 패치 변경 내역", exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("champion highlights create shareable patch fragments and restore direct links and history", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("./patch-notes?patch=26.19");
  const highlights = page.getByRole("region", { name: "이번 패치 한눈에 보기" });
  const draven = highlights.getByRole("link", { name: "드레이븐", exact: true });
  await expect(draven).toHaveAttribute("href", /\?patch=26.19#patch-Draven$/);
  await page.getByRole("group", { name: "종류" }).getByRole("button", { name: "아이템", exact: true }).click();
  await expect(page.locator("#patch-Draven")).toHaveCount(0);
  await draven.click();
  await expect(page).toHaveURL(/\?patch=26.19#patch-Draven$/);
  await expect.poll(() => page.locator("#patch-Draven").evaluate(node => Math.abs(node.getBoundingClientRect().top - 80))).toBeLessThan(3);
  await page.reload();
  await expect.poll(() => page.locator("#patch-Draven").evaluate(node => Math.abs(node.getBoundingClientRect().top - 80))).toBeLessThan(3);
  await highlights.getByRole("link", { name: "아펠리오스", exact: true }).click();
  await expect(page).toHaveURL(/#patch-Aphelios$/);
  await page.getByRole("group", { name: "종류" }).getByRole("button", { name: "아이템", exact: true }).click();
  await expect(page.locator("#patch-Draven")).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/#patch-Draven$/);
  await expect.poll(() => page.locator("#patch-Draven").evaluate(node => Math.abs(node.getBoundingClientRect().top - 80))).toBeLessThan(3);
  await page.goForward();
  await expect(page).toHaveURL(/#patch-Aphelios$/);
  await expect.poll(() => page.locator("#patch-Aphelios").evaluate(node => Math.abs(node.getBoundingClientRect().top - 80))).toBeLessThan(3);
  await page.getByRole("navigation", { name: "패치 기록" }).getByRole("button", { name: "26.18", exact: true }).click();
  await expect(page).toHaveURL(/\?patch=26.18$/);
  await page.goto("./patch-notes?patch=26.18#patch-Cassiopeia");
  await expect.poll(() => page.locator("#patch-Cassiopeia").evaluate(node => Math.abs(node.getBoundingClientRect().top - 80))).toBeLessThan(3);
});

test("Aphelios weapon images differ and the matching icon is retained in hover and dialog", async ({ page }) => {
  await page.goto("./patch-notes?patch=26.19#patch-Aphelios");
  const weapons = ["Calibrum", "Severum", "Gravitum", "Infernum", "Crescendum"];
  const sources = new Set<string>();
  for (const weapon of weapons) {
    const icon = page.locator(`#patch-Aphelios img[data-patch-spell-icon="Aphelios${weapon}Q"]`);
    await expect(icon).toBeVisible();
    await expect.poll(() => icon.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    sources.add((await icon.getAttribute("src"))!);
  }
  expect(sources.size).toBe(5);
  await expect(page.locator('#patch-Elise img[data-patch-spell-icon="EliseSpiderW"]')).toHaveCount(1);
  await expect(page.locator('#patch-Ryze [data-sprite="Ryze:Q"]')).toHaveCount(1);
  await expect(page.locator('#patch-Ryze img[data-patch-spell-icon="RyzeR"]')).toHaveCount(0);
  const skill = page.getByRole("button", { name: "Q 절단검", exact: true });
  await skill.hover();
  const previewIcon = page.getByRole("tooltip").locator('[data-patch-spell-icon="ApheliosSeverumQ"]');
  await expect(previewIcon).toBeVisible();
  await skill.click();
  const dialogIcon = page.getByRole("dialog").locator('[data-patch-spell-icon="ApheliosSeverumQ"]');
  await expect(dialogIcon).toBeVisible();
  await expect.poll(() => dialogIcon.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});

test("patch skills share desktop hover and click policy, including duplicate slots", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("./patch-notes?patch=26.19");
  await expect(page.getByRole("link", { name: "공식 패치 노트" })).toHaveAttribute("href", "https://www.leagueoflegends.com/ko-kr/news/game-updates/");
  const history = page.getByRole("navigation", { name: "패치 기록" });
  const response = await page.request.get("./patch-notes/index.json");
  const index = await response.json();
  await expect(history.getByRole("button")).toHaveCount(index.patches.length);

  const skill = page.getByRole("button", { name: "W 지옥사슬", exact: true });
  await skill.hover();
  await expect(page.getByRole("tooltip")).toContainText("18/16.5/15/13.5/12초");
  await skill.click();
  await expect(page.getByRole("dialog")).toContainText("18/16.5/15/13.5/12초");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(skill).toBeFocused();
  await expect(page.getByRole("tooltip")).toHaveCount(0);

  await page.getByRole("button", { name: "Q 만월총 · 달빛탄", exact: true }).hover();
  await expect(page.getByRole("tooltip")).toContainText("[Q] 만월총 · 달빛탄");
  await page.getByRole("button", { name: "Q 절단검", exact: true }).hover();
  await expect(page.getByRole("tooltip")).toHaveCount(1);
  await expect(page.getByRole("tooltip")).toContainText("[Q] 절단검");
  await expect(page.getByRole("tooltip")).not.toContainText("[Q] 만월총 · 달빛탄");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await skill.hover();
  await expect(page.getByRole("tooltip")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("patch stat glyphs load and past versions select their own skills", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("./patch-notes?patch=26.19");
  const glyph = page.locator("#patch-Draven img.stat-icon");
  await expect(glyph).toHaveAttribute("src", /\/stat\/scalead\.webp$/);
  await expect.poll(() => glyph.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator("#patch-Draven")).toContainText("62");
  await expect(page.locator("#patch-Draven")).toContainText("64");

  await page.getByRole("navigation", { name: "패치 기록" }).getByRole("button", { name: "26.18", exact: true }).click();
  await expect(page).toHaveURL(/patch=26.18/);
  await expect(page.locator("article")).toHaveCount(8);
  const skill = page.locator("[data-skill-trigger]").first();
  await expect(skill).toHaveAttribute("data-skill-patch", "26.18");
  await skill.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByLabel("스킬 레벨별 수치")).toContainText("65 / 100 / 135 / 170 / 205");
  await page.keyboard.press("Escape");
  await page.getByRole("navigation", { name: "패치 기록" }).getByRole("button", { name: /^26\.19(?: 현재 패치)?$/ }).click();
  await expect(page.locator("article")).toHaveCount(18);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("patch notes fit narrow screens and supported languages", async ({ page }) => {
  await page.goto("./patch-notes?patch=26.19");
  for (const locale of ["ko_KR", "en_US", "zh_CN"]) {
    await page.evaluate(language => localStorage.setItem("language", language), locale);
    await page.reload();
    await expect(page.locator("article")).toHaveCount(18);
    await expect(page.locator("[data-skill-trigger]").first()).toBeVisible();
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
});

test.describe("mobile patch skills", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("expanded highlights update the fragment and restore the champion on reload", async ({ page }) => {
    await page.goto("./patch-notes?patch=26.19");
    await page.getByRole("button", { name: "이번 패치 한눈에 보기", exact: true }).tap();
    await page.getByRole("region", { name: "이번 패치 한눈에 보기" }).getByRole("link", { name: "아펠리오스", exact: true }).tap();
    await expect(page).toHaveURL(/\?patch=26.19#patch-Aphelios$/);
    await expect.poll(() => page.locator("#patch-Aphelios").evaluate(node => Math.abs(node.getBoundingClientRect().top - 80))).toBeLessThan(3);
    await page.reload();
    await expect.poll(() => page.locator("#patch-Aphelios").evaluate(node => Math.abs(node.getBoundingClientRect().top - 80))).toBeLessThan(3);
  });

  test("tap opens a scrollable dialog, returns focus, and never leaves a hover preview", async ({ page }) => {
    await page.goto("./patch-notes?patch=26.19");
    await expect(page.getByRole("link", { name: "공식 패치 노트" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "패치 기록" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "패치 기록" })).toBeHidden();
    const skill = page.getByRole("button", { name: "W 지옥사슬", exact: true });
    const bounds = await skill.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    await skill.tap();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await expect.poll(async () => (await dialog.boundingBox())?.x).toBeGreaterThanOrEqual(16);
    const dialogBounds = await dialog.boundingBox();
    expect((dialogBounds?.x ?? 0) + (dialogBounds?.width ?? 0)).toBeLessThanOrEqual(374);
    await dialog.getByRole("button", { name: "Close", exact: true }).tap();
    await expect(dialog).toHaveCount(0);
    await expect(skill).toBeFocused();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await page.getByRole("combobox", { name: "패치 기록" }).selectOption("26.18");
    await expect(page.locator("article")).toHaveCount(8);
    await expect(page.locator("[data-skill-trigger]").first()).toHaveAttribute("data-skill-patch", "26.18");
  });
});
