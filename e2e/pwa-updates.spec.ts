import { expect, test as base, type Page } from "@playwright/test";
import { rmSync } from "node:fs";
import { buildPwaReleases, startPwaDeployment, type ReleaseBuilds } from "./helpers/pwaDeployment";

const test = base.extend<object, { builds: ReleaseBuilds }>({
  builds: [async ({ browserName: _browserName }, runFixture) => {
    const builds = buildPwaReleases();
    try { await runFixture(builds); }
    finally { rmSync(builds.directory, { recursive: true, force: true }); }
  }, { scope: "worker", timeout: 60_000 }],
});
test.describe.configure({ mode: "serial" });

const appRelease = (page: Page) => page.locator('meta[name="cooldown-release"]');
const wake = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event("focus")));
const updatedLore = "PWA 갱신 테스트: 같은 패치의 새 이야기";

async function openInstalledProfile(page: Page, origin: string) {
  await page.goto(`${origin}/cooldown/encyclopedia?champion=Aatrox`);
  await expect(page.locator("[data-champion-lore]")).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect(page.locator("[data-champion-lore]")).toBeVisible();
}

test("same-patch data and app-only changes update in place and retain offline data/preferences", async ({ page, context, builds }) => {
  const server = await startPwaDeployment(builds);
  try {
    expect(builds.releaseA.appVersion).toBe(builds.releaseB.appVersion);
    expect(builds.releaseA.dataVersion).not.toBe(builds.releaseB.dataVersion);
    expect(builds.releaseA.patchVersion).toBe(builds.releaseB.patchVersion);
    expect(builds.releaseB.dataVersion).toBe(builds.releaseC.dataVersion);
    await openInstalledProfile(page, server.origin);
    await page.evaluate(async () => {
      localStorage.setItem("keep-preference", "yes");
      await (await caches.open("other-app-cache")).put("/other-data", new Response("safe"));
    });
    server.deploy("b");
    await wake(page);
    await expect(appRelease(page)).toHaveAttribute("content", builds.releaseB.releaseId, { timeout: 20_000 });
    await expect(page.locator("[data-champion-lore]")).toHaveText(updatedLore);
    await expect(page).toHaveURL(/encyclopedia\?champion=Aatrox$/);
    expect(await page.evaluate(() => localStorage.getItem("keep-preference"))).toBe("yes");
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(1);
    expect(await page.evaluate(() => caches.has("other-app-cache"))).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator("[data-champion-lore]")).toHaveText(updatedLore);
    await context.setOffline(false);
    server.deploy("c");
    await wake(page);
    await expect(appRelease(page)).toHaveAttribute("content", builds.releaseC.releaseId, { timeout: 20_000 });
    await expect(page.locator("[data-champion-lore]")).toHaveText(updatedLore);
  } finally { await server.close(); }
});

test("manual preference defers activation and one acceptance updates both open tabs", async ({ page, context, builds }) => {
  const server = await startPwaDeployment(builds);
  try {
    await page.addInitScript(() => localStorage.setItem("pwaAutoUpdate", "false"));
    await openInstalledProfile(page, server.origin);
    const second = await context.newPage();
    await openInstalledProfile(second, server.origin);
    server.deploy("b");
    await wake(page);
    await expect(page.getByText("새 버전이 준비되었습니다.", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(appRelease(page)).toHaveAttribute("content", builds.releaseA.releaseId);
    await expect(page.locator("[data-champion-lore]")).not.toHaveText(updatedLore);
    await page.getByRole("button", { name: "지금 새로고침", exact: true }).click();
    for (const tab of [page, second]) {
      await expect(appRelease(tab)).toHaveAttribute("content", builds.releaseB.releaseId);
      await expect(tab.locator("[data-champion-lore]")).toHaveText(updatedLore);
    }
  } finally { await server.close(); }
});

test("failed data preparation keeps the current version, then retries without clearing it", async ({ page, builds }) => {
  const server = await startPwaDeployment(builds);
  try {
    await openInstalledProfile(page, server.origin);
    server.deploy("b");
    server.block(new RegExp(`${builds.releaseB.dataVersion}/.*/champion-profiles/ko_KR/Aatrox.json`));
    await wake(page);
    await expect.poll(() => server.requests.some((url) => url.includes(`${builds.releaseB.dataVersion}/`) && url.endsWith("/Aatrox.json"))).toBe(true);
    await expect(appRelease(page)).toHaveAttribute("content", builds.releaseA.releaseId);
    await expect(page.locator("[data-champion-lore]")).not.toHaveText(updatedLore);
    server.block();
    await wake(page);
    await expect(appRelease(page)).toHaveAttribute("content", builds.releaseB.releaseId, { timeout: 20_000 });
    await expect(page.locator("[data-champion-lore]")).toHaveText(updatedLore);
  } finally { await server.close(); }
});

test("failed app install leaves cached screens usable and a later check completes the update", async ({ page, builds }) => {
  const server = await startPwaDeployment(builds);
  try {
    await openInstalledProfile(page, server.origin);
    server.deploy("c");
    server.block(/\/assets\/.*\.js$/);
    await wake(page);
    await expect.poll(() => server.failedRequests.length).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return registration?.installing?.state ?? "idle";
    })).toBe("idle");
    await expect(appRelease(page)).toHaveAttribute("content", builds.releaseA.releaseId);
    await page.reload();
    await expect(page.locator("[data-champion-lore]")).toBeVisible();
    await expect(appRelease(page)).toHaveAttribute("content", builds.releaseA.releaseId);
    server.block();
    await wake(page);
    await expect(appRelease(page)).toHaveAttribute("content", builds.releaseC.releaseId, { timeout: 20_000 });
  } finally { await server.close(); }
});

test("online recovery and periodic polling detect releases without a manual reload", async ({ page, context, builds }) => {
  const server = await startPwaDeployment(builds);
  try {
    await page.clock.install();
    await openInstalledProfile(page, server.origin);
    await context.setOffline(true);
    server.deploy("b");
    await page.clock.fastForward(60_100);
    await expect(appRelease(page)).toHaveAttribute("content", builds.releaseA.releaseId);
    await context.setOffline(false);
    await expect(appRelease(page)).toHaveAttribute("content", builds.releaseB.releaseId, { timeout: 20_000 });
    server.deploy("c");
    await page.clock.fastForward(60_100);
    await expect(appRelease(page)).toHaveAttribute("content", builds.releaseC.releaseId, { timeout: 20_000 });
  } finally { await server.close(); }
});

test("legacy installed workers upgrade at the same URL without unregistering", async ({ page, builds }) => {
  const server = await startPwaDeployment(builds);
  try {
    server.serveLegacy();
    await page.goto(`${server.origin}/cooldown/encyclopedia?champion=Aatrox`);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("/cooldown/sw.js");
      await navigator.serviceWorker.ready;
    });
    await expect(page.getByRole("heading", { name: "Legacy PWA" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    server.deploy("a");
    await page.evaluate(() => { void navigator.serviceWorker.getRegistration().then((registration) => registration?.update()); });
    await expect(appRelease(page)).toHaveAttribute("content", builds.releaseA.releaseId, { timeout: 20_000 });
    await expect(page.locator("[data-champion-lore]")).toBeVisible();
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((registration) => registration.active?.scriptURL)))
      .toEqual([`${server.origin}/cooldown/sw.js`]);
  } finally { await server.close(); }
});
