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

  await page.getByAltText("Q").hover();
  const qTooltip = page.getByRole("tooltip");
  await expect(qTooltip).toContainText("135/145/155/165/175");
  await expect(qTooltip).toContainText("20/45/70/95/120");
  await expect(qTooltip).toContainText("방어력이 10/15/20/25/30%");
  await expect(qTooltip).toContainText("피해를 입힐 때 효과가 발동합니다");
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

test("simulation uses compiled Ability v2 without raw spell requests", async ({ page }) => {
  const dataRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/data/")) dataRequests.push(request.url());
  });
  await page.goto("./simulation");
  await expect(
    page.getByRole("heading", { name: "시뮬레이션" }).nth(1)
  ).toBeVisible();
  await page.getByRole("button", { name: /Champion Placeholder/i }).click();
  await page.getByRole("button", { name: "Select 오공", exact: true }).click();
  await expect(page.getByText("Q: 파쇄격")).toBeVisible();
  await expect(page.getByText(/예상 피해 \(아이템\/레벨 반영\): 120\.0/)).toBeVisible();
  expect(dataRequests.some((url) => url.includes("/champions/ko_KR/MonkeyKing.json")))
    .toBe(true);
  expect(dataRequests.some((url) => url.includes("/spells/"))).toBe(false);
});
