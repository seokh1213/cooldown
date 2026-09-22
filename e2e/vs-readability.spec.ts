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
         * 카드는 제 스킬 열 위에 **딱 맞게** 걸친다.
         *
         * 두 챔피언을 가운데 빈 열이 가르므로 카드와 열의 경계가 같은 자리다. 예전에는
         * 칸 안쪽 여백으로 갈라서 오차를 두고 견뎌야 했는데, 이제는 자를 대고 잴 수 있다.
         */
        const mineR = (await page.getByTestId("vs-mine-R").boundingBox())!;
        const opponentQ = (await page.getByTestId("vs-opponent-Q").boundingBox())!;
        expect(Math.round(mineBox.x + mineBox.width)).toBe(Math.round(mineR.x + mineR.width));
        expect(Math.round(opponentQ.x)).toBe(Math.round(opponentBox.x));
        // 사이에 빈 통로가 실제로 있어야 한다. 여기가 0 이면 두 챔피언이 붙어 버린다.
        expect(opponentQ.x - (mineR.x + mineR.width)).toBeGreaterThan(width >= 640 ? 24 : 4);
        /*
         * 세 구역이 가운데를 같은 자리에서 가른다.
         *
         * 스킬 쿨타임만 왼쪽에 순위 열이 있어서 그 절반인 28px 만큼 가운데가 오른쪽으로
         * 밀려 있었다. 오른쪽에 같은 폭을 비워 맞췄다. 눈으로는 잘 안 보이는 어긋남이라
         * 세 번 놓쳤다. 좌표로 건다.
         *
         * sm 미만에서는 아래 구역이 한 줄로 쌓이므로 맞출 가운데가 없다.
         */
        if (width >= 640) {
          const edges = await page.evaluate(() => {
            const box = (el: Element | null | undefined) => {
              if (!el) return null;
              const r = el.getBoundingClientRect();
              return { left: Math.round(r.left), right: Math.round(r.right) };
            };
            const stats = [...document.querySelectorAll("[data-testid$='-stats']")];
            return { mineCard: box(document.querySelector("#vs-header-mine")), opponentCard: box(document.querySelector("#vs-header-opponent")), mineStats: box(stats[0]), opponentStats: box(stats[1]) };
          });
          expect(edges.mineCard).toEqual(edges.mineStats);
          expect(edges.opponentCard).toEqual(edges.opponentStats);
        }
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

/*
 * 스프라이트가 **맞는 칸**을 가리키는지 본다.
 *
 * 시트에서 자르기 시작한 뒤로 화면과 생성기가 자리를 각각 세었다. 화면은 보여 줄
 * 차례(즐겨찾기 먼저, 그 나라 말 가나다순)로, 생성기는 이름 차례로 세어 둘이
 * 어긋나 있었다 — 가렌 자리에 아트록스, 갈리오 자리에 아리가 나왔다.
 *
 * 그림이 비지 않고 다른 그림이 나오는 고장이라 화면은 조용하고, 단위 시험도
 * 생성기와 자기 자신만 견주고 있어 못 잡았다. 그려진 배경 자리를 되짚어 시트
 * 목록의 몇째 칸인지 계산하면, 실제로 무엇이 보이는지를 확인할 수 있다.
 *
 * 화면이 **전체 목록**을 넘겼는지도 여기서 걸린다. 일부만 넘기면 열 수 셈이
 * 달라져 자리가 통째로 밀리는데, 그 역시 그림만 바뀌고 조용하다.
 */
for (const [tab, sheet, scope] of [
  ["champions", "champions", "[data-champion-grid] "],
  ["items", "items", ""],
  ["runes", "runes", ""],
  ["summoner", "summoners", ""],
] as const) {
  test(`${tab} sprites point at the right cell`, async ({ page }) => {
    const release = decodeDataManifest(JSON.parse(readFileSync(new URL("../public/data/version.json", import.meta.url), "utf8")));
    // 룬 시트만 판본 밖에 있다. 룬 자료에 판본이 안 들어 있기 때문이다.
    const at = sheet === "runes" ? `../public/img/${sheet}.json` : `../public/img/${release.sources.ddragon}/${sheet}.json`;
    const { cols, ids } = JSON.parse(readFileSync(new URL(at, import.meta.url), "utf8")) as { cols: number; ids: string[] };
    await page.goto(`./encyclopedia?tab=${tab}`);
    const icons = page.locator(`${scope}[data-sprite]`);
    await expect(icons.first()).toBeVisible();
    const shown = await icons.evaluateAll(
      (nodes, grid) =>
        nodes.slice(0, 12).map((node) => {
          const element = node as HTMLElement;
          const [x, y] = element.style.backgroundPosition.split(" ").map(Number.parseFloat);
          const rows = Math.ceil(grid.ids.length / grid.cols);
          const column = Math.round((x / 100) * (grid.cols - 1));
          const row = Math.round((y / 100) * (rows - 1));
          return { wants: element.dataset.sprite, shows: grid.ids[row * grid.cols + column] };
        }),
      { cols, ids },
    );
    expect(shown.length).toBeGreaterThan(5);
    for (const { wants, shows } of shown) expect(shows).toBe(wants);
  });
}
