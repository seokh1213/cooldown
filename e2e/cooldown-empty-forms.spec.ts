import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { decodeDataManifest } from "../src/data/contracts/dataManifest";
import type { ChampionDetailV2 } from "../src/data/contracts/championData";

const manifest = decodeDataManifest(JSON.parse(readFileSync(new URL("../public/data/version.json", import.meta.url), "utf8")));
const jayce: ChampionDetailV2 = JSON.parse(readFileSync(new URL(`../public/data/${manifest.patchVersion}/champions/ko_KR/Jayce.json`, import.meta.url), "utf8"));

for (const width of [1440, 390]) {
  test(`original cooldown distinguishes missing, partial and zero form values at ${width}px`, async ({ page, context }) => {
    const fixture = structuredClone(jayce);
    const forms = fixture.champion.abilities.Q.forms!;
    forms[0].cooldownSeconds = [0, 0];
    forms[1].cooldownSeconds = [0, 8, 8];
    // The PWA can own this fetch, so intercept the whole isolated browser context.
    await context.route("**/champions/ko_KR/Jayce.json", (route) => route.fulfill({ json: fixture }));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("./");
    await page.getByRole("button", { name: "챔피언 추가하기" }).click();
    await page.getByRole("button", { name: "Select 제이스", exact: true }).click();
    await page.keyboard.press("Escape");
    const rank = (value: number) => page.locator(`[data-skill-rank="JayceToTheSkies"][data-rank="${value}"]:visible`);
    await expect(rank(1).locator("[data-form-value]")).toHaveText(["0초", "0초"]);
    await expect(rank(3).locator("[data-form-value]")).toHaveText(["—", "8초"]);
    await expect(rank(4)).toHaveText("—");
    await expect(rank(4).locator("[data-rank-form]")).toHaveCount(0);
  });
}

for (const width of [1440, 390]) {
  test(`VS keeps compact ranks and readable form labels at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("./vs?a=Jayce&t=Nidalee");
    const row = page.locator('[data-rank-row="1"]');
    await expect(row).toBeVisible();
    expect((await row.boundingBox())!.height).toBeLessThanOrEqual(44);
    const labels = page.getByTestId("vs-mine-Q").locator("[data-form-labels]");
    await expect(labels).toHaveText("A 해머B 캐논");
    for (const label of await labels.locator("span").all()) {
      expect(await label.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    const q = row.locator('td[headers$="vs-mine-Q"]');
    const a = (await q.locator('[data-form-cooldown="A"]').boundingBox())!;
    const b = (await q.locator('[data-form-cooldown="B"]').boundingBox())!;
    expect(a.y).toEqual(b.y);
    expect(a.x + a.width).toBeLessThan(b.x);
    if (width === 1440) await expect(page.locator('[data-rank-row="6"]')).toBeInViewport({ ratio: 1 });
  });
}
