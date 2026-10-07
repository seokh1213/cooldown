import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const directory = path.resolve('research/llm-evals/workflow/reports/review-20261007');
const url = pathToFileURL(path.join(directory, 'review.html')).href;

test('blocked browser storage still permits a complete decision export', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); }; });
  await page.goto(url);
  await page.getByRole('radio', { name: '틀림', exact: true }).check();
  await expect(page.getByRole('status')).toContainText('브라우저 저장이 막혔습니다');
  await page.getByRole('button', { name: '판정 결과 복사' }).click();
  const exported = JSON.parse(await page.getByLabel('복사할 JSON').inputValue());
  expect(exported.decisions.filter((row: { verdict: string }) => row.verdict === 'wrong')).toHaveLength(1);
  await page.getByLabel('판정 불러오기').setInputFiles({ name: 'review.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)) });
  await expect(page.getByRole('status')).toContainText('불러왔지만 브라우저 저장이 막혔습니다');
  await expect(page.getByRole('radio', { name: '틀림', exact: true })).toBeChecked();
});

test('standalone decisions persist, copy, download and import with provenance checks', async ({ page }) => {
  await page.goto(url);
  await expect(page.locator('#queue button')).toHaveCount(41);
  await page.getByLabel('검수 종류').selectOption('scope');
  await expect(page.locator('#queue button')).toHaveCount(31);
  await expect(page.getByLabel('원하는 답변 범위')).toBeVisible();
  for (const name of ['맞음', '틀림', '미판정', '판단 보류']) {
    await page.getByRole('radio', { name, exact: true }).check();
    await expect(page.getByRole('radio', { name, exact: true })).toBeChecked();
  }
  await page.getByLabel('진행 상태').selectOption('uncertain');
  await expect(page.locator('#queue button')).toHaveCount(1);
  await page.getByLabel('진행 상태').selectOption('all');
  await page.getByText('근거와 원본 판정 기준 보기', { exact: true }).click();
  await page.getByText('기존 검사 데이터 보기', { exact: true }).click();
  await expect(page.locator('#expected')).toBeVisible();
  await page.getByRole('radio', { name: '판단 보류', exact: true }).check();
  await page.getByLabel('원하는 답변 범위').selectOption('ability');
  await page.getByLabel('수정 의견').fill('테스트용 판정. 실제 사용자 검수가 아님.');
  await page.reload();
  await expect(page.getByLabel('수정 의견')).toHaveValue('테스트용 판정. 실제 사용자 검수가 아님.');
  await page.getByRole('button', { name: '판정 결과 복사' }).click();
  const copied = JSON.parse(await page.getByLabel('복사할 JSON').inputValue());
  expect(copied.decisions).toHaveLength(41);
  expect(copied.decisions.filter((row: { verdict: string }) => row.verdict === 'uncertain')).toHaveLength(1);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON 다운로드', exact: true }).click();
  const download = await downloadEvent;
  expect(JSON.parse(await readFile((await download.path())!, 'utf8'))).toEqual(copied);
  const importFile = async (value: unknown) => page.getByLabel('판정 불러오기').setInputFiles({
    name: 'review.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)),
  });
  await importFile({ ...copied, packetHash: 'wrong-packet' });
  await expect(page.getByRole('status')).toContainText('불러오기 실패');
  const tampered = structuredClone(copied); tampered.decisions[0].inputHash = 'wrong-input';
  await importFile(tampered);
  await expect(page.getByRole('status')).toContainText('불러오기 실패');
  await page.getByLabel('수정 의견').fill('');
  await page.getByRole('radio', { name: '미판정', exact: true }).check();
  await importFile(copied);
  await expect(page.getByRole('status')).toHaveText('판정을 불러왔습니다.');
  await expect(page.getByLabel('수정 의견')).toHaveValue('테스트용 판정. 실제 사용자 검수가 아님.');
  await page.getByLabel('검수 종류').selectOption('scope');
  await page.getByLabel('진행 상태').selectOption('pending');
  await expect(page.locator('#queue button')).toHaveCount(30);
  await page.getByRole('radio', { name: '틀림', exact: true }).check();
  await expect(page.getByRole('button', { name: '다음 질문', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '다음 질문', exact: true }).click();
  await page.getByLabel('진행 상태').selectOption('all');
  await page.getByLabel('검수 종류').selectOption('matchup');
  await expect(page.locator('#queue button')).toHaveCount(10);
  await expect(page.getByLabel('원하는 답변 범위')).toBeHidden();
  const question = await page.locator('#question').textContent();
  await page.getByRole('button', { name: '다음 질문', exact: true }).click();
  await expect(page.locator('#question')).not.toHaveText(question!);
  await expect(page.locator('#question')).toBeFocused();
  await page.getByRole('button', { name: '이전 질문', exact: true }).click();
  await expect(page.locator('#question')).toHaveText(question!);
  await page.getByLabel('질문 찾기').fill('존재하지않는질문xyz');
  await expect(page.locator('#queue')).toContainText('이 조건의 질문이 없습니다');
  await expect(page.locator('main')).toBeHidden();
  await page.getByLabel('질문 찾기').fill('');
  await expect(page.locator('main')).toBeVisible();
});

test('Korean questions, answers and evidence preserve original decisions and exports', async ({ page }, testInfo) => {
  const legacy = JSON.parse(await readFile('tests/fixtures/review/legacy-decision.json', 'utf8'));
  await page.addInitScript(value => localStorage.setItem(`cooldown-review:${value.packetHash}`, JSON.stringify(value)), legacy);
  await page.goto(url);
  await expect(page.locator('#question')).toHaveText('오공의 기본 소개와 스킬을 둘 다 설명해 줄래요?');
  await expect(page.getByRole('radio', { name: '틀림', exact: true })).toBeChecked();
  await expect(page.getByLabel('수정 의견')).toHaveValue(legacy.decisions[0].note);
  await expect(page.locator('#answers .answer').first()).toContainText('기본 능력치 (1레벨)');
  await expect(page.locator('#answers .answer').first()).toContainText('체력: 610');
  await expect(page.locator('#historical')).toHaveText('기존 기대 분류: 챔피언 개요 / 실제 분류: 전체 스킬');
  await page.getByText('질문 원문 보기', { exact: true }).click();
  await expect(page.locator('#question-original p')).toHaveText(legacy.decisions[0].question);
  await page.locator('#answers summary').first().click();
  await expect(page.locator('#answers pre').first()).toContainText('Wukong · Fighter · Tank · melee');
  await page.getByRole('button', { name: '판정 결과 복사' }).click();
  const exported = JSON.parse(await page.getByLabel('복사할 JSON').inputValue());
  expect(exported.packetHash).toBe(legacy.packetHash);
  expect(exported.decisions.find((row: { id: string }) => row.id === legacy.decisions[0].id)).toEqual(legacy.decisions[0]);
  await page.getByLabel('질문 찾기').fill('위의 두 챔피언');
  await expect(page.locator('#queue button')).toHaveCount(1);
  await expect(page.locator('#question')).toContainText('마법 저항력만 비교');
  await expect(page.locator('#answers .answer').first()).toContainText('여기서는 그 요청을 해결할 수 없어요');
  await page.getByLabel('질문 찾기').fill('孙悟空的血量表看懂了');
  await expect(page.locator('#question')).toHaveText('오공의 체력 표는 이해했어요. 이번 답변에서는 P Q W E R을 설명해 주세요.');
  await expect(page.locator('#answers .answer').first()).toContainText('P 바위 피부');
  await page.locator('#answers summary').first().click();
  await expect(page.locator('#answers pre').first()).toContainText('齐天大圣');
  await page.screenshot({ path: testInfo.outputPath('review-translated.png'), fullPage: true });
  await page.getByLabel('질문 찾기').fill('keep losing to Dr. Mundo');
  await page.getByText('근거와 원본 판정 기준 보기', { exact: true }).click();
  await expect(page.locator('#evidence')).toContainText('최대 체력의 0.35%를 5초마다 재생');
  await expect(page.locator('#evidence')).toContainText('문도 박사');
  await expect(page.locator('#expected-korean')).toHaveText('기존 기대 답변 범위: 상대하는 법');
  await page.getByText('스킬 근거 원문 보기', { exact: true }).click();
  await expect(page.locator('#evidence-original pre')).toContainText('Wukong gains (6 ~ 10) Armor');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('mobile reflow, keyboard access and light/dark contrast', async ({ page }, testInfo) => {
  await page.goto(url);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '질문으로 이동' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#question')).toBeFocused();
  const checks = await page.evaluate(() => {
    const luminance = (color: string) => {
      const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => {
        const v = value / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
      });
      return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    };
    const contrast = (fg: string, bg: string) => {
      const a = luminance(fg), b = luminance(bg); return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    };
    const controls = [...document.querySelectorAll<HTMLElement>('button, select, input[type=search], .file')];
    const text = [...document.querySelectorAll<HTMLElement>('h1, #guidance, #summary, #copy, #question')];
    return { overflow: document.documentElement.scrollWidth > innerWidth,
      smallTargets: controls.filter(e => !e.hidden && e.offsetHeight && e.getBoundingClientRect().height < 44).length,
      contrasts: text.map(e => {
        const style = getComputedStyle(e); let parent: HTMLElement | null = e, bg = 'rgba(0, 0, 0, 0)';
        while (parent && bg === 'rgba(0, 0, 0, 0)') { bg = getComputedStyle(parent).backgroundColor; parent = parent.parentElement; }
        return { id: e.id || e.tagName, ratio: contrast(style.color, bg) };
      }) };
  });
  expect(checks.overflow).toBe(false); expect(checks.smallTargets).toBe(0);
  for (const row of checks.contrasts) expect(row.ratio, row.id).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({ path: testInfo.outputPath('review.png'), fullPage: true });
});
