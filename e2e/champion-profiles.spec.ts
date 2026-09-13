import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { translations } from "../src/i18n/translations";
import { decodeDataManifest } from "../src/data/contracts/dataManifest";
import { decodeChampionProfile } from "../src/data/contracts/championProfile";

const manifest = decodeDataManifest(JSON.parse(readFileSync(new URL("../public/data/version.json", import.meta.url), "utf8")));
const profileFor = (locale: string) => decodeChampionProfile(JSON.parse(readFileSync(new URL(`../public/data/${manifest.patchVersion}/champion-profiles/${locale}/Aatrox.json`, import.meta.url), "utf8")));

for (const width of [1440, 360]) {
  test(`encyclopedia menu entry always opens its first tab at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const t = translations.ko_KR;
    const firstTab = page.getByRole("tab").first();
    const openEncyclopedia = async () => {
      if (width < 768) await page.getByRole("button", { name: "Open menu", exact: true }).click();
      await page.getByRole("navigation").getByRole("button", { name: t.sidebar.encyclopedia, exact: true }).click();
    };

    // An explicit tab link is respected, but it must not become the menu default.
    await page.goto("./encyclopedia?tab=runes");
    await expect(page.getByRole("tab", { name: t.encyclopedia.tabs.runes, exact: true })).toHaveAttribute("data-state", "active");
    await openEncyclopedia();
    await expect(page).toHaveURL(/\/cooldown\/encyclopedia$/);
    await expect(firstTab).toHaveText(t.championProfile.tab);
    await expect(firstTab).toHaveAttribute("data-state", "active");
    await expect(page.locator("[data-champion-grid]").getByRole("button")).toHaveCount(173);

    await page.getByRole("tab", { name: t.encyclopedia.tabs.items, exact: true }).click();
    await page.goto("./");
    await openEncyclopedia();
    await expect(firstTab).toHaveAttribute("data-state", "active");
    await page.reload();
    await expect(firstTab).toHaveAttribute("data-state", "active");
    await page.goto("./encyclopedia?tab=unknown");
    await expect(firstTab).toHaveAttribute("data-state", "active");
    await expect(page.locator("[data-champion-grid]")).toBeVisible();
  });
}

for (const locale of ["ko_KR", "en_US", "zh_CN"] as const) {
  for (const width of [1440, 360]) {
    test(`champion encyclopedia: dense default list, skin/story, return flow ${locale} ${width}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((language) => localStorage.setItem("language", language), locale);
      const errors: string[] = [];
      const requests: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => requests.push(request.url()));
      const t = translations[locale];
      const expected = profileFor(locale).champion;
      await page.goto("./encyclopedia");
      await expect(page.getByRole("tab", { name: t.championProfile.tab, exact: true })).toHaveAttribute("data-state", "active");
      const grid = page.locator("[data-champion-grid]");
      await expect(grid.getByRole("button")).toHaveCount(173);
      const columnCount = await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
      expect(columnCount).toBe(width === 1440 ? 16 : 5);
      expect(requests.filter((url) => url.includes("champion-profiles/"))).toHaveLength(0);
      const search = page.getByRole("textbox", { name: t.comparison.select });
      await search.fill("Aatrox");
      await expect(grid.getByRole("button")).toHaveCount(1);
      await grid.getByRole("button", { name: expected.name, exact: true }).click();
      await expect(page).toHaveURL(/champion=Aatrox/);
      await expect(page.locator("[data-champion-lore]")).toHaveText(expected.lore);
      const select = page.getByRole("combobox", { name: t.championProfile.skins, exact: true });
      await expect(select.locator("option")).toHaveCount(expected.skins.length);
      expect(expected.skins.map((skin) => skin.num)).not.toContain(4); // Aatrox chroma, no standalone splash.
      await expect(page.getByRole("button", { name: t.championProfile.previous })).toBeDisabled();
      await page.getByRole("button", { name: t.championProfile.next }).click();
      await expect(select).toHaveValue("1");
      await expect(page.locator("[data-skin-splash]")).toHaveAttribute("src", /Aatrox_1.jpg$/);
      const gapIndex = expected.skins.findIndex((skin, index) => skin.num !== index);
      await select.selectOption(String(gapIndex));
      await expect(page.locator("[data-skin-splash]")).toHaveAttribute("src", new RegExp(`Aatrox_${expected.skins[gapIndex].num}.jpg$`));
      await select.selectOption(String(expected.skins.length - 1));
      await expect(page.getByRole("button", { name: t.championProfile.next })).toBeDisabled();
      await page.getByRole("button", { name: t.championProfile.backToList, exact: true }).click();
      await expect(search).toHaveValue("Aatrox");
      await grid.getByRole("button", { name: expected.name, exact: true }).click();
      await page.goBack();
      await expect(grid).toBeVisible();
      await expect(search).toHaveValue("Aatrox");
      await grid.getByRole("button", { name: expected.name, exact: true }).click();
      await page.reload();
      await expect(page.locator("[data-champion-lore]")).toHaveText(expected.lore);
      await page.getByRole("button", { name: t.comparison.select, exact: true }).click();
      await page.getByRole("button", { name: /Select .*피오라|Select Fiora|Select 无双剑姬/ }).click();
      await expect(page.locator('[data-champion-profile="Fiora"]')).toBeVisible();
      await expect(page.getByRole("combobox", { name: t.championProfile.skins, exact: true })).toHaveValue("0");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath("champion-profile.png"), animations: "disabled" });
    });
  }
}

