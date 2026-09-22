import { expect, test, type Page } from "@playwright/test";

async function selectWukong(page: Page): Promise<void> {
  await page.getByRole("button", { name: "챔피언 추가하기" }).click();
  await page.getByRole("button", { name: "Select 오공", exact: true }).click();
  await page.keyboard.press("Escape");
}

test("renders precomputed passive and Q values", async ({ page }) => {
  const dataRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/data/")) dataRequests.push(request.url());
  });
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "챔피언 쿨타임" })).toBeVisible();

  await selectWukong(page);

  await page.getByAltText("Passive").hover();
  const passiveTooltip = page.getByRole("tooltip");
  await expect(passiveTooltip).toContainText("(6 ~ 10)");
  await expect(passiveTooltip).toContainText("0.35%");
  await expect(passiveTooltip).toContainText("최대 5회");
  await expect(passiveTooltip).not.toContainText("인게임 툴팁");

  await page.getByAltText("Q").hover();
  const qTooltip = page.getByRole("tooltip");
  await expect(qTooltip).toContainText("135/145/155/165/175");
  await expect(qTooltip).toContainText("20/45/70/95/120");
  await expect(qTooltip).toContainText("방어력이 10/15/20/25/30%");
  await expect(qTooltip).toContainText("피해를 입힐 때 효과가 발동합니다");
  await expect(qTooltip.getByLabel("레벨별 수치")).toContainText("20/45/70/95/120");
  await expect(qTooltip.getByLabel("계수")).toContainText("추가 공격력");
  await expect(qTooltip.getByLabel("계수")).toContainText("50%");
  await expect(qTooltip).not.toContainText("인게임 툴팁");
  expect(dataRequests.some((url) => url.includes("/champions/ko_KR/MonkeyKing.json")))
    .toBe(true);
  expect(dataRequests.some((url) => url.includes("/spells/"))).toBe(false);
});

