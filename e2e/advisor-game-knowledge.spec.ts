import { waitForModelFreeInput } from "./support/advisor";
import { expect, test } from "@playwright/test";
import { translations } from "../src/i18n/translations";

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
  await expect(dialog).not.toContainText(/5\.28|0\.833|1\.125|검토한 영상/);
  await page.reload();
  await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
  await expect(dialog.getByText("점화는 약 1초 간격으로 총 5틱의 피해를 줍니다.", { exact: true }).filter({ visible: true }).last()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
