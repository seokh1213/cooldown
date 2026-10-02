import { expect, test as base, type Page } from "@playwright/test";
import { rmSync } from "node:fs";
import { buildPwaReleases, startPwaDeployment, type ReleaseBuilds } from "./helpers/pwaDeployment";
import type { AppRelease } from "../src/pwa/release";

const test = base.extend<object, { builds: ReleaseBuilds }>({
  page: async ({ page }, runFixture) => {
    await page.clock.install();
    await runFixture(page);
  },
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

async function pauseEntryDeadline(page: Page) {
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
}

async function reloadForRelease(page: Page, release: AppRelease) {
  // Freeze only the update window, then let React's render timers run normally.
  await pauseEntryDeadline(page);
  await page.reload();
  await expect(appRelease(page)).toHaveAttribute("content", release.releaseId, { timeout: 20_000 });
  await page.clock.resume();
}

async function expectPreparedRelease(page: Page, release: AppRelease) {
  await expect.poll(() => page.evaluate(async () =>
    (await navigator.serviceWorker.getRegistration())?.waiting?.state
  ), { timeout: 20_000 }).toBe("installed");
  await expect.poll(() => page.evaluate(async ({ dataVersion, patchVersion }) => Boolean(await caches.match(
    `/cooldown/data/releases/${dataVersion}/${patchVersion}/champion-profiles/ko_KR/Aatrox.json`
  )), release), { timeout: 20_000 }).toBe(true);
}

async function observeLoreOnNextNavigation(page: Page): Promise<string[]> {
  const rendered: string[] = [];
  page.on("console", (message) => {
    if (message.text().startsWith("PWA_LORE:")) rendered.push(message.text().slice(9));
  });
  await page.addInitScript(() => {
    new MutationObserver(() => {
      const lore = document.querySelector("[data-champion-lore]");
      if (lore) console.debug(`PWA_LORE:${lore.textContent}`);
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  return rendered;
}

async function openInstalledProfile(page: Page, origin: string) {
  await page.goto(`${origin}/cooldown/encyclopedia?champion=Aatrox`);
  await expect(page.locator("[data-champion-lore]")).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect(page.locator("[data-champion-lore]")).toBeVisible();
}

test("background updates wait for entry and retain offline data/preferences", async ({ page, context, builds }) => {
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
    await expectPreparedRelease(page, builds.releaseB);
    await expect(appRelease(page)).toHaveAttribute("content", builds.releaseA.releaseId);
    await expect(page.locator("[data-champion-lore]")).not.toHaveText(updatedLore);
    const rendered = await observeLoreOnNextNavigation(page);
    await reloadForRelease(page, builds.releaseB);
    await expect(page.locator("[data-champion-lore]")).toHaveText(updatedLore);
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.every((lore) => lore === updatedLore)).toBe(true);
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
    await expectPreparedRelease(page, builds.releaseC);
    await expect(appRelease(page)).toHaveAttribute("content", builds.releaseB.releaseId);
    await reloadForRelease(page, builds.releaseC);
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
    await expectPreparedRelease(page, builds.releaseB);
    await expect(appRelease(page)).toHaveAttribute("content", builds.releaseA.releaseId);
    await reloadForRelease(page, builds.releaseB);
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
    await expectPreparedRelease(page, builds.releaseC);
    await reloadForRelease(page, builds.releaseC);
  } finally { await server.close(); }
});

test("online recovery and periodic polling download releases without interrupting the screen", async ({ page, context, builds }) => {
  const server = await startPwaDeployment(builds);
  try {
    await openInstalledProfile(page, server.origin);
    await context.setOffline(true);
    server.deploy("b");
    await page.clock.fastForward(60_100);
    await expect(appRelease(page)).toHaveAttribute("content", builds.releaseA.releaseId);
    await context.setOffline(false);
    await expectPreparedRelease(page, builds.releaseB);
    await expect(appRelease(page)).toHaveAttribute("content", builds.releaseA.releaseId);
    await reloadForRelease(page, builds.releaseB);
    await page.waitForLoadState("networkidle");
    server.deploy("c");
    await page.clock.fastForward(60_100);
    await expectPreparedRelease(page, builds.releaseC);
    await expect(appRelease(page)).toHaveAttribute("content", builds.releaseB.releaseId);
    await reloadForRelease(page, builds.releaseC);
  } finally { await server.close(); }
});

test("entry installs a new release before rendering its first champion content", async ({ page, builds }) => {
  const server = await startPwaDeployment(builds);
  try {
    await openInstalledProfile(page, server.origin);
    const rendered = await observeLoreOnNextNavigation(page);
    server.deploy("b");
    await reloadForRelease(page, builds.releaseB);
    await expect(page.locator("[data-champion-lore]")).toHaveText(updatedLore, { timeout: 20_000 });
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.every((lore) => lore === updatedLore)).toBe(true);
  } finally { await server.close(); }
});

test("a slow entry check opens the cached screen and defers the late update", async ({ page, builds }) => {
  const server = await startPwaDeployment(builds);
  try {
    await openInstalledProfile(page, server.origin);
    server.deploy("b");
    server.hold(/\/(?:release\.json|sw\.js)$/);
    await pauseEntryDeadline(page);
    await page.reload();
    await expect(page.locator("[data-app-loading]")).toBeVisible();
    await page.clock.fastForward(3000);
    await page.clock.resume();
    await expect(page.locator("[data-champion-lore]")).toBeVisible({ timeout: 6000 });
    await expect(page.locator("[data-app-loading]")).toHaveCount(0);
    await expect(appRelease(page)).toHaveAttribute("content", builds.releaseA.releaseId);
    server.hold();
    await expectPreparedRelease(page, builds.releaseB);
    await expect(appRelease(page)).toHaveAttribute("content", builds.releaseA.releaseId);
    await expect(page.locator("[data-champion-lore]")).not.toHaveText(updatedLore);
    await reloadForRelease(page, builds.releaseB);
    await expect(page.locator("[data-champion-lore]")).toHaveText(updatedLore);
  } finally { await server.close(); }
});

test("late data preparation keeps the cached screen until the next entry", async ({ page, builds }) => {
  const server = await startPwaDeployment(builds);
  try {
    await openInstalledProfile(page, server.origin);
    server.deploy("b");
    server.hold(new RegExp(`${builds.releaseB.dataVersion}/.*/champion-profiles/ko_KR/Aatrox.json`));
    await pauseEntryDeadline(page);
    await page.reload();
    await expect(page.locator("[data-app-loading]")).toBeVisible();
    await expect.poll(() => server.requests.some((url) => url.includes(builds.releaseB.dataVersion) && url.endsWith("/Aatrox.json"))).toBe(true);
    await page.clock.fastForward(3000);
    await page.clock.resume();
    await expect(page.locator("[data-champion-lore]")).toBeVisible({ timeout: 6000 });
    await expect(appRelease(page)).toHaveAttribute("content", builds.releaseA.releaseId);
    server.hold();
    await expectPreparedRelease(page, builds.releaseB);
    await expect(appRelease(page)).toHaveAttribute("content", builds.releaseA.releaseId);
    await reloadForRelease(page, builds.releaseB);
    await expect(page.locator("[data-champion-lore]")).toHaveText(updatedLore);
  } finally { await server.close(); }
});

test("bypassing the service worker opens the current release without an extra reload", async ({ page, context, builds }) => {
  const server = await startPwaDeployment(builds);
  try {
    await openInstalledProfile(page, server.origin);
    const rendered = await observeLoreOnNextNavigation(page);
    const documents: boolean[] = [];
    page.on("response", (response) => {
      if (response.request().isNavigationRequest()) documents.push(response.fromServiceWorker());
    });
    server.deploy("b");
    const session = await context.newCDPSession(page);
    await session.send("Network.enable");
    await session.send("Network.setBypassServiceWorker", { bypass: true });
    await session.send("Network.setCacheDisabled", { cacheDisabled: true });
    await page.reload();
    await expect(page.locator("[data-champion-lore]")).toHaveText(updatedLore);
    expect(documents).toEqual([false]);
    expect(rendered.every((lore) => lore === updatedLore)).toBe(true);
  } finally { await server.close(); }
});

const initialThemes = [
  { name: "saved dark", system: "light", saved: "dark", expected: "dark", background: "rgb(14, 14, 17)" },
  { name: "saved light", system: "dark", saved: "light", expected: "", background: "rgb(244, 244, 246)" },
  { name: "system dark", system: "dark", saved: null, expected: "dark", background: "rgb(14, 14, 17)" },
] as const;
for (const theme of initialThemes) test(`${theme.name} theme is set before app scripts and styles load`, async ({ page, builds }) => {
  const server = await startPwaDeployment(builds);
  try {
    await page.emulateMedia({ colorScheme: theme.system });
    await page.addInitScript((saved) => {
      if (saved) localStorage.setItem("theme", saved);
      else localStorage.removeItem("theme");
    }, theme.saved);
    server.hold(/\/assets\//);
    await page.goto(`${server.origin}/cooldown/`, { waitUntil: "commit" });
    await expect(page.locator("html")).toHaveClass(theme.expected);
    await expect(page.locator("html")).toHaveCSS("background-color", theme.background);
    await expect(page.locator("#root")).toBeEmpty();
    server.hold();
    await expect(page.locator("nav").first()).toBeVisible();
    await expect(page.locator("body")).toHaveCSS("background-color", theme.background);
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
