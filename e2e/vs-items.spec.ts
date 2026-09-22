import { expect, test, type Page } from "@playwright/test";
import { translations } from "../src/i18n/translations";

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
}

for (const locale of ["ko_KR", "en_US", "zh_CN"] as const) {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`VS and item details: ${locale} at ${viewport.width}px`, async ({
      page,
    }, testInfo) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize(viewport);
      await page.addInitScript(
        (language) => localStorage.setItem("language", language),
        locale,
      );
      const t = translations[locale];
      await page.goto("./vs?a=Aatrox&t=Fiora");
      const mine = page.getByRole("region", {
        name: t.comparison.mine,
        exact: true,
      });
      const opponent = page.getByRole("region", {
        name: t.comparison.opponent,
        exact: true,
      });
      await expect(mine.getByRole("button")).toBeVisible();
      await expect(opponent.getByRole("button")).toBeVisible();
      const table = page.getByRole("table", {
        name: t.comparison.baseCooldowns,
      });
      await expect(table).toBeVisible();
      await expect(page.locator('[data-cooldown][data-side="mine"][data-slot="Q"]')).toHaveText([
        "14",
        "12",
        "10",
        "8",
        "6",
      ]);
      await expect(page.locator('[data-cooldown][data-side="opponent"][data-slot="Q"]')).toHaveText([
        "13",
        "11.25",
        "9.5",
        "7.75",
        "6",
      ]);
      await expect(page.locator('[data-cooldown][data-side="opponent"][data-slot="R"]')).toHaveText([
        "110",
        "90",
        "70", "—", "—",
      ]);
      await expect(page.locator('[data-ability-info][data-side="opponent"][data-slot="Q"]')).toContainText("50%");
      await expect(page.getByRole("combobox")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: t.sidebar.simulation, exact: true }),
      ).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath("vs.png"),
        animations: "disabled",
      });
      await page.getByTestId("vs-mine-Q").getByRole("button").click();
      await expect(page.getByRole("dialog").locator("[data-ability-body]")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(table).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await page.goto("./encyclopedia?tab=items");
      /*
       * 아이템 번호로만 고른다.
       *
       * 두 번 깨졌다. 아이콘을 WebP 로 바꾸자 `.png` 로 찾던 줄이 죽었고, 목록을
       * 스프라이트로 바꾸자 `<img>` 자체가 사라졌다. 그릴 때마다 붙는 `data-sprite`
       * 와 낱장 `<img>` 를 함께 걸어 둔다.
       */
      await page.locator('button:has([data-sprite="3057"]), button:has(img[src*="/3057."])').first().click();
      const detail = page.getByTestId("item-detail");
      await expect(detail).toContainText(
        `${t.itemDetail.baseAttackDamage} × 100%`,
      );
      await expect(detail).toContainText(t.itemDetail.cooldown);
      await expect(
        detail.getByRole("button", {
          name: t.pages.simulation.addItemToSimulation,
        }),
      ).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath("item.png"),
        animations: "disabled",
      });
      expect(errors).toEqual([]);
    });
  }
}

