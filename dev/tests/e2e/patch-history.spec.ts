import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

for (const locale of ["ko_KR", "en_US", "zh_CN"] as const) {
  test(`season quests and historical notes preserve context and fit mobile: ${locale}`, async ({ page }) => {
    await page.goto("./patch-notes?patch=26.1");
    await page.evaluate(language => localStorage.setItem("language", language), locale);
    await page.reload();
    const report = await (await page.request.get("./patch-notes/26.1.json")).json();
    const quests = report.entries.find((entry: { id: string }) => entry.id === "system-rolequests");
    const reward = quests.changes.find((change: { sectionName?: { en_US: string } }) =>
      change.sectionName?.en_US === "Top Lane · Quest Rewards:");
    await expect(page.locator("#patch-system-rolequests").getByRole("heading", { level: 4, name: reward.sectionName[locale], exact: true })).toBeVisible();
    const archivedItem = page.locator('#patch-3097 > header img');
    await expect(archivedItem).toHaveAttribute("src", /patch-notes\/item-icons\/26\.1\/3097\.webp$/);
    await expect.poll(() => archivedItem.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    for (const patch of ["26.1", "25.15", "25.1"]) {
      await page.goto(`./patch-notes?patch=${patch}`);
      const published = await (await page.request.get(`./patch-notes/${patch}.json`)).json();
      await expect(page.locator("article")).toHaveCount(published.entries.length);
      await expect(page.getByRole("alert")).toHaveCount(0);
      const ids = await page.locator("article").evaluateAll(nodes => nodes.map(node => node.id));
      expect(new Set(ids).size).toBe(ids.length);
      if (patch === "25.15") await expect(page.locator("article")).toHaveCount(14);
      if (patch === "25.1") {
        const feats = page.locator("#patch-system-featsofstrength");
        await expect(feats.getByRole("heading", { level: 4 })).toHaveCount(9);
      }
      for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
    }
  });
}

test.describe("installed historical patch notes", () => {
  test.use({ serviceWorkers: "allow" });
  test("archived item images and season notes remain available offline", async ({ page, context }) => {
    await page.goto("./patch-notes?patch=26.1");
    await expect(page.locator("article")).toHaveCount(76);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await expect.poll(() => page.evaluate(async () => Boolean(await caches.match(
      "/cooldown/patch-notes/item-icons/26.1/3097.webp", { ignoreSearch: true }
    )))).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator("article")).toHaveCount(76);
    await expect.poll(() => page.locator("#patch-3097 > header img").evaluate(node =>
      (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  });
});
