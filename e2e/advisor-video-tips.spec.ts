import { waitForModelFreeInput } from "./support/advisor";
import { expect, test, type Page } from "@playwright/test";
import { IMAGE_VERSION } from "../src/data/generated/assetVersion";

async function openAdvisor(page: Page) {
  await page.goto("./");
  await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
  const input = page.getByRole("textbox", { name: "롤 질문 입력", exact: true });
  const skip = page.getByRole("button", { name: "모델 없이 써보기", exact: true });
  await waitForModelFreeInput(page, input, skip);
  return async (question: string) => {
    const copies = page.getByRole("button", { name: "답변 복사", exact: true });
    const previous = await copies.count();
    await input.fill(question);
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    await expect(copies).toHaveCount(previous + 1);
    await expect(page.getByRole("button", { name: "중단", exact: true })).toBeHidden();
  };
}

for (const width of [390, 1280]) {
  test(`영상 팁·후속 질문·화면과 복사의 출처 미노출: ${width}px`, async ({ page, context }) => {
    // Seventeen turns include text reveal; keep each response's 5-second assertion.
    test.setTimeout(60_000);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize({ width, height: 900 });
    const ask = await openAdvisor(page);
    const dialog = page.getByRole("dialog", { name: "롤 지식 도우미", exact: true });
    const copy = page.getByRole("button", { name: "답변 복사", exact: true }).last();
    for (const [question, answer] of [
      ["징수의 총 999는 진짜 고정 피해 999야?", "연출 숫자"],
      ["정복자에 점화 들어가?", "2개"],
      ["그럼 매 틱마다 줘?", "매 피해 틱"],
      ["가렌 Q로 벽 넘을 수 있어?", "아주 얇은 벽"],
      ["그럼 두꺼운 벽도 돼?", "벽 두께"],
      ["다리우스 W는 치명타 터져 안 터져?", "W의 추가 피해"],
      ["갈리오 평타는 피흡이 적용돼 안 돼?", "갈리오 P"],
      ["워윅 R에도 피흡 적용돼?", "생명력 흡수 적용"],
      ["잭스 W 추가 마법 피해도 피흡 돼?", "적용되지 않습니다"],
      ["그럼 기본 평타 부분은?", "기본 공격 본체"],
      ["카밀 Q 2타 고정 피해 피흡 돼?", "생명력 흡수가 적용됩니다"],
      ["마이 E 고정 피해는?", "생명력 흡수 대상이 아닙니다"],
      ["리븐 P 치명타 판정은 툴팁에 있어?", "툴팁"],
      ["아리 E 맞으면 이속은?", "65%"],
      ["그럼 룰루 W 변이는?", "60만큼 감소"],
      ["가렌 Q로 벽 넘을 때 고연포 사거리 아이템이 도움 돼?", "사거리 증가"],
      ["고정 마관 효율은 상대 마저가 낮을 때 더 좋아?", "낮을수록"],
    ]) {
      await ask(question);
      await copy.click();
      const text = await page.evaluate(() => navigator.clipboard.readText());
      expect(text).toContain(answer);
      expect(text).not.toMatch(/https?:|youtube|mangdasu|wiki\.league|참고 자료|출처/);
      await expect(dialog.locator('a[href^="http"]')).toHaveCount(0);
      expect(await dialog.innerText()).not.toMatch(/youtube|mangdasu|참고 자료|출처/);
    }
    await page.screenshot({ path: `research/.cache/ability-icon-audit/tips-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });

  test(`벨베스 준비 상태와 징크스 Q A/B 표시: ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const ask = await openAdvisor(page);
    await ask("벨베스 Q 스킬 설명해줘");
    const show = page.getByRole("button", { name: "자료 보기", exact: true }).last();
    if (await show.isVisible()) await show.click();
    const ready = page.locator('[data-reference-skills] [data-sprite="Belveth:Q"]').last();
    await expect(ready).toBeVisible();
    expect(await ready.evaluate(element => getComputedStyle(element).backgroundImage)).toContain("ability/Belveth.webp");
    await page.screenshot({ path: `research/.cache/ability-icon-audit/belveth-${width}.png` });
    const back = page.getByRole("button", { name: "돌아가기", exact: true });
    if (await back.isVisible()) await back.click();
    await ask("징크스 Q 스킬 설명해줘");
    if (await show.isVisible()) await show.click();
    const icon = page.locator("[data-reference-skills] [data-form-icon]").last();
    await expect(icon).toBeVisible();
    await expect(icon).toHaveAttribute("aria-label", /A 생선대가리 · B 빵야빵야/);
    await expect(icon.locator("[data-form-half]")).toHaveCount(2);
    for (const half of await icon.locator("img").all()) {
      const src = await half.getAttribute("src");
      expect(src).toContain(`/img/${IMAGE_VERSION}/form/`);
      expect(src).toMatch(/\/assets-characters-jinx-hud-icons2d-jinx-q[12]\.webp$/);
      expect(await half.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    }
    await icon.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `research/.cache/ability-icon-audit/jinx-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });
}
