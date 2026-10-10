import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { decodeDataManifest } from "../../../../src/domain/game/contracts/dataManifest";
import type { ChampionDetailV2 } from "../../../../src/domain/game/contracts/championData";
import { IMAGE_VERSION } from "../../../../src/infrastructure/generated/assetVersion";

const manifest = decodeDataManifest(JSON.parse(readFileSync(new URL("../../../../public/data/version.json", import.meta.url), "utf8")));
const ahri: ChampionDetailV2 = JSON.parse(readFileSync(new URL(`../../../../public/data/${manifest.patchVersion}/champions/ko_KR/Ahri.json`, import.meta.url), "utf8"));

test("tooltip HTML keeps generated local stat images and rejects external or traversing image URLs", async ({ page, context, baseURL }) => {
  const base = new URL(baseURL!).pathname;
  const local = `${base}img/${IMAGE_VERSION}/stat/scaleap.webp`;
  const rejected = [
    `//example.invalid${local}`,
    `https://example.invalid${local}`,
    `/\\example.invalid${local}`,
    `${base}img/../${IMAGE_VERSION}/stat/scaleap.webp`,
    `${base}img/${IMAGE_VERSION}/stat/../scaleap.webp`,
    `${base}img/${IMAGE_VERSION}/stat/%2e%2e/scaleap.webp`,
    `${base}img/${IMAGE_VERSION}/stat/scaleap.webp/../../other`,
    `${base}img/${IMAGE_VERSION}/stat/scaleap.webp?redirect=//example.invalid`,
    `data:image/svg+xml;base64,PHN2Zy8+`,
    "javascript:alert(1)",
  ];
  const fixture = structuredClone(ahri);
  fixture.champion.abilities.Q.bodyHtml = [
    '<p>Sanitizer probe [[si:scalead]]</p>',
    `<img class="sanitizer-local" src="${local}" alt="local probe">`,
    ...rejected.map((src, index) => `<img class="sanitizer-rejected" src="${src}" alt="rejected ${index}">`),
  ].join("");
  const externalRequests: string[] = [];
  await context.route("**/example.invalid/**", async (route) => {
    externalRequests.push(route.request().url());
    await route.abort();
  });
  await context.route("**/champions/ko_KR/Ahri.json*", (route) => route.fulfill({ json: fixture }));
  await page.goto("./vs?a=Ahri&t=Garen");
  await page.getByTestId("vs-mine-Q").getByRole("button").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Sanitizer probe");
  await expect(dialog.locator("img.sanitizer-local")).toHaveAttribute("src", local);
  const generated = dialog.locator('img.stat-icon[src$="/scalead.webp"]');
  await expect(generated).toHaveAttribute("src", `${base}img/${IMAGE_VERSION}/stat/scalead.webp`);
  await expect.poll(() => generated.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  await expect(dialog.locator("img.sanitizer-rejected")).toHaveCount(rejected.length);
  expect(await dialog.locator("img.sanitizer-rejected").evaluateAll((elements) => elements.map((element) => element.getAttribute("src")))).toEqual(rejected.map(() => null));
  expect(externalRequests).toEqual([]);
});
