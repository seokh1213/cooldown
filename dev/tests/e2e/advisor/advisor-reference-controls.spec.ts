import { expect, test, type Locator, type Page } from "@playwright/test";
import { waitForModelFreeInput } from "../support/advisor";

async function openReference(page: Page) {
  await page.goto("./");
  await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
  const input = page.getByRole("textbox", { name: "롤 질문 입력", exact: true });
  await waitForModelFreeInput(page, input, page.getByRole("button", { name: "모델 없이 써보기", exact: true }));
  await input.fill("코르키 W E 틱은?");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(page.getByRole("button", { name: "중단", exact: true })).toBeHidden();
  return page.getByRole("dialog", { name: "롤 지식 도우미", exact: true });
}

async function iconContrast(control: Locator) {
  return control.evaluate(element => {
    const context = document.createElement("canvas").getContext("2d")!;
    const pixel = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    };
    const layers: number[][] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      layers.unshift(pixel(getComputedStyle(node).backgroundColor));
    }
    const background = layers.reduce((base, layer) => base.map((value, index) =>
      layer[index] * layer[3] / 255 + value * (1 - layer[3] / 255)), [255, 255, 255]);
    const luminance = (rgb: number[]) => rgb.slice(0, 3).map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const foreground = luminance(pixel(getComputedStyle(element).color));
    const surface = luminance(background);
    return (Math.max(foreground, surface) + 0.05) / (Math.min(foreground, surface) + 0.05);
  });
}

for (const width of [1280, 1560]) for (const colorScheme of ["light", "dark"] as const) {
  test(`자료 패널 버튼 정렬과 접기·펼치기: ${width}px ${colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme });
    const dialog = await openReference(page);
    const reference = dialog.locator("aside");
    const toggle = dialog.getByRole("button", { name: "자료 패널", exact: true });
    const collapse = reference.getByRole("button", { name: "자료 패널 접기", exact: true });
    await expect(reference).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(toggle).toHaveAttribute("title", "자료 패널 접기");
    await expect(collapse).toHaveAttribute("title", "자료 패널 접기");
    const toggleBox = (await toggle.boundingBox())!;
    const collapseBox = (await collapse.boundingBox())!;
    expect(Math.abs(toggleBox.y + toggleBox.height / 2 - collapseBox.y - collapseBox.height / 2)).toBeLessThanOrEqual(1);
    expect(collapseBox.height).toBe(toggleBox.height);
    expect(await iconContrast(collapse)).toBeGreaterThanOrEqual(3);
    expect(await iconContrast(toggle)).toBeGreaterThanOrEqual(3);
    const expanded = (await dialog.boundingBox())!;

    await collapse.click();
    await expect(reference).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(toggle).toHaveAttribute("title", "자료 패널 펼치기");
    expect(await iconContrast(toggle)).toBeGreaterThanOrEqual(3);
    const collapsed = (await dialog.boundingBox())!;
    expect(collapsed.x).toBeGreaterThan(expanded.x);
    expect(collapsed.width).toBeLessThan(expanded.width);
    expect(collapsed.x + collapsed.width).toBeCloseTo(expanded.x + expanded.width, 0);

    await toggle.focus();
    await toggle.press("Enter");
    await expect(reference).toBeVisible();
    await expect(reference).toContainText("코르키");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(toggle).toBeFocused();
    expect(await toggle.evaluate(node => node.matches(":focus-visible"))).toBe(true);
    await expect(toggle).not.toHaveCSS("box-shadow", "none");
    await toggle.press("Space");
    await expect(reference).toBeHidden();

    await page.reload();
    await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(reference).toBeHidden();
    await expect.poll(() => dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  });
}

test("좁은 화면의 자료 버튼은 기존 카드 화면을 연다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await openReference(page);
  const toggle = dialog.getByRole("button", { name: "자료 패널", exact: true });
  await expect(toggle).toHaveAttribute("title", "자료 패널");
  await expect(toggle).not.toHaveAttribute("aria-expanded");
  await expect(dialog.locator("aside")).toHaveCount(0);
  await toggle.click();
  await expect(dialog.locator("[data-reference-skills]")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "자료 패널 접기", exact: true })).toHaveCount(0);
  await expect.poll(() => dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
});
