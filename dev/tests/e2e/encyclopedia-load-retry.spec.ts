import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { decodeDataManifest } from "../../../src/domain/game/contracts/dataManifest";
import {
  decodeNormalizedItems,
  decodeNormalizedRunes,
  decodeNormalizedSummoners,
} from "../../../src/domain/game/contracts/normalizedDataDecoder";
import { translations } from "../../../src/shared/i18n/translations";
import type { Language } from "../../../src/shared/i18n";

const manifest = decodeDataManifest(JSON.parse(readFileSync(new URL("../../../public/data/version.json", import.meta.url), "utf8")));
const files = { items: "items-normalized", runes: "runes-normalized", summoner: "summoner-normalized" } as const;
type CatalogTab = keyof typeof files;

function fixtureFor(tab: CatalogTab, locale: Language): unknown {
  return JSON.parse(readFileSync(new URL(`../../../public/data/${manifest.patchVersion}/${files[tab]}-${locale}.json`, import.meta.url), "utf8"));
}

async function expectCatalogInteraction(page: Page, tab: CatalogTab, locale: Language, width: number) {
  const t = translations[locale];
  if (tab === "items") {
    const item = decodeNormalizedItems(fixtureFor(tab, locale)).items.find((entry) => entry.id === "3057")!;
    const search = page.getByRole("textbox", { name: t.encyclopedia.items.searchPlaceholder, exact: true });
    await search.fill(item.name);
    await page.locator('button:has([data-sprite="3057"]), button:has(img[src*="/3057."])').first().click();
    await expect(page.getByTestId("item-detail")).toContainText(item.name);
    if (width < 768) await expect(page.getByRole("dialog")).toBeVisible();
  } else if (tab === "runes") {
    const rune = decodeNormalizedRunes(fixtureFor(tab, locale)).runes[0];
    const button = page.getByRole("button").filter({ hasText: rune.name }).first();
    await expect(button).toBeVisible();
    if (width < 768) {
      await button.click();
      await expect(page.getByRole("dialog")).toContainText(rune.name);
    } else {
      await button.hover();
      await expect(page.getByRole("tooltip")).toContainText(rune.name);
    }
  } else {
    const spells = decodeNormalizedSummoners(fixtureFor(tab, locale)).spells;
    await expect(page.locator("[data-summoner-spell]")).toHaveCount(spells.filter((spell) => spell.modes.includes("CLASSIC")).length);
    const flash = spells.find((spell) => spell.id === "SummonerFlash")!;
    await page.getByRole("textbox", { name: t.encyclopedia.summoner.searchPlaceholder, exact: true }).fill(flash.name);
    await expect(page.locator("[data-summoner-spell]")).toHaveCount(1);
    await expect(page.locator('[data-summoner-spell="SummonerFlash"]')).toContainText(flash.name);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.describe("encyclopedia loading recovery", () => {
  test.use({ serviceWorkers: "block" });
  for (const tab of Object.keys(files) as CatalogTab[]) {
    for (const failure of [
      { name: "HTTP 503", status: 503, body: "unavailable", locale: "ko_KR", width: 390 },
      { name: "invalid JSON", status: 200, body: "{", locale: "en_US", width: 1440 },
      { name: "invalid schema", status: 200, body: "{}", locale: "zh_CN", width: 390 },
    ] as const) {
      test(`${tab}: ${failure.name} retries and keeps catalog interaction`, async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.setViewportSize({ width: failure.width, height: 844 });
        await page.addInitScript((locale) => localStorage.setItem("language", locale), failure.locale);
        const t = translations[failure.locale];
        let failed = true;
        let requests = 0;
        let releaseFailure!: () => void;
        let releaseSuccess!: () => void;
        const failureGate = new Promise<void>((resolve) => { releaseFailure = resolve; });
        const successGate = new Promise<void>((resolve) => { releaseSuccess = resolve; });
        const url = new RegExp(`/${files[tab]}-${failure.locale}\\.json(?:\\?.*)?$`);
        await page.route(url, async (route) => {
          requests += 1;
          if (failed) {
            await failureGate;
            await route.fulfill({ status: failure.status, contentType: "application/json", body: failure.body });
          } else {
            await successGate;
            await route.fulfill({ json: fixtureFor(tab, failure.locale) });
          }
        });

        await page.goto(`./encyclopedia?tab=${tab}`);
        await expect(page.getByRole("status").filter({ hasText: t.championSelector.loading })).toBeVisible();
        await expect(page.getByText(t.championSelector.emptyList, { exact: true })).toHaveCount(0);
        releaseFailure();
        await expect(page.getByRole("alert")).toContainText(t.app.loadError);
        await expect(page.getByText(t.championSelector.emptyList, { exact: true })).toHaveCount(0);

        const beforeRetry = requests;
        failed = false;
        await page.getByRole("button", { name: t.app.retry, exact: true }).click();
        await expect(page.getByRole("status").filter({ hasText: t.championSelector.loading })).toBeVisible();
        await expect(page.getByRole("alert")).toHaveCount(0);
        await expect.poll(() => requests).toBeGreaterThan(beforeRetry);
        releaseSuccess();
        await expectCatalogInteraction(page, tab, failure.locale, failure.width);
        expect(errors).toEqual([]);
      });
    }

    test(`${tab}: a valid empty collection stays distinct from an error`, async ({ page }) => {
      const fixture = fixtureFor(tab, "ko_KR") as Record<string, unknown>;
      const empty = { ...fixture, ...(tab === "items" ? { items: [] } : tab === "runes" ? { runes: [], statShards: [] } : { spells: [] }) };
      await page.route(new RegExp(`/${files[tab]}-ko_KR\\.json(?:\\?.*)?$`), (route) => route.fulfill({ json: empty }));
      await page.goto(`./encyclopedia?tab=${tab}`);
      await expect(page.getByText(translations.ko_KR.championSelector.emptyList, { exact: true })).toBeVisible();
      await expect(page.getByRole("alert")).toHaveCount(0);
      await expect(page.getByRole("button", { name: translations.ko_KR.app.retry, exact: true })).toHaveCount(0);
    });

    test(`${tab}: an abandoned failed request leaves the next tab usable`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const tabs = Object.keys(files) as CatalogTab[];
      const next = tabs[(tabs.indexOf(tab) + 1) % tabs.length];
      let release!: () => void;
      const pending = new Promise<void>((resolve) => { release = resolve; });
      const url = new RegExp(`/${files[tab]}-ko_KR\\.json(?:\\?.*)?$`);
      await page.route(url, async (route) => {
        await pending;
        await route.fulfill({ status: 503, body: "unavailable" });
      });
      await page.goto(`./encyclopedia?tab=${tab}`);
      await expect(page.getByRole("status").filter({ hasText: translations.ko_KR.championSelector.loading })).toBeVisible();
      await page.getByRole("group", { name: translations.ko_KR.sidebar.encyclopedia })
        .getByRole("button", { name: translations.ko_KR.encyclopedia.tabs[next], exact: true }).click();
      const failed = page.waitForResponse((response) => url.test(response.url()) && response.status() === 503);
      release();
      await failed;
      await expectCatalogInteraction(page, next, "ko_KR", 1280);
      await expect(page.getByRole("alert")).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
});