test.describe("profile failure handling", () => {
test.use({ serviceWorkers: "block" });
test("profile data retry, invalid id rejection and missing image recovery", async ({ page }) => {
  let fail = true;
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.route(/\/champion-profiles\/.*\/Aatrox\.json(?:\?.*)?$/, (route) => fail ? route.fulfill({ status: 503, body: "unavailable" }) : route.continue());
  await page.goto("./encyclopedia?champion=UnknownChampion");
  await expect(page.locator("[data-champion-grid]")).toBeVisible();
  expect(requests.some((url) => url.endsWith("UnknownChampion.json"))).toBe(false);
  await page.getByRole("textbox").fill("Aatrox");
  await page.locator("[data-champion-grid]").getByRole("button").click();
  await expect(page.getByRole("status")).toContainText(translations.ko_KR.app.loadError);
  fail = false;
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page.locator("[data-champion-lore]")).toBeVisible();
  await page.route("**/splash/Aatrox_1.jpg", (route) => route.abort());
  await page.getByRole("button", { name: "다음 스킨" }).click();
  await expect(page.getByText(translations.ko_KR.championProfile.imageError)).toBeVisible();
  await page.unroute("**/splash/Aatrox_1.jpg");
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page.locator("[data-skin-splash]")).toHaveAttribute("src", /Aatrox_1.jpg$/);
});
});

test("cached champion biography and skin list reopen offline", async ({ page, context }) => {
  await page.goto("./encyclopedia?champion=Aatrox");
  await expect(page.locator("[data-champion-lore]")).toHaveText(profileFor("ko_KR").champion.lore);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("[data-champion-lore]")).toHaveText(profileFor("ko_KR").champion.lore);
  await expect(page.getByRole("combobox", { name: "스킨", exact: true }).locator("option")).toHaveCount(profileFor("ko_KR").champion.skins.length);
});

for (const width of [1440, 360]) {
  test(`base + growth stats in VS and cooldown page at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("./vs?a=Aatrox&t=Fiora");
    await expect(page.locator('[data-stat="hp"]').first()).toHaveText("650");
    await expect(page.locator('[data-stat-growth="hp"]').first()).toHaveText("114");
    await expect(page.locator('[data-stat="attackspeed"]').first()).toHaveText("0.651");
    await expect(page.locator('[data-stat-growth="attackspeed"]').first()).toHaveText("2.5%");
    await expect(page.locator('[data-stat="mp"]').first()).toHaveText("0");
    await expect(page.locator('[data-stat-growth="movespeed"]').first()).toHaveText("—");
    await page.goto("./");
    await page.getByRole("button", { name: "챔피언 추가하기" }).click();
    await page.getByRole("button", { name: "Select 아트록스", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("tab", { name: translations.ko_KR.encyclopedia.tabs.stats, exact: true }).click();
    await expect(page.locator('[data-stat="hp"]:visible').first()).toHaveText("650+ 114");
    await expect(page.locator('[data-stat="attackspeed"]:visible').first()).toHaveText("0.651+ 2.5%");
  });
}
