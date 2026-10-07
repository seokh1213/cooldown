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
