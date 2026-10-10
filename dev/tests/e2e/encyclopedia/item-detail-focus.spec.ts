import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

async function waitForDialogKeyboard(page: import("@playwright/test").Page) {
  const dialog = page.getByRole("dialog", { name: "체력 물약", exact: true });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  await dialog.evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => {}))));
}

for (const width of [360, 767]) {
  test(`item dialog restores its keyboard opener at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("./encyclopedia?tab=items");
    const opener = page.getByRole("button", { name: "체력 물약 50 체력 물약", exact: true });
    await opener.focus();
    await page.keyboard.press("Enter");
    await waitForDialogKeyboard(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
}

test("a directly linked item returns focus to the main content", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./encyclopedia?tab=items&item=2003");
  await waitForDialogKeyboard(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("#main-content")).toBeFocused();
});
