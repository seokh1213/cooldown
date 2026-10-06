import { expect, type Locator, type Page } from "@playwright/test";
import { translations } from "../../src/i18n/translations";

export async function waitForModelFreeInput(page: Page, input: Locator, skip: Locator) {
  // 지원 확인 중의 버튼은 입력창으로 바뀔 수 있으므로 확인이 끝난 화면에서 선택한다.
  const enabledDownload = Object.values(translations).map(({ advisor }) =>
    page.getByRole("button", { name: advisor.consent.accept, exact: true }).and(page.locator("button:enabled")))
    .reduce((previous, next) => previous.or(next));
  await expect(input.or(enabledDownload)).toBeVisible();
  if (await skip.isVisible()) await skip.click();
  await expect(input).toBeVisible();
}
