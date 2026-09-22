/**
 * 아이콘을 미리 받아 둔다
 *
 * 챔피언 시트는 서비스워커가 설치할 때 받아 둔다(383KB). 아이템 시트는 1MB 라
 * 거기 넣지 않았다 — 아이템 화면에 안 들어갈 사람까지 받게 되기 때문이다.
 *
 * 대신 **앱이 뜨고 손이 빈 틈에** 받아 둔다. 스플래시가 지나고 첫 화면이 그려진
 * 뒤이므로 그 순간 보여야 할 것과 다투지 않고, 나중에 아이템 탭을 열면 이미 와 있다.
 *
 * 받지 않는 경우가 있다.
 *   데이터 절약   사용자가 켜 두었으면 1MB 를 몰래 쓰지 않는다
 *   느린 회선     2G 급이면 지금 보는 화면이 먼저다
 *   재방문       서비스워커 캐시에 이미 있으면 요청 자체가 안 나간다
 */

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

let warmed = "";

/**
 * 아이템 스프라이트를 미리 받아 둔다. 한 판본에 한 번만 돈다.
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
     * 가장 낮은 우선순위로 잡고 지금 쓰는 것과 다투지 않게 스스로 미룬다.
     */
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.as = "image";
    link.href = `${import.meta.env.BASE_URL}img/${ddragonVersion}/items.webp`;
    document.head.append(link);
  });
}
