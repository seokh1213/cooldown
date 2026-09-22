/**
 * 백과가 쓰는 시트를 스플래시 직후에 다 받아 둔다
 *
 * 목록 화면 넷은 저마다 시트 한 장으로 그린다 — 챔피언·아이템·룬·소환사 주문.
 * 그 화면에 들어간 다음에 받으면 그때 자리맡이 보이므로, 앱이 뜨고 **손이 빈 틈에**
 * 미리 받는다. 스플래시가 지나고 첫 화면이 그려진 뒤라 지금 보여야 할 것과 다투지
 * 않고, 나중에 백과를 열면 이미 와 있다.
 *
 * 한때 챔피언과 룬만 서비스워커 설치 목록에 넣어 두었다. 시트마다 AVIF 사본이
 * 생기면서 그 길을 접었다 — 설치 목록은 꼴을 못 가려 둘 다 받는데 브라우저는 하나만
 * 쓴다. 여기서는 브라우저가 고른 꼴 하나만 받는다.
 *
 * 스킬 띠(`ability/<id>.webp`)는 받지 않는다. 173장 660KB 인데 한 화면이 쓰는 것은
 * 두 장뿐이라, 미리 받으면 안 볼 것을 잔뜩 받는다.
 *
 * 받지 않는 경우가 있다.
 *   데이터 절약   사용자가 켜 두었으면 몰래 쓰지 않는다
 *   느린 회선     2G 급이면 지금 보는 화면이 먼저다
 *   재방문       서비스워커 캐시에 이미 있으면 요청 자체가 안 나간다
 */
import { sheetBackground } from "@/components/ui/sprite-icon";

/** 브라우저마다 있기도 없기도 하다. 없으면 제한을 안 걸고 받는다. */
interface NetworkInformation {
  saveData?: boolean;
  effectiveType?: string;
}

function tooExpensive(): boolean {
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (!connection) return false;
  if (connection.saveData) return true;
  return connection.effectiveType === "slow-2g" || connection.effectiveType === "2g";
}

/** 손이 빌 때를 기다린다. 없는 브라우저에서는 조금 늦춰 부른다. */
function whenIdle(run: () => void): void {
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number })
    .requestIdleCallback;
  if (idle) idle(run, { timeout: 4000 });
  else window.setTimeout(run, 1500);
}

/**
 * 화면이 실제로 그릴 주소.
 *
 * 시트 배경을 짓는 함수가 이미 꼴을 고르고 있다. 미리 받는 쪽이 따로 고르면 둘이
 * 어긋나 — 받아 둔 것은 WebP 인데 그릴 때 AVIF 를 찾는 식으로 — 미리 받은 것이
 * 통째로 헛일이 된다. 그래서 같은 함수에게 묻고 주소만 꺼낸다.
 */
function chosenUrl(webpUrl: string): string {
  const background = sheetBackground(webpUrl);
  return background.match(/url\("?([^")]+)"?\)/)?.[1] ?? webpUrl;
}

let warmed = "";

/**
 * 목록 시트 넷을 미리 받아 둔다. 한 판본에 한 번만 돈다.
 *
 * 실패해도 아무 일도 하지 않는다. 미리 받는 것은 덤이고, 못 받으면 화면에
 * 들어갈 때 받으면 된다.
 */
export function warmIcons(ddragonVersion: string): void {
  if (!ddragonVersion || warmed === ddragonVersion) return;
  warmed = ddragonVersion;
  if (tooExpensive()) return;
  whenIdle(() => {
    /*
     * `fetch` 가 아니라 `<link rel="prefetch">` 를 쓴다.
     *
     * 처음에는 `fetch` 로 받았는데 PWA 갱신 시험이 깨졌다. 서비스워커를 거치는 1MB
     * 요청이 떠 있는 동안 새 워커로 넘어가는 흐름과 부딪힌다. `prefetch` 는 브라우저가
     * 가장 낮은 우선순위로 잡고 지금 쓰는 것과 다투지 않게 스스로 미룬다. 서비스워커를
     * 거치므로 받은 것은 `cooldown-icons-v1` 에 들어간다(실측 확인).
     */
    const base = import.meta.env.BASE_URL;
    // 룬만 판본 밖에 있다. 룬 자료에 판본이 안 들어 있어 부르는 쪽이 값을 모른다.
    const sheets = [
      `${base}img/${ddragonVersion}/champions.webp`,
      `${base}img/${ddragonVersion}/items.webp`,
      `${base}img/${ddragonVersion}/summoners.webp`,
      `${base}img/runes.webp`,
    ];
    for (const sheet of sheets) {
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.as = "image";
      link.href = chosenUrl(sheet);
      document.head.append(link);
    }
  });
}
