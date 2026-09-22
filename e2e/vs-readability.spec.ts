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
        expect(valueBox.width).toBeGreaterThan(page.viewportSize()!.width >= 1024 ? 80 : 30);
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
    await expect(page.locator('th[scope="colgroup"]')).toHaveCount(2);
    await expect(page.locator('th[scope="colgroup"]').first()).toContainText(/아트록스|Aatrox|亚托克斯/);
    await expect(page.locator("[data-rank-row] > th")).toHaveText(["1", "2", "3", "4", "5"]);
    await expect(page.locator("table").getByTestId("vs-mine-P")).toHaveCount(0);
    await expect(page.getByTestId("vs-mine-P").locator("[data-ability-body]")).toBeVisible();
    await expect(page.getByTestId("vs-opponent-P").locator("[data-ability-body]")).toBeVisible();
    await expect(page.locator("details")).toHaveCount(0);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await expect(page.locator('[data-ability-info][data-side="mine"] [data-ability-body]')).toHaveCount(5);
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
        await expect(page.locator('[data-ability-info][data-side=opponent][data-slot=Q]')).toContainText("50%");
        await expectColumnOwnership(page);
        await q.getByRole("button").click();
        await expectHealingIcons(page.getByRole("dialog"));
        await expect(page.getByRole("combobox")).toHaveCount(0);
        await page.screenshot({ path: testInfo.outputPath("nunu-icons.png"), animations: "disabled" });
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(q.getByRole("button")).toBeFocused();
        await q.getByRole("button").scrollIntoViewIfNeeded();
        await expect(page.getByTestId("vs-opponent-R").getByRole("button")).toBeInViewport();
        // Both champion headers share the top table row with their own skill columns beneath them.
        const mineBox = (await page.locator("#vs-header-mine").boundingBox())!;
        const opponentBox = (await page.locator("#vs-header-opponent").boundingBox())!;
        expect(Math.abs(mineBox.y - opponentBox.y)).toBeLessThan(2);
        /*
         * 카드는 제 스킬 열 위에 걸치되, 두 챔피언 사이 여백만큼은 물러서 있어야 한다.
         *
         * 예전에는 오차를 12px 로 못 박았다. 그때는 경계 여백이 8px 이었기 때문이다.
         * 두 챔피언을 세로선이 아니라 여백으로 가르기로 하면서 그 값이 넓어졌으므로
         * (sm 이상 16px), 고정값 대신 **실제 여백을 읽어** 견준다. 여백을 다시
         * 손대도 시험이 같이 따라온다.
         */
        const gutter = await page.evaluate(() => {
          const mine = document.querySelector("#vs-header-mine")?.closest("th");
          const opponent = document.querySelector("#vs-header-opponent")?.closest("th");
          if (!mine || !opponent) return { right: 0, left: 0 };
          return {
            right: parseFloat(getComputedStyle(mine).paddingRight),
            left: parseFloat(getComputedStyle(opponent).paddingLeft),
          };
        });
        expect(gutter.right).toBeGreaterThan(0);
        expect(gutter.left).toBeGreaterThan(0);
        const mineR = (await page.getByTestId("vs-mine-R").boundingBox())!;
        expect(mineBox.x + mineBox.width).toBeGreaterThanOrEqual(mineR.x + mineR.width - gutter.right - 2);
        expect((await page.getByTestId("vs-opponent-Q").boundingBox())!.x).toBeGreaterThanOrEqual(opponentBox.x - gutter.left - 2);
        // 두 챔피언 사이에 세로선을 긋지 않는다. 아래 두 구역과 같이 여백으로만 가른다.
        const rules = await page.evaluate(() => {
          const table = document.querySelector("#vs-header-opponent")?.closest("table");
          if (!table) return -1;
          return [...table.querySelectorAll("th,td")].filter((cell) => parseFloat(getComputedStyle(cell).borderLeftWidth) > 0).length;
        });
        expect(rules).toBe(0);
        await expect(page.getByRole("region", { name: t.comparison.mine, exact: true })).toBeVisible();
        await expect(page.getByRole("region", { name: t.comparison.opponent, exact: true })).toBeVisible();
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
