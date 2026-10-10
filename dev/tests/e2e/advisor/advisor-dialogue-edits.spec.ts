import { waitForModelFreeInput } from "../support/advisor";
import { expect, test, type Page } from "@playwright/test";

async function openAdvisor(page: Page) {
  await page.goto("./");
  await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
  const question = page.getByRole("textbox", { name: "롤 질문 입력", exact: true });
  const skip = page.getByRole("button", { name: "모델 없이 써보기", exact: true });
  await waitForModelFreeInput(page, question, skip);
  return async (text: string) => {
    await question.fill(text);
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    await expect(page.getByRole("button", { name: "중단", exact: true })).toBeHidden();
  };
}

test("제외·이름 변경을 저장하고 새로고침 뒤 남은 항목을 이어 묻는다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const ask = await openAdvisor(page);
  await ask("오공 문도 아리 체력 체젠 마저 비교");
  await ask("문도는 빼고 보여줘");
  await expect(page.getByText("아리 590", { exact: false }).last()).toBeVisible();
  await ask("체젠은 빼줘");
  let releaseHistory!: () => void;
  const historyReady = new Promise<void>(resolve => { releaseHistory = resolve; });
  await page.route("**/llm/advisor-knowledge.json", async route => {
    await historyReady;
    await route.continue();
  });
  await page.reload();
  await page.getByRole("button", { name: "롤 지식 도우미 열기", exact: true }).click();
  await page.getByRole("textbox", { name: "롤 질문 입력", exact: true }).fill("그럼 제드는?");
  try {
    await expect(page.getByText("체젠은 빼줘", { exact: true })).toHaveCount(1);
    await expect(page.getByText("이전 대화를 불러오는 중이에요. 질문을 미리 입력할 수 있어요.", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    await expect(page.getByRole("button", { name: "중단", exact: true })).toBeVisible();
  } finally {
    releaseHistory();
  }
  await expect(page.getByRole("button", { name: "중단", exact: true })).toBeHidden();
  await expect(page.getByText("제드 654", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("제드 29", { exact: true }).last()).toBeVisible();
});

test("안 돌아온 E는 추천하지 않고 정정하면 실제 궁 대응을 보여준다", async ({ page }) => {
  const ask = await openAdvisor(page);
  await ask("아리로 제드 상대할 때 내 E가 아직 안 돌아왔어. 궁 대응은?");
  await expect(page.getByText(/내 E 없이 제드 R.*다른 방법.*확인하지 못/).last()).toBeVisible();
  await expect(page.getByText(/E 매혹을 맞힙니다/)).toHaveCount(0);
  await ask("내 E가 없는 게 아니야. 상대 궁 대응은?");
  await expect(page.getByText(/매혹을 걸어 콤보를 끊/).last()).toBeVisible();
});

test("내 챔피언을 바꾸면 두 상성 카드의 관점도 바뀐다", async ({ page }) => {
  const ask = await openAdvisor(page);
  await ask("오공으로 럼블 모데 상대법 알려줘");
  await ask("내가 가렌으로 바꿨어. 상대법은?");
  await ask("둘 다 라인전은?");
  for (const enemy of ["럼블", "모데카이저"]) {
    const link = page.getByRole("link", { name: `가렌 vs ${enemy} 화면으로 이동`, exact: true }).last();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", /a=Garen&t=/);
  }
});
