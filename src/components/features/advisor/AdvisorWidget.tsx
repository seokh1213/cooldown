/**
 * 상성 코치 진입점
 *
 * 화면 오른쪽 아래에 떠 있는 버튼과 대화 패널을 함께 들고 있다.
 * 훅은 여기서 한 번만 잡는다. 패널을 닫아도 모델을 내린다거나 대화를 잃지 않게
 * 상태를 위젯 쪽에 두고, 패널은 보여 주기만 한다.
 */
import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { useAdvisor } from "@/hooks/useAdvisor";
import { useAdvisorHistory } from "@/hooks/useAdvisorHistory";
import { useDeviceType } from "@/hooks/useDeviceType";
import { useTranslation } from "@/i18n";
import { loadAdvisorData, type AdvisorData } from "@/lib/advisor/context";
import { AdvisorPanel } from "./AdvisorPanel";

interface AdvisorWidgetProps {
  patch: string;
  /** 카드의 챔피언 아이콘을 받아 올 DDragon 버전 */
  ddragonVersion: string;
  /**
   * 열림 상태를 레이아웃에 알린다.
   * 드로어가 페이지를 옆으로 밀어야 표를 가리지 않으므로 레이아웃이 알아야 한다.
   */
  onOpenChange?: (open: boolean) => void;
}

export function AdvisorWidget({ patch, ddragonVersion, onOpenChange }: AdvisorWidgetProps) {
  const { t } = useTranslation();
  const device = useDeviceType();
  const [open, setOpen] = useState(false);
  const advisor = useAdvisor();
  // 챔피언·규칙 자료는 모델과 별개로 받는다. 저장된 대화를 되살리는 데도 필요해서
  // 패널이 아니라 위젯이 든다 — 패널은 닫혀 있을 수 있다.
  const [data, setData] = useState<AdvisorData | null>(null);
  const history = useAdvisorHistory(advisor, data);

  useEffect(() => {
    let alive = true;
    void loadAdvisorData(patch)
      .then((loaded) => {
        if (alive) setData(loaded);
      })
      .catch(() => {
        // 자료를 못 받아도 대화는 되게 둔다. 근거 없이 답하지 말라는 지시는 페르소나에 있다.
      });
    return () => {
      alive = false;
    };
  }, [patch]);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  /**
   * 모델을 권할 만한 기기인지.
   *
   * 모바일에서는 권하지 않는다. 모델이 3GB 라 셀룰러로 받으면 요금이 나가고,
   * 휴대폰 브라우저가 한 출처에 주는 저장 공간은 그보다 작은 경우가 많아 받다가
   * 끊긴다. 받아도 WebGPU 를 제대로 주는 모바일 브라우저가 드물다.
   * 화면 폭으로 가른다(768px). user agent 로 기기를 맞히는 것보다 틀릴 일이 적다.
   *
   * WebGPU 가 없으면 데스크톱에서도 권하지 않는다. 받아 놓고 WASM 으로 떨어지면
   * 3GB 를 쓰고도 답을 못 받는다.
   *
   * **위젯을 감추지는 않는다.** 챔피언·아이템·규칙 조회는 모델 없이 코드가 답하고,
   * 평가에서 적중 63/66 으로 모델(64/66)과 거의 같았다. 내려받을 수 없는 기기라고
   * 해서 그 답까지 뺏을 이유가 없다. 막는 것은 내려받기지 기능이 아니다.
   */
  const canUseModel = device === "desktop" && advisor.webgpu?.supported === true;

  /**
   * 이미 동의한 사용자는 앱이 뜨는 순간부터 모델을 올린다.
   *
   * 예전에는 대화창을 연 뒤에 올렸다. 캐시에서 3GB 를 GPU 에 올리는 데 10초쯤 걸려,
   * 열 때마다 진행 막대를 먼저 봐야 했다. 동의는 이미 받았고 파일은 이미 기기에 있으니
   * 첫 화면이 그려진 뒤 한가할 때 올려 두면 열 때는 바로 답한다.
   * 동의 전에는 절대 올리지 않는다 — 워커를 만드는 순간 내려받기가 시작된다.
   */
  const { consented, ensureLoaded } = advisor;
  useEffect(() => {
    if (!consented || !canUseModel) return;
    const idle = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 1500));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = idle(() => ensureLoaded());
    return () => cancel(handle);
  }, [consented, canUseModel, ensureLoaded]);

  const loadingModel = advisor.status === "downloading" || advisor.status === "warming";
  const percent =
    advisor.progress.totalBytes > 0
      ? Math.min(100, Math.round((advisor.progress.loadedBytes / advisor.progress.totalBytes) * 100))
      : 0;

  return (
    <>
      {open && (
        <AdvisorPanel
          advisor={advisor}
          data={data}
          history={history}
          patch={patch}
          ddragonVersion={ddragonVersion}
          canUseModel={canUseModel}
          onClose={() => setOpen(false)}
        />
      )}
      {/* 드로어가 열리면 이 버튼은 드로어 하단의 전송 버튼 위에 겹친다. 닫기는 드로어 헤더에 있다. */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-label={open ? t.advisor.close : t.advisor.open}
          aria-expanded={open}
          className="fixed bottom-6 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {/* 모델을 올리는 동안은 테두리가 진행률만큼 찬다. 열지 않아도 준비 상태가 보인다. */}
          {loadingModel && (
            <span
              aria-hidden
              className="absolute -inset-1 rounded-full"
              style={{
                background: `conic-gradient(var(--color-primary) ${percent}%, transparent 0)`,
                mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))",
                WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))",
                opacity: 0.55,
              }}
            />
          )}
          <MessageCircle className="h-6 w-6" />
          {advisor.status === "generating" && (
            <span className="absolute right-1 top-1 h-3 w-3 animate-pulse rounded-full bg-emerald-400" />
          )}
        </button>
      )}
    </>
  );
}
