import { chromium } from 'playwright';
import { join } from 'path';
import { spawn, ChildProcess } from 'child_process';
import { setTimeout } from 'timers/promises';

const OG_IMAGE_WIDTH = 1200;
const OG_IMAGE_HEIGHT = 630;
const DEV_SERVER_URL = 'http://localhost:5173';
const OG_PREVIEW_PATH = '/og-preview';

// 개발 서버 시작
async function startDevServer(): Promise<ChildProcess> {
  console.log('🚀 개발 서버 시작 중...');
  
  const server = spawn('npm', ['run', 'dev'], {
    stdio: 'pipe',
    shell: true,
    cwd: process.cwd(),
  });

  // 서버가 준비될 때까지 대기
  let serverReady = false;
  server.stdout?.on('data', (data) => {
    const output = data.toString();
    if (output.includes('Local:') || output.includes('localhost')) {
      serverReady = true;
    }
  });

  // 최대 30초 대기
  for (let i = 0; i < 60; i++) {
    if (serverReady) break;
    await setTimeout(500);
  }

  if (!serverReady) {
    throw new Error('개발 서버가 시작되지 않았습니다.');
  }

  console.log('✅ 개발 서버 준비 완료');
  // 추가 대기 시간 (리소스 로드)
  await setTimeout(2000);
  
  return server;
}

// 서버 종료
function stopDevServer(server: ChildProcess) {
  console.log('🛑 개발 서버 종료 중...');
  server.kill('SIGTERM');
}

async function generateOGImage() {
  let devServer: ChildProcess | null = null;
  
  try {
    // 개발 서버 시작
    devServer = await startDevServer();
    
    const browser = await chromium.launch({
      headless: true,
    });
    
    const page = await browser.newPage({
      viewport: {
        width: OG_IMAGE_WIDTH,
        height: OG_IMAGE_HEIGHT,
      },
    });
    
    // OG Preview 페이지로 이동
    const url = `${DEV_SERVER_URL}${OG_PREVIEW_PATH}`;
    console.log(`📸 페이지 로드 중: ${url}`);
    
    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      
      // 로고 이미지 로드 대기
      console.log('⏳ 로고 이미지 로드 대기 중...');
      try {
        await page.waitForSelector('img[alt="Poro Logo"]', { timeout: 15000 });
        console.log('✅ 로고 이미지 로드 완료');
      } catch {
        console.warn('⚠️ 로고 이미지가 로드되지 않았지만 계속 진행합니다.');
        // 페이지 상태 확인을 위한 스크린샷
        const debugPath = join(process.cwd(), 'public', 'og-debug.png');
        await page.screenshot({ path: debugPath });
        console.log(`디버그 스크린샷 저장: ${debugPath}`);
      }
      
      // 추가 대기 (CSS, 폰트, 이미지 로드)
      await setTimeout(2000);
    } catch (error) {
      console.error('❌ 페이지 로드 중 오류:', error);
      // 페이지 스크린샷을 찍어서 디버깅
      const debugPath = join(process.cwd(), 'public', 'og-error.png');
      await page.screenshot({ path: debugPath }).catch(() => {});
      console.log(`에러 스크린샷 저장: ${debugPath}`);
      throw error;
    }
    
    // 이미지로 저장
    const outputPath = join(process.cwd(), 'public', 'og-image.png');
    await page.screenshot({
      path: outputPath,
      type: 'png',
      fullPage: false,
    });
    
    await browser.close();
    
    console.log(`✅ OG 이미지 생성 완료: ${outputPath}`);
    console.log(`📐 크기: ${OG_IMAGE_WIDTH}x${OG_IMAGE_HEIGHT}px`);
  } catch (error) {
    console.error('❌ 오류 발생:', error);
    throw error;
  } finally {
    // 개발 서버 종료
    if (devServer) {
      stopDevServer(devServer);
    }
  }
}

// 실행
generateOGImage().catch((error) => {
  console.error('❌ 오류 발생:', error);
  process.exit(1);
});
