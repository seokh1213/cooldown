import { waitForModelFreeInput } from "./support/advisor";
import { expect, test, type Page } from "@playwright/test";
import { translations } from "../../../src/shared/i18n/translations";
import type { Language } from "../../../src/shared/i18n";

async function openAdvisor(page: Page, lang: Language) {
  await page.addInitScript(locale => localStorage.setItem("language", locale), lang);
  await page.goto("./");
  const copy = translations[lang].advisor;
  await page.getByRole("button", { name: copy.open, exact: true }).click();
  const input = page.getByRole("textbox", { name: copy.questionLabel, exact: true });
  const skip = page.getByRole("button", { name: copy.consent.skipModel, exact: true });
  await waitForModelFreeInput(page, input, skip);
  return async (question: string) => {
    await input.fill(question);
    await page.getByRole("button", { name: copy.send, exact: true }).click();
    await expect(page.getByRole("button", { name: copy.stop, exact: true })).toBeHidden();
  };
}

test("영어 As 문형의 상성 번역과 이어 묻기", async ({ page }) => {
  const ask = await openAdvisor(page, "en_US");
  await ask("As Aatrox, how should I lane against Fiora?");
  await expect(page.getByText("Laning", { exact: true }).last()).toBeVisible();
  await expect(page.getByText(/At levels 1–2, farm safely near your turret/).last()).toBeVisible();
  await expect(page.getByText(/Attack speed \(level 1\)/)).toHaveCount(0);
  await ask("What items should I buy?");
  await expect(page.getByText(/Cloth Armor or Bramble Vest/).last()).toBeVisible();
});

test("중국어 콤보 답은 후속 적중을 보장하지 않는다", async ({ page }) => {
  const ask = await openAdvisor(page, "zh_CN");
  await ask("我用阿狸对线劫有什么建议？");
  await ask("怎么连招？");
  await expect(page.getByText("连招", { exact: true }).last()).toBeVisible();
  await expect(page.getByText(/先命中九尾妖狐 E 魅惑妖术，再依次使用九尾妖狐 W 妖异狐火、九尾妖狐 Q 欺诈宝珠/).filter({ visible: true }).last()).toBeVisible();
  await expect(page.getByText(/后续技能就能确保命中/).filter({ visible: true })).toHaveCount(0);
});

test("한국어 상대 먼저 말해도 내 챔피언의 관점을 유지한다", async ({ page }) => {
  const ask = await openAdvisor(page, "ko_KR");
  await ask("파이크 만나면 너무 무서워요ㅠ 제가 소라카인데 어디에 서 있어야 덜 끌리나요");
  await expect(page.getByRole("link", { name: "소라카 vs 파이크 화면으로 이동", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "파이크 vs 소라카 화면으로 이동", exact: true })).toHaveCount(0);
});
