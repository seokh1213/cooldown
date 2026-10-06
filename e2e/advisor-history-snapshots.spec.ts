import { waitForModelFreeInput } from "./support/advisor";
import { expect, test, type Page } from "@playwright/test";
import { globSync, readFileSync } from "node:fs";
import type { ChampionCard } from "../src/lib/knowledge/facts";

test.use({ serviceWorkers: "block" });
const key = "cooldown.advisor.conversations.v1";
const cardsPath = globSync("public/data/*/llm/champion-cards-ko_KR.json")[0];
const card = (JSON.parse(readFileSync(cardsPath, "utf8")) as { cards: ChampionCard[] }).cards.find(card => card.id === "MonkeyKing")!;
const detail = JSON.parse(readFileSync(globSync("public/data/*/champions/ko_KR/MonkeyKing.json")[0], "utf8"));

async function openAdvisor(page: Page) {
  await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
  const input = page.getByRole("textbox", { name: "롤 질문 입력", exact: true });
  const skip = page.getByRole("button", { name: "모델 없이 써보기", exact: true });
  await waitForModelFreeInput(page, input, skip);
  return input;
}

function archivedTurn(id: number, patch: string, health: number, mana: number) {
  const oldCard = structuredClone(card);
  oldCard.stats.health.lv1 = health;
  const oldDetail = structuredClone(detail);
  oldDetail.patchVersion = patch;
  oldDetail.champion.baseStats.mana.base = mana;
  return { id, role: "assistant", content: `당시 체력 ${health}`, byCode: true,
    source: { patch, locale: "ko_KR", ddragonVersion: detail.sources.ddragon },
    details: { MonkeyKing: oldDetail },
    answer: { kind: "champion", cardId: card.id, snapshot: { kind: "champion", card: oldCard } } };
}

async function seed(page: Page, turns: unknown[]) {
  await page.addInitScript(({ key, turns }) => localStorage.setItem(key, JSON.stringify([
    { id: "saved", title: "당시 기록", createdAt: "2026-10-06", updatedAt: "2026-10-06", turns },
  ])), { key, turns });
}

for (const width of [390, 1440]) {
  test(`두 패치의 같은 챔피언 카드를 구분하고 당시 기본·상세 수치로 전환한다: ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await seed(page, [{ id: 1, role: "user", content: "옛 질문" }, archivedTurn(2, "26.18", 601, 111),
      { id: 3, role: "user", content: "새 질문" }, archivedTurn(4, "26.19", 602, 222)]);
    let detailRequests = 0;
    await page.route("**/champions/ko_KR/MonkeyKing.json*", route => { detailRequests += 1; return route.abort(); });
    await page.goto("./");
    await openAdvisor(page);
    await expect(page.getByText("당시 체력 601", { exact: true })).toBeVisible();
    await expect(page.getByText("당시 체력 602", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: width < 768 ? "자료 패널" : "자료 보기", exact: true }).last().click();
    const dialog = page.getByRole("dialog").first();
    const oldTab = dialog.getByRole("button", { name: /오공.*26\.18/ });
    const newTab = dialog.getByRole("button", { name: /오공.*26\.19/ });
    await expect(oldTab).toBeVisible();
    await expect(oldTab).toContainText("26.18");
    await expect(newTab).toBeVisible();
    await expect(newTab).toContainText("26.19");
    await oldTab.click();
    const stats = page.locator("[data-reference-stats]").last();
    await expect(stats.getByRole("row").filter({ hasText: /^체력601/ })).toBeVisible();
    await expect(stats.getByRole("row").filter({ hasText: /^마나111/ })).toBeVisible();
    await expect(dialog.getByText("v26.18", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("link", { name: "현재 자료로 이동", exact: true })).toBeVisible();
    await newTab.click();
    await expect(stats.getByRole("row").filter({ hasText: /^체력602/ })).toBeVisible();
    await expect(stats.getByRole("row").filter({ hasText: /^마나222/ })).toBeVisible();
    expect(detailRequests).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await dialog.getByRole("link", { name: "현재 자료로 이동", exact: true }).click();
    await expect(page).toHaveURL(/\/vs\?a=MonkeyKing$/);
    if (width < 768) await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}

test("새 답변은 카드·상세·출처를 저장하고 새로고침 뒤 현재 상세를 요청하지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  const input = await openAdvisor(page);
  await input.fill("오공 체력은 어떻게돼?");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(page.getByText(/오공 체력 \(1레벨\).*610/).last()).toBeVisible();
  await expect.poll(() => page.evaluate(key => {
    const turns = JSON.parse(localStorage.getItem(key) ?? "[]")[0]?.turns ?? [];
    return Boolean(turns.find((turn: { details?: { MonkeyKing?: unknown }; answer?: { snapshot?: unknown }; source?: unknown }) =>
      turn.details?.MonkeyKing && turn.answer?.snapshot && turn.source));
  }, key)).toBe(true);
  let detailRequests = 0;
  await page.route("**/champions/ko_KR/MonkeyKing.json*", route => { detailRequests += 1; return route.abort(); });
  await page.reload();
  await openAdvisor(page);
  await page.getByRole("button", { name: "자료 보기", exact: true }).last().click();
  await expect(page.locator("[data-reference-stats]").last().getByRole("row").filter({ hasText: /^마나330/ })).toBeVisible();
  expect(detailRequests).toBe(0);
});

test("카드 원본 없는 기존 기록은 현재 자료 장애 중에도 답문을 복원하고 과거 패치를 보존한다", async ({ page }) => {
  const legacy = { id: 2, role: "assistant", content: "옛 답문 방어력 38", byCode: true,
    answer: { kind: "champion", cardId: "Garen" }, memory: { patch: "26.18", active: "champion", champion: "Garen" } };
  await seed(page, [{ id: 1, role: "user", content: "옛 질문" }, legacy]);
  await page.route("**/advisor-knowledge.json*", route => route.fulfill({ status: 503, body: "unavailable" }));
  await page.goto("./");
  await openAdvisor(page);
  await expect(page.getByText("옛 답문 방어력 38", { exact: true })).toBeVisible();
  await expect(page.getByText("당시 카드 원본이 저장되지 않아 복원할 수 없습니다. 대화 내용은 그대로 남아 있습니다.", { exact: true })).toBeVisible();
  await expect(page.locator("[data-reference-stats]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "중단", exact: true })).toHaveCount(0);
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "[]")[0].turns[1], key);
  expect(saved).toEqual(legacy);
});

test("대화 저장 공간 실패를 표시하고 재시도하면 카드 원본을 저장한다", async ({ page }) => {
  await page.addInitScript(key => {
    const setItem = Storage.prototype.setItem;
    Object.assign(window, { historyStorageBlocked: true });
    Storage.prototype.setItem = function (name, value) {
      if (name === key && (window as unknown as { historyStorageBlocked: boolean }).historyStorageBlocked) throw new DOMException("full", "QuotaExceededError");
      return setItem.call(this, name, value);
    };
  }, key);
  await page.goto("./");
  const input = await openAdvisor(page);
  await input.fill("오공 체력은 어떻게돼?");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("대화를 저장하지 못했습니다.");
  await page.evaluate(() => Object.assign(window, { historyStorageBlocked: false }));
  await page.getByRole("button", { name: "저장 다시 시도", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect.poll(() => page.evaluate(key => Boolean(JSON.parse(localStorage.getItem(key) ?? "[]")[0]?.turns[1]?.answer?.snapshot), key)).toBe(true);
});
