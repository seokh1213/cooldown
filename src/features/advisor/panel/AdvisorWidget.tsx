/**
 * 상성 코치 진입점
 *
 * 화면 오른쪽 아래에 떠 있는 버튼과 대화 패널을 함께 들고 있다.
 * 훅은 여기서 한 번만 잡는다. 패널을 닫아도 모델을 내린다거나 대화를 잃지 않게
 * 상태를 위젯 쪽에 두고, 패널은 보여 주기만 한다.
 */
import { useEffect, useState } from "react";
import { useAdvisor } from "@/features/advisor/session/useAdvisor";
import { useAdvisorHistory } from "@/features/advisor/session/useAdvisorHistory";
import { useDeviceType } from "@/shared/hooks/useDeviceType";
import { useTranslation } from "@/shared/i18n";
import { loadAdvisorData, type AdvisorData } from "@/features/advisor/retrieval/context";
import { canOfferModel } from "@/features/advisor/model/config";
import { AdvisorPanel } from "./AdvisorPanel";
import { AdvisorLauncher } from "./AdvisorLauncher";

export interface AdvisorWidgetProps {
  patch: string;
  /** 카드의 챔피언 아이콘을 받아 올 DDragon 버전 */
  ddragonVersion: string;
  /**
   * 열림 상태를 레이아웃에 알린다.
   * 드로어가 페이지를 옆으로 밀어야 표를 가리지 않으므로 레이아웃이 알아야 한다.
   */
  onOpenChange?: (open: boolean) => void;
  /** 드로어 폭이 바뀌면(자료 패널 접기/펴기, 화면 폭) 레이아웃이 페이지를 그만큼 민다. */
  onWidthChange?: (px: number) => void;
  initialOpen?: boolean;
}

export function AdvisorWidget({ patch, ddragonVersion, onOpenChange, onWidthChange, initialOpen = false }: AdvisorWidgetProps) {
  const { lang } = useTranslation();
  const device = useDeviceType();
  const [open, setOpen] = useState(initialOpen);
  const advisor = useAdvisor({ patch, ddragonVersion, locale: lang });
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ patch: string; lang: string; attempt: number; data?: AdvisorData; error?: boolean }>();
  const current = result?.patch === patch && result.lang === lang && result.attempt === attempt ? result : undefined;
  const data = current?.data ?? null;
  const dataError = current?.error ?? false;
  const history = useAdvisorHistory(advisor, patch);

  useEffect(() => {
    let alive = true;
    void loadAdvisorData(patch, lang)
      .then((loaded) => {
        if (alive) setResult({ patch, lang, attempt, data: loaded });
      })
      .catch(() => {
        if (alive) setResult({ patch, lang, attempt, error: true });
      });
    return () => {
      alive = false;
    };
  }, [patch, lang, attempt]);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  /**
   * 모델을 권할 만한 기기인지.
   *
   * 모바일에서는 권하지 않는다. 모델이 570MB 라 셀룰러로 받으면 요금이 나가고,
   * 휴대폰 브라우저가 한 출처에 주는 저장 공간은 그보다 작은 경우가 많아 받다가
   * 끊긴다. 받아도 WebGPU 를 제대로 주는 모바일 브라우저가 드물다.
   * 화면 폭으로 가른다(768px). user agent 로 기기를 맞히는 것보다 틀릴 일이 적다.
   *
   * WebGPU 가 없으면 데스크톱에서도 권하지 않는다. 받아 놓고 WASM 으로 떨어지면
   * 모델(570MB)을 쓰고도 답을 못 받는다.
   *
   * **위젯을 감추지는 않는다.** 챔피언·아이템·규칙 조회는 모델 없이 코드가 답하고,
   * 평가에서 적중 63/66 으로 모델(64/66)과 거의 같았다. 내려받을 수 없는 기기라고
   * 해서 그 답까지 뺏을 이유가 없다. 막는 것은 내려받기지 기능이 아니다.
   */
  /*
   * 16비트 셰이더 연산(`shader-f16`)은 **그 모델이 필요로 할 때만** 따진다.
   *
   * (q4f16 모델을 쓰던 때) 없는 기기에서 올리면 임베딩의 Gather 에서
   * 죽었다 — 윈도우에서 실제로 그랬다.
   *
   *   Gather requires f16 but the device does not support it.
   *
   * 지금 모델은 q4 라 16비트를 안 쓰므로(`needsF16: false`) 이 관문이 없다.
   */
  const canUseModel = canOfferModel(advisor.model, advisor.webgpu, device);

  /**
   * 이미 동의한 사용자는 앱이 뜨는 순간부터 모델을 올린다.
   *
   * 예전에는 대화창을 연 뒤에 올렸다. 캐시에서 모델(570MB)을 GPU 에 올리는 데 10초쯤 걸려,
   * 열 때마다 진행 막대를 먼저 봐야 했다. 동의는 이미 받았고 파일은 이미 기기에 있으니
   * 첫 화면이 그려진 뒤 한가할 때 올려 두면 열 때는 바로 답한다.
   * 동의 전에는 절대 올리지 않는다 — 워커를 만드는 순간 내려받기가 시작된다.
   */
  const { consented, ensureLoaded } = advisor;
  useEffect(() => {
    if (!consented || !canUseModel) return;
    // timeout 을 꼭 준다. 없으면 브라우저가 한가하지 않다고 보는 동안(탭이 뒤에 있거나
    // 표가 계속 그려지는 동안) 콜백을 무한정 미뤄, 대화창을 여는 순간에야 올라가기 시작했다.
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(() => ensureLoaded(), { timeout: 2000 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(() => ensureLoaded(), 1500);
    return () => window.clearTimeout(handle);
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
          dataError={dataError}
          onRetryData={() => setAttempt((value) => value + 1)}
          history={history}
          patch={patch}
          ddragonVersion={ddragonVersion}
          canUseModel={canUseModel}
          modelSupportPending={device === "desktop" && advisor.webgpu === null}
          onClose={() => setOpen(false)}
          onWidthChange={onWidthChange}
        />
      )}
      {/* 드로어가 열리면 이 버튼은 드로어 하단의 전송 버튼 위에 겹친다. 닫기는 드로어 헤더에 있다. */}
      {!open && (
        <AdvisorLauncher onClick={() => setOpen(true)} loadingModel={loadingModel} percent={percent} generating={advisor.status === "generating"} />
      )}
    </>
  );
}
