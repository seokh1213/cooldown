import { expect, test, type Locator, type Page } from "@playwright/test";
import { translations } from "../src/i18n/translations";
import { readFileSync } from "node:fs";
import { decodeDataManifest } from "../src/data/contracts/dataManifest";

async function expectColumnOwnership(page: Page) {
  for (const slot of ["Q", "W", "E", "R"]) {
    for (const side of ["mine", "opponent"]) {
      const header = page.getByTestId("vs-" + side + "-" + slot);
      await expect(header.locator("[data-skill-icon]")).toBeVisible();
      const box = (await header.boundingBox())!;
      for (const cell of await page.locator('td[headers$="vs-' + side + '-' + slot + '"]').all()) {
        const valueBox = (await cell.boundingBox())!;
        expect(valueBox.x).toBeCloseTo(box.x, 0);
        expect(valueBox.width).toBeCloseTo(box.width, 0);
        expect(valueBox.width).toBeGreaterThan(90);
      }
    }
  }
}

for (const locale of ["ko_KR", "en_US", "zh_CN"] as const) {
  test(`matrix groups five ranks and keeps passive explanations open: ${locale}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript((language) => localStorage.setItem("language", language), locale);
    await page.goto("./vs?a=Aatrox&t=Fiora");
    const t = translations[locale];
    await expect(page.getByTestId("vs-mine-P").getByRole("heading")).not.toHaveText("—");
    await expect(page.locator('th[scope="colgroup"]')).toHaveText(["Q", "W", "E", "R"]);
    await expect(page.locator("[data-rank-row] > th")).toHaveText(["1", "2", "3", "4", "5"]);
    await expect(page.locator("table").getByTestId("vs-mine-P")).toHaveCount(0);
    await expect(page.getByTestId("vs-mine-P").locator("[data-ability-body]")).toBeVisible();
    await expect(page.getByTestId("vs-opponent-P").locator("[data-ability-body]")).toBeVisible();
    await expect(page.locator("details")).toHaveCount(0);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await expect(page.getByText(t.comparison.rankSeconds, { exact: true })).toHaveCount(1);
    expect((await page.locator("[data-cooldown-notes]").allTextContents()).join(" ")).not.toMatch(/원문|原文|source/i);
    const qButton = page.getByTestId("vs-mine-Q").getByRole("button");
    await qButton.locator("[data-skill-icon]").hover();
    await expect(page.getByRole("tooltip")).toContainText(t.comparison.mine === "내 챔피언" ? "다르킨의 검" : /Aatrox|亚托克斯/);
    await page.keyboard.press("Escape");
    await qButton.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog").locator("[data-ability-body]")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(qButton).toBeFocused();
  });
}

async function expectHealingIcons(container: Locator) {
  const health = container.locator('img.stat-icon[src$="/scalehealth.png"]').last();
  const power = container.locator('img.stat-icon[src$="/scaleap.png"]').last();
  for (const [icon, percentage] of [[health, "6%"], [power, "54%"]] as const) {
    await expect(icon).toBeVisible();
    await expect(icon).toHaveCSS("box-shadow", "none");
    expect(await icon.evaluate((element) => element.nextSibling?.textContent)).toContain(percentage);
  }
  await expect(container.locator("img.stat-icon")).toHaveCount(6);
}

for (const locale of ["ko_KR", "en_US", "zh_CN"] as const) {
  for (const theme of ["light", "dark"] as const) {
    for (const width of [1440, 360]) {
      test(`grouped champion columns and Nunu icons: ${locale} ${theme} ${width}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
        await page.addInitScript((language) => localStorage.setItem("language", language), locale);
        await page.goto("./vs?a=Nunu&t=Fiora");
        const t = translations[locale];
        const q = page.getByTestId("vs-mine-Q");
        await expect(q.getByRole("button")).toBeEnabled();
        await expect(page.locator('[data-cooldown-notes][data-side=opponent][data-slot=Q]')).toContainText("50%");
        await expectColumnOwnership(page);
        await q.getByRole("button").click();
        await expectHealingIcons(page.getByRole("dialog"));
        await expect(page.getByRole("combobox")).toHaveCount(0);
        await page.screenshot({ path: testInfo.outputPath("nunu-icons.png"), animations: "disabled" });
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(q.getByRole("button")).toBeFocused();
        await q.getByRole("button").scrollIntoViewIfNeeded();
        const scroll = page.locator("[data-cooldown-scroll]");
        await scroll.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
        await expect(page.getByTestId("vs-opponent-R").getByRole("button")).toBeInViewport();
        await page.evaluate(() => window.scrollTo(0, 700));
        await expect.poll(async () => (await page.locator("#vs-header-mine").boundingBox())?.y).toBeCloseTo(61, 0);
        await expect(page.getByRole("region", { name: t.comparison.mine, exact: true })).toBeInViewport();
        await expect(page.getByRole("region", { name: t.comparison.opponent, exact: true })).toBeInViewport();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath("vs-sticky.png"), animations: "disabled" });
      });
    }
  }
}

test("Nunu healing icons also render without shadows in the existing cooldown tooltip", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "챔피언 추가하기" }).click();
  await page.getByRole("button", { name: "Select 누누와 윌럼프", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByAltText("Q", { exact: true }).hover();
  await expectHealingIcons(page.getByRole("tooltip"));
});

test("serves the synchronized release, not just a new version label", async ({ page }) => {
  const expected = decodeDataManifest(JSON.parse(readFileSync(new URL("../public/data/version.json", import.meta.url), "utf8")));
  const response = await page.request.get("./data/version.json");
  const manifest = await response.json();
  expect(manifest.patchVersion).toBe(expected.patchVersion);
  expect(manifest.sources).toEqual(expected.sources);
  const championResponse = page.waitForResponse((entry) => entry.url().endsWith(`/${expected.patchVersion}/champions/ko_KR/Nunu.json`));
  await page.goto("./vs?a=Nunu&t=Fiora");
  const champion = await (await championResponse).json();
  expect(champion.champion.abilities.Q.bodyHtml).toContain("[[si:scalehealth]]6%");
  expect(champion.champion.abilities.Q.bodyHtml).toContain("[[si:scaleap]]54%");
  await expect(page.locator("main")).toContainText(expected.patchVersion);
});