test("VS pair, swapping, sharing and reset persist without rank selection", async ({
  page,
}) => {
  await page.goto("./vs?a=MonkeyKing&t=Garen&ar=3.1.2.1");
  await expect(page.getByTestId("vs-mine-Q")).toContainText("오공");
  await page.goto("./");
  await page
    .getByRole("button", { name: translations.ko_KR.comparison.title, exact: true })
    .click();
  await expect(page).toHaveURL(/a=MonkeyKing.*t=Garen/);
  const mine = page.getByRole("region", { name: "내 챔피언", exact: true });
  const opponent = page.getByRole("region", {
    name: "상대 챔피언",
    exact: true,
  });
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(page).not.toHaveURL(/ar=/);
  await page.getByRole("button", { name: "내 챔피언과 상대 바꾸기" }).click();
  await expect(
    mine.getByRole("button", { name: "내 챔피언 챔피언 선택" }),
  ).toContainText("가렌");
  await expect(page.getByTestId("vs-opponent-Q")).toContainText("오공");
  await page.getByRole("button", { name: "공유", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("복사");
  await page.reload();
  await expect(page.getByTestId("vs-opponent-Q")).toContainText("오공");
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "챔피언 추가하기" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: translations.ko_KR.comparison.title, exact: true })
    .click();
  await expect(page.getByTestId("vs-opponent-Q")).toContainText("오공");
  await page.getByRole("button", { name: "상대 챔피언 챔피언 선택" }).click();
  await page
    .getByRole("button", { name: "Select 피오라", exact: true })
    .click();
  await expect(opponent.getByRole("button")).toContainText("피오라");
  await expect(page.locator('[data-cooldown][data-side="opponent"][data-slot="Q"]')).toHaveText([
    "13",
    "11.25",
    "9.5",
    "7.75",
    "6",
  ]);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "초기화", exact: true }).click();
  await expect(page.locator("[data-cooldown]")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("[data-cooldown]")).toHaveCount(0);
});

test("shows source-backed melee and ranged item damage", async ({ page }) => {
  await page.goto("./encyclopedia?tab=items");
  await page
    .getByRole("button", { name: /몰락한 왕의 검/ })
    .first()
    .click();
  const detail = page.getByTestId("item-detail");
  await expect(detail).toContainText("근접: 대상 현재 체력 × 9%");
  await expect(detail).toContainText("원거리: 대상 현재 체력 × 6%");
  await expect(
    detail.getByRole("heading", { name: "안개의 검" }),
  ).toBeVisible();
  await expect(
    detail.getByRole("heading", { name: "할퀴는 그림자" }),
  ).toBeVisible();
});

test("reopens the selected VS champions offline", async ({ page, context }) => {
  await page.goto("./vs?a=Aatrox&t=Fiora");
  await expect(page.getByTestId("vs-mine-Q")).toContainText("아트록스");
  await expect(page.getByTestId("vs-opponent-Q")).toContainText("피오라");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await expect(page.getByTestId("vs-opponent-Q")).toContainText("피오라");
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('[data-cooldown][data-side="mine"][data-slot="Q"]')).toHaveText([
    "14",
    "12",
    "10",
    "8",
    "6",
  ]);
  await expect(page.locator('[data-cooldown][data-side="opponent"][data-slot="Q"]')).toHaveText([
    "13",
    "11.25",
    "9.5",
    "7.75",
    "6",
  ]);
});

test("rejects unknown champion links without requesting arbitrary data", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("./vs?a=UnknownChampion&t=Fiora");
  await expect(page.getByTestId("vs-opponent-Q")).toContainText("피오라");
  await expect(page.locator('[data-cooldown][data-side="mine"][data-slot="Q"]')).toHaveText(["—", "—", "—", "—", "—"]);
  expect(requests.some((url) => url.includes("UnknownChampion.json"))).toBe(
    false,
  );
});

test("shows six-rank skills and recharge times without controls on mobile", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./vs?a=Udyr&t=Teemo");
  await expect(
    page.locator('[data-rank-row="6"] th'),
  ).toBeVisible();
  await expect(page.locator('[data-cooldown][data-side="mine"][data-slot="R"]')).toHaveText([
    "6",
    "6",
    "6",
    "6",
    "6",
    "6",
  ]);
  await expect(page.locator('[data-recharge][data-side="opponent"][data-slot="R"]')).toHaveText(["35", "30", "25"]);
  await expect(page.locator('[data-cooldown][data-side="opponent"][data-slot="R"]')).toHaveText([
    "0.25",
    "0.25",
    "0.25", "—", "—", "—",
  ]);
  await expect(page.getByRole("combobox")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("vs-six-ranks.png"),
    animations: "disabled",
  });
});
