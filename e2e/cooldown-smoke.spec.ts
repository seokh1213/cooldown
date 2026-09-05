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
  await expect(page.getByText("집중 공격", { exact: true }).first()).toBeVisible();
  await page.getByRole("tab", { name: "아이템 백과" }).click();
  await expect(page.getByAltText("롱소드").first()).toBeVisible();
  await expect(page.locator("#root")).not.toBeEmpty();
});

test("installs the PWA and serves a direct route offline", async ({ page, context, baseURL }) => {
  await page.goto("./simulation");
  const workerSource = await (await page.request.get("./sw.js")).text();
  expect(workerSource).toContain("cooldown-game-data");
  expect(workerSource).toContain("cooldown-version");
  expect(workerSource).not.toContain("champions/ko_KR/MonkeyKing.json");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  const cachedChampionUrl = new URL(
    "data/26.17/champions/ko_KR/MonkeyKing.json",
    baseURL,
  ).href;
  await expect.poll(() => page.evaluate(async (url) => (await fetch(url)).status, cachedChampionUrl))
    .toBe(200);

  await context.setOffline(true);
  try {
    await expect.poll(() => page.evaluate(async (url) => (await fetch(url)).status, cachedChampionUrl))
      .toBe(200);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "시뮬레이션" }).nth(1)).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test("captures overflow-safe screens in all supported locales", async ({ page }, testInfo) => {
  const locales = [
    { id: "ko_KR", heading: "시뮬레이션" },
    { id: "en_US", heading: "Simulation" },
    { id: "zh_CN", heading: "模拟器" },
  ];
  await page.goto("./simulation");
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

test("simulation uses compiled Ability v2 without raw spell requests", async ({ page }) => {
  const dataRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/data/")) dataRequests.push(request.url());
  });
  await page.goto("./simulation");
  await expect(
    page.getByRole("heading", { name: "시뮬레이션" }).nth(1)
  ).toBeVisible();
  await expect(page.getByText("공격 챔피언과 대상을 선택하면 콤보 결과를 계산합니다.")).toBeVisible();
  await expect(page.getByTestId("combo-outcome")).toHaveCount(0);
  await page.getByRole("button", { name: "시뮬레이션할 챔피언 선택" }).click();
  await page.getByRole("button", { name: "Select 오공", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Q: 파쇄격")).toBeVisible();
  await expect(page.getByText("Skill Description Placeholder")).toHaveCount(0);
  const qSkill = page.getByText("Q: 파쇄격").locator("../..");
  await expect(qSkill).toContainText("산식 120.0");
  await page.getByLabel("Q 스킬 레벨").first().selectOption("1");
  await expect(qSkill).toContainText("산식 20.0");
  const rSkill = page.getByText("R: 회전격").locator("../..");
  await expect(rSkill).toContainText("공격력 125.5 × 2.75");
  await page.getByLabel("공격자 레벨").selectOption("1");
  await expect(rSkill).toContainText("공격력 66.0 × 2.75");
  expect(dataRequests.some((url) => url.includes("/champions/ko_KR/MonkeyKing.json")))
    .toBe(true);
  expect(dataRequests.some((url) => url.includes("/spells/"))).toBe(false);
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

test("calculates a ranked combo against target defenses", async ({ page }) => {
  await page.goto("./simulation");
  await page.getByRole("button", { name: "시뮬레이션할 챔피언 선택" }).click();
  await page.getByRole("button", { name: "Select 오공", exact: true }).click();
  await page.getByRole("button", { name: "피해를 받을 대상 챔피언 선택" }).click();
  await page.getByRole("button", { name: "Select 가렌", exact: true }).click();

  await expect(page.getByRole("button", { name: "피해를 받을 대상 챔피언 선택" })).toContainText("가렌");
  await page.getByLabel("현재 체력").fill("100");
  await expect(page.getByTestId("combo-outcome")).toHaveText("처치 가능");
  expect(Number(await page.getByTestId("combo-total").innerText())).toBeGreaterThan(100);

  await page.getByLabel("피해 감소").fill("100");
  await expect(page.getByTestId("combo-total")).toHaveText("0.0");
  await expect(page.getByTestId("combo-remaining-health")).toHaveText("100.0");
  await expect(page.getByTestId("combo-outcome")).toHaveText("생존");

  await page.getByLabel("소환사 주문 1").selectOption({ label: "점화" });
  await expect(page.getByRole("row", { name: /점화/ })).toContainText("430.0");
  await expect(page.getByTestId("combo-total")).toHaveText("430.0");
  await expect(page.getByTestId("combo-outcome")).toHaveText("처치 가능");

  await page.getByLabel("직접 피해 룬 선택").selectOption({ label: "비열한 한 방" });
  const cheapShotRow = page.getByRole("row", { name: /비열한 한 방/ });
  await expect(cheapShotRow).toContainText("45.0");
  await expect(cheapShotRow).toContainText("이동·행동 방해 상태");
  await expect(page.getByTestId("combo-total")).toHaveText("475.0");

  await page.getByRole("button", { name: /적용 · 이동·행동 방해 상태/ }).click();
  await expect(page.getByTestId("combo-total")).toHaveText("430.0");
  await expect(page).toHaveURL(/off=rune/);

  await page.getByLabel("피해 감소").fill("0");
  await page.getByRole("button", { name: "아이템 1" }).click();
  await page.getByRole("button", { name: /내셔의 이빨/ }).click();
  const nashorRow = page.getByRole("row", { name: /내셔의 이빨/ });
  await expect(nashorRow).toContainText("27.0");
  await expect(nashorRow).toContainText("적중 시");
});

test("restores the complete simulation from its URL", async ({ page }) => {
  await page.goto("./simulation?a=MonkeyKing&t=Garen&al=11&tl=10&sr=Q%3A3.W%3A1.E%3A2.R%3A1&cc=AA%3A2.Q%3A1&hp=777&ar=88&mr=44&dr=5");
  await expect(page.getByLabel("Q 스킬 레벨").first()).toHaveValue("3");
  await expect(page.getByLabel("현재 체력")).toHaveValue("777");
  await expect(page.getByLabel("방어력")).toHaveValue("88");
  await expect(page.getByLabel("파쇄격 횟수").last()).toHaveValue("1");
  await page.getByRole("button", { name: "공유" }).click();
  await expect(page.getByRole("button", { name: "복사됨" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Q 스킬 레벨").first()).toHaveValue("3");
  await expect(page.getByLabel("현재 체력")).toHaveValue("777");
});

test("hands a selected champion off to the simulation", async ({ page }) => {
  await page.goto("./");
  await selectWukong(page);
  await page.getByRole("button", { name: "이 조합으로 계산" }).click();
  await expect(page).toHaveURL(/\/simulation\?.*a=MonkeyKing/);
  await expect(page.getByText("Q: 파쇄격")).toBeVisible();
});

test("hands an encyclopedia item off to the simulation", async ({ page }) => {
  await page.goto("./encyclopedia?tab=items");
  await page.getByRole("button", { name: /롱소드/ }).first().click();
  await page.getByRole("button", { name: "시뮬레이션 첫 슬롯에 담기" }).click();
  await expect(page).toHaveURL(/\/simulation\?.*i=1036/);
  await expect(page.getByRole("button", { name: "롱소드" })).toBeVisible();
});

test("keeps the main workflow fully localized in Chinese", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "언어 선택" }).click();
  await page.getByRole("button", { name: /简体中文/ }).click();
  await expect(page.getByRole("heading", { name: "英雄冷却时间" })).toBeVisible();

  await page.goto("./simulation");
  await expect(page.getByRole("heading", { name: "模拟器" }).nth(1)).toBeVisible();
  await expect(page.getByRole("heading", { name: "连招伤害与斩杀判断" })).toBeVisible();
  await expect(page.getByRole("button", { name: "选择承受伤害的目标英雄" })).toBeVisible();
});

test("renders stat icons inside ability tooltips", async ({ page }) => {
  await page.goto("./");
  await selectWukong(page);

  await page.getByAltText("Q").hover();
  const qTooltip = page.getByRole("tooltip");
  // 계산해 만든 스탯 항 앞에 스탯 아이콘이 붙는다
  const statIcon = qTooltip.locator('img[src*="statsicon"]').first();
  await expect(statIcon).toBeVisible();
  await expect(statIcon).toHaveAttribute("src", /statsicon\/scale[a-z]+\.png$/);
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
  await expect(page.getByText("100 / (100 + 저항력)", { exact: false }).first()).toBeVisible();

  // 스탯 아이콘은 여기서도 CommunityDragon 이미지로 그려진다
  await expect(page.locator('img[src*="statsicon"]').first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});