test("serves a lazy route directly under the Pages base path", async ({ page }) => {
  await page.goto("./encyclopedia");
  await expect(page).toHaveURL(/\/cooldown\/encyclopedia$/);
  await expect(page.getByRole("heading", { name: "백과사전" })).toBeVisible();
  // 탭 줄은 Radix Tabs 가 아니라 버튼 묶음이다. 버튼만 있고 패널이 없어서
  // `aria-controls` 가 존재하지 않는 id 를 가리켰고, Lighthouse 가 그것을 잡았다.
  // 켜진 것은 `aria-pressed` 로 알린다.
  await expect(page.getByRole("button", { name: "챔피언", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-champion-grid]")).toBeVisible();
  await page.getByRole("button", { name: "룬 백과", exact: true }).click();
  await expect(page.getByText("집중 공격", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "아이템 백과" }).click();
  // `alt` 가 아니라 역할로 찾는다. 아이템 목록 아이콘이 스프라이트에서 잘라 쓰는
  // `role="img"` 로 바뀌었는데, `getByAltText` 는 `<img alt>` 만 본다. 역할로 찾으면
  // 둘 다 잡히므로 그리는 방식이 또 바뀌어도 살아남는다.
  await expect(page.getByRole("img", { name: "롱소드" }).first()).toBeVisible();
  await expect(page.locator("#root")).not.toBeEmpty();
});

test("installs the PWA and serves a direct route offline", async ({ page, context, baseURL }) => {
  // 시뮬레이션 화면을 걷어내면서 깊은 링크 표본을 VS 로 옮겼다. 보는 것은 같다 —
  // 지연 로딩되는 경로가 서비스워커를 거쳐 오프라인에서도 열리는지다.
  await page.goto("./vs");
  const workerSource = await (await page.request.get("./sw.js")).text();
  expect(workerSource).toContain("cooldown-game-data");
  expect(workerSource).toContain("cooldown-version");
  expect(workerSource).not.toContain("champions/ko_KR/MonkeyKing.json");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  const manifest = await (await page.request.get("./data/version.json")).json();
  const cachedChampionUrl = new URL(
    `data/${manifest.patchVersion}/champions/ko_KR/MonkeyKing.json`,
    baseURL,
  ).href;
  await expect.poll(() => page.evaluate(async (url) => (await fetch(url)).status, cachedChampionUrl))
    .toBe(200);

  await context.setOffline(true);
  try {
    await expect.poll(() => page.evaluate(async (url) => (await fetch(url)).status, cachedChampionUrl))
      .toBe(200);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "챔피언 맞대결" }).nth(1)).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test("captures overflow-safe screens in all supported locales", async ({ page }, testInfo) => {
  const locales = [
    { id: "ko_KR", heading: "챔피언 맞대결" },
    { id: "en_US", heading: "Champion matchup" },
    { id: "zh_CN", heading: "英雄对决" },
  ];
  await page.goto("./vs");
  for (const locale of locales) {
    await page.evaluate((id) => {
      localStorage.setItem("cooldown:storage-schema", "2");
      localStorage.setItem("language", id);
    }, locale.id);
    await page.reload();
    await expect(page.getByRole("heading", { name: locale.heading }).nth(1)).toBeVisible();
    for (const viewport of [
      { name: "desktop", width: 1280, height: 900 },
      { name: "mobile", width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await expect.poll(() => page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      )).toBe(true);
      await testInfo.attach(`${locale.id}-${viewport.name}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
    }
  }
});

test("keeps the mobile sidebar off-canvas until opened", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");

  const openMenu = page.getByRole("button", { name: "Open menu" });
  const closeMenu = page.locator('button[aria-label="Close menu"]');
  await expect(openMenu).toBeVisible();
  expect((await closeMenu.boundingBox())?.x).toBeLessThan(0);

  await openMenu.click();
  await expect.poll(async () => (await closeMenu.boundingBox())?.x).toBeGreaterThan(0);
});

test("supports keyboard navigation and accessible mobile controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "챔피언 쿨타임" })).toBeVisible();

  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await expect(page.locator("main")).toHaveCount(1);

  const controlNames = [
    "Open menu",
    "다크 모드로 전환",
    "사용 방법 안내",
    "언어 선택",
  ];
  for (const name of controlNames) {
    const bounds = await page.getByRole("button", { name }).boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
  }

  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(
    page.getByRole("button", { name: "챔피언 쿨타임" }),
  ).toHaveAttribute("aria-current", "page");
  const reducedDuration = await page
    .getByRole("button", { name: "다크 모드로 전환" })
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).transitionDuration));
  expect(reducedDuration).toBeLessThan(0.001);
});


test("sanitizes game data HTML at the render boundary", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, serviceWorkers: "block" });
  const page = await context.newPage();
  await page.route("**/champions/ko_KR/MonkeyKing.json", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.champion.abilities.Q.bodyHtml = [
      "안전한 본문",
      '<img src="x" onerror="window.__unsafeHtml = true">',
      '<script>window.__unsafeHtml = true</script>',
      '<span class="text-red-600" onclick="window.__unsafeHtml = true">허용된 강조</span>',
    ].join("");
    await route.fulfill({ response, json: detail });
  });

  await page.goto("./");
  await selectWukong(page);
  await page.getByAltText("Q").hover();

  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toContainText("안전한 본문");
  await expect(tooltip).toContainText("허용된 강조");
  await expect(tooltip.locator('script, img[src="x"]')).toHaveCount(0);
  await expect(tooltip.locator("span.text-red-600")).not.toHaveAttribute("onclick");
  expect(await page.evaluate(() => Reflect.get(window, "__unsafeHtml"))).toBeUndefined();
  await context.close();
});

test("exposes unresolved Ability v2 diagnostics without hiding the tooltip", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "챔피언 추가하기" }).click();
  await page.getByRole("button", { name: "Select 아크샨", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByAltText("W").hover();

  const tooltip = page.getByRole("tooltip");
  await expect(tooltip.getByText(/확인 필요한 수치 \(1\)/)).toBeVisible();
  await expect(tooltip).toContainText("원본 데이터에서 완전히 해석되지 않은 수치가 있습니다.");
});



test("hands a selected champion off to the separate VS page", async ({ page }) => {
  await page.goto("./");
  await selectWukong(page);
  await page.getByRole("button", { name: "VS 화면에서 비교" }).click();
  await expect(page).toHaveURL(/\/vs\?.*a=MonkeyKing/);
  await expect(page.getByTestId("vs-mine-Q")).toContainText("파쇄격");
});


test("keeps the main workflow fully localized in Chinese", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "언어 선택" }).click();
  await page.getByRole("button", { name: /简体中文/ }).click();
  await expect(page.getByRole("heading", { name: "英雄冷却时间" })).toBeVisible();

  // 시뮬레이션 화면을 걷어내면서 표본을 VS 로 옮겼다. 보는 것은 같다 — 다른 화면으로
  // 건너가도 고른 언어가 그대로 따라오는지다.
  await page.goto("./vs?a=MonkeyKing&t=Garen");
  await expect(page.getByRole("heading", { name: "英雄对决" }).nth(1)).toBeVisible();
  await expect(page.getByRole("button", { name: "交换" })).toBeVisible();
});

test("renders stat icons inside ability tooltips", async ({ page }) => {
  await page.goto("./");
  await selectWukong(page);

  await page.getByAltText("Q").hover();
  const qTooltip = page.getByRole("tooltip");
  // 계산해 만든 스탯 항 앞에 스탯 아이콘이 붙는다
  const statIcon = qTooltip.locator('img.stat-icon').first();
  await expect(statIcon).toBeVisible();
  await expect(statIcon).toHaveAttribute("src", /\/img\/[^/]+\/stat\/scale[a-z]+\.webp$/);
  // 자리 표시가 그대로 노출되면 안 된다
  await expect(qTooltip).not.toContainText("[[si:");
  // 실제로 그려졌는지 (깨진 이미지가 아닌지) 확인
  await expect
    .poll(
      () =>
        statIcon.evaluate((node) => (node as HTMLImageElement).naturalWidth),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);
});

test("documents game formulas in the encyclopedia", async ({ page }) => {
  await page.goto("./encyclopedia?tab=formulas");

  // 관통은 순서가 결과를 바꾸므로 순서 자체가 핵심 내용이다
  await expect(page.getByRole("heading", { name: "저항력 감소와 관통" })).toBeVisible();
  await expect(page.getByText("① 저항력 감소 (고정)", { exact: false })).toBeVisible();
  // 네 단계를 합친 한 줄이 맨 앞에 있어야 한다
  await expect(
    page.getByText(
      "적용 저항력 = (저항력 − 고정 감소) × (1 − 감소%) × (1 − 관통%) − 고정 관통",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(page.getByText("100 / (100 + 저항력)", { exact: false }).first()).toBeVisible();

  // 스탯 아이콘은 여기서도 CommunityDragon 이미지로 그려진다
  await expect(page.locator('img.stat-icon').first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});

