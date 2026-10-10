import { waitForModelFreeInput } from "./support/advisor";
import { expect, test } from "@playwright/test";
import { translations } from "../src/i18n/translations";

for (const width of [390, 1280]) test(`회복 효과는 소속 스킬과 조건을 밝히고 복원에서도 유지한다: ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("./");
  await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
  const input = page.getByRole("textbox", { name: "롤 질문 입력", exact: true });
  await waitForModelFreeInput(page, input, page.getByRole("button", { name: "모델 없이 써보기", exact: true }));
  await input.fill("유미 Q 맞춰도 힐 안되나? 유미는 궁에만 힐이 있나?");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const skills = dialog.locator("[data-reference-skills]");
  const highlighted = skills.locator("[data-highlighted=true]");
  await expect(skills).toHaveCount(1);
  await expect(highlighted).toHaveCount(3);
  for (const [index, name] of ["P 야옹이 친구", "W 너랑 유미랑!", "R 대단원"].entries()) {
    await expect(highlighted.nth(index)).toContainText(name);
  }
  if (width >= 1180) await expect(dialog.locator("aside [data-reference-skills]")).toHaveCount(1);
  else await expect(dialog.locator("aside")).toHaveCount(0);
  for (const name of ["유미 P 야옹이 친구", "유미 W 너랑 유미랑!", "유미 R 대단원"]) {
    await expect(dialog.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  await expect(dialog).toContainText("Q 사르르탄 적중으로 이어지는 회복은 P 야옹이 친구의 효과");
  await expect(dialog).toContainText("4초 안에 아군에게 밀착");
  await expect(dialog).not.toContainText(/반경 200|최근 35초/);
  const markdown = dialog.locator(".space-y-2.break-words").filter({ has: page.getByRole("heading", { name: "유미 P 야옹이 친구", exact: true }) });
  await expect(markdown.getByRole("listitem")).toHaveCount(5);
  const selfHeal = markdown.getByRole("listitem").filter({ hasText: "자신을 회복합니다" });
  await expect(selfHeal).toContainText("회복량: 20~110");
  await expect(selfHeal).toContainText("주문력 계수: 30%");
  await expect(selfHeal).toContainText("재사용 대기시간: 20~8초");
  await expect(markdown.locator("p").filter({ hasText: /^계수|^대상 종류|^재사용 대기시간/ })).toHaveCount(0);
  await expect(dialog.locator('a[href^="http"], a[target="_blank"]')).toHaveCount(0);
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "유미 P 야옹이 친구", exact: true })).toBeVisible();
  await expect(skills).toHaveCount(1);
  await expect(highlighted).toHaveCount(3);
  await page.getByRole("button", { name: "새 대화", exact: true }).click();
  await input.fill("유미 R 회복은?");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(dialog.getByText("유미 R 대단원", { exact: true }).filter({ visible: true }).last()).toBeVisible();
  await expect(dialog).toContainText("아군 챔피언은 파동마다 체력을 회복");
  await page.getByRole("button", { name: "새 대화", exact: true }).click();
  await input.fill("럭스 Q 속박은?");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(dialog.getByText(/럭스 Q 빛의 속박.*군중 제어/).filter({ visible: true }).last()).toBeVisible();
  await input.fill("유미 스킬에 회복이 있어?");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  for (const name of ["유미 P 야옹이 친구", "유미 W 너랑 유미랑!", "유미 R 대단원"]) {
    await expect(dialog.getByRole("heading", { name, exact: true })).toHaveCount(1);
  }
  const latestSkills = skills.last();
  await expect(latestSkills.locator("[data-highlighted=true]")).toHaveCount(3);
  await expect(latestSkills).toContainText("P 야옹이 친구");
  await input.fill("아니 유미 스킬중에");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  for (const name of ["유미 P 야옹이 친구", "유미 W 너랑 유미랑!", "유미 R 대단원"]) {
    await expect(dialog.getByRole("heading", { name, exact: true })).toHaveCount(2);
  }
  await expect(dialog).not.toContainText(/반경 200|최근 35초/);
  await input.fill("그럼 보호막은?");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "유미 E 슈우우웅", exact: true })).toBeVisible();
  await expect(latestSkills.locator("[data-highlighted=true]")).toHaveCount(2);
  await expect(latestSkills.locator("[data-highlighted=true]").first()).toContainText("E 슈우우웅");
  await page.reload();
  await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "유미 P 야옹이 친구", exact: true })).toHaveCount(2);
  await expect(latestSkills.locator("[data-highlighted=true]")).toHaveCount(2);
});

test("오브젝트 생성·제거와 검수한 상세 수치를 구분한다", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
  const input = page.getByRole("textbox", { name: "롤 질문 입력", exact: true });
  const skip = page.getByRole("button", { name: "모델 없이 써보기", exact: true });
  await waitForModelFreeInput(page, input, skip);
  for (const [question, expected] of [
    ["바론 몇 분에 나와?", /20분.*6분/],
    ["공허 유충 몇 분에 나와?", /8분.*한 번/],
    ["아타칸 스킬이 뭐야?", /현재.*제거.*26\.1 패치/],
    ["힘의 위업 지금도 있어?", /현재.*제거.*26\.1 패치/],
    ["바론 공격력 얼마야?", /350\.5–515/],
    ["바론 18레벨 체력", /19,190/],
    ["유충 스킬 알려줘", /12초마다.*4마리/],
    ["화학공학 드래곤 공격력", /위키 50.*47.*확정하지/],
  ] as const) {
    await input.fill(question);
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    await expect(page.getByRole("dialog").getByText(expected).last()).toBeVisible();
    await page.getByRole("button", { name: "새 대화", exact: true }).click();
  }
});

test("중국어 아타칸 이름으로 제거 상태를 찾는다", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("language", "zh_CN"));
  await page.goto("./");
  await page.getByRole("button", { name: "打开英雄联盟知识助手", exact: true }).click();
  const input = page.getByRole("textbox", { name: "输入英雄联盟问题", exact: true });
  const skip = page.getByRole("button", { name: "不下载模型直接试用", exact: true });
  await waitForModelFreeInput(page, input, skip);
  await input.fill("厄塔汗现在还在游戏里吗？");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.getByRole("dialog").getByText(/目前已.*移除.*26\.1/).last()).toBeVisible();
});

for (const [lang, question, title] of [
  ["en_US", "What is Baron Nashor attack damage?", "Baron Nashor"],
  ["zh_CN", "纳什男爵的攻击力是多少？", "纳什男爵"],
] as const) test(`${lang} 화면에 선택한 챔피언이 있어도 몬스터 상세를 답한다`, async ({ page }) => {
  await page.addInitScript(locale => localStorage.setItem("language", locale), lang);
  await page.goto("./vs?a=MonkeyKing");
  const copy = translations[lang].advisor;
  await page.getByRole("button", { name: copy.open, exact: true }).click();
  const input = page.getByRole("textbox", { name: copy.questionLabel, exact: true });
  const skip = page.getByRole("button", { name: copy.consent.skipModel, exact: true });
  await waitForModelFreeInput(page, input, skip);
  await input.fill(question);
  await page.getByRole("button", { name: copy.send, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(dialog.getByText(/350\.5–515/)).toBeVisible();
});

for (const width of [390, 1280]) test(`점화 틱의 결론을 카드·대화 복원에서 보존한다: ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("./");
  await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
  const input = page.getByRole("textbox", { name: "롤 질문 입력", exact: true });
  await waitForModelFreeInput(page, input, page.getByRole("button", { name: "모델 없이 써보기", exact: true }));
  await input.fill("점화 틱 간격은?");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/약 1초 간격.*5틱/).filter({ visible: true }).last()).toBeVisible();
  const otherRule = page.getByText("점화는 진실의 시야를 주지 않으므로 은신한 대상을 드러내지 못합니다.", { exact: true });
  await expect(otherRule).not.toBeVisible();
  const otherRules = page.getByText(`▸ ${translations.ko_KR.advisor.card.restRules.replace("{count}", "8")}`, { exact: true });
  await otherRules.click();
  await expect(otherRule).toBeVisible();
  await otherRules.click();
  await expect(otherRule).not.toBeVisible();
  await expect(page.getByText(translations.ko_KR.advisor.card.verdictYes, { exact: true })).not.toBeVisible();
  await expect(dialog).not.toContainText(/5\.28|0\.833|1\.125|검토한 영상/);
  await page.reload();
  await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
  await expect(dialog.getByText("점화는 약 1초 간격으로 총 5틱의 피해를 줍니다.", { exact: true }).filter({ visible: true }).last()).toBeVisible();
  await expect(otherRule).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
