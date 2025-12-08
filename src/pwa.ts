import { registerSW } from "virtual:pwa-register";

type UpdateListener = () => void;

let listeners: UpdateListener[] = [];

/**
 * 빌드 시 vite.config.ts 에서 define 한 배포 버전.
 * 어디서든 import 해서 현재 실행 중인 빌드 버전을 확인할 수 있다.
 */
export const BUILD_VERSION: string =
  import.meta.env.VITE_DEPLOYMENT_VERSION ?? "dev";

/**
 * 새 서비스 워커(새 빌드)가 감지됐을 때 호출될 리스너 등록.
 * 리스너는 PWA 업데이트가 필요하다는 "신호"만 받는다.
 * 실제로 새로고침/자동 적용 여부는 리스너 쪽에서 결정한다.
 */
export function subscribeToPWAUpdate(listener: UpdateListener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function notifyUpdateAvailable() {
  const snapshot = [...listeners];
  for (const listener of snapshot) {
    try {
      listener();
    } catch (error) {
      console.error("[PWA] update listener error:", error);
    }
  }
}

let updateSW:
  | ((reloadPage?: boolean | undefined) => Promise<void>)
  | undefined;

// 브라우저 환경에서만 서비스 워커를 등록한다.
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  updateSW = registerSW({
    immediate: true,
    /**
     * 새 서비스 워커가 "대기 상태(waiting)"에 들어가면 호출된다.
     * 이 시점에서 실제로 페이지를 리로드할지, 유저에게 물어볼지는
     * 상위 앱(React)에서 결정하도록 신호만 보낸다.
     */
    onNeedRefresh() {
      notifyUpdateAvailable();
    },
    onRegisteredSW(swUrl, registration) {
      if (import.meta.env.DEV) {
        console.log("[PWA] service worker registered:", swUrl, registration);
      }
    },
    onRegisterError(error) {
      if (import.meta.env.DEV) {
        console.error("[PWA] service worker registration error:", error);
      }
    },
  });
}

/**
 * 실제로 새 서비스 워커로 교체하고(= skipWaiting), 필요 시 페이지를 새로고침한다.
 * - reloadPage=true 이면 현재 탭을 새로고침해서 즉시 새 빌드를 사용
 * - reloadPage=false 이면 SW 만 교체하고, 라우터/데이터 로딩이 직접 새 파일을 가져오게 둘 수 있다.
 */
export function applyPWAUpdate(reloadPage = true): Promise<void> {
  if (updateSW) {
    return updateSW(reloadPage);
  }
  return Promise.resolve();
}


